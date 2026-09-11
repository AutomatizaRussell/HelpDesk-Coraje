"use server";

import { redirect } from "next/navigation";

import { requireRedireccionAuth } from "@/features/redireccion/data/redireccionAuth";
import { prisma } from "@/lib/prisma";

/**
 * Valida de forma mínima un UUID recibido desde formulario.
 *
 * No restringimos versión UUID aquí porque PostgreSQL ya valida el tipo UUID
 * cuando hacemos casts `::uuid` en las consultas. Esta función solo bloquea
 * valores claramente inválidos antes de llegar a la base de datos.
 */
function assertUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  const isValid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalizedValue,
    );

  if (!isValid) {
    throw new Error(`${fieldName} inválido: ${normalizedValue}`);
  }

  return normalizedValue;
}

/**
 * Dispara el workflow n8n que procesa la cola outbox.
 *
 * Este webhook NO es la fuente de verdad. Solo despierta a n8n.
 * La fuente de verdad sigue siendo PostgreSQL:
 *
 *   helpdesk.ticket_sync_outbox
 *
 * Si n8n está caído, lento o responde error, no se rompe la redirección del
 * empleado. El registro ya quedó PENDING y el trigger de respaldo en n8n
 * deberá recogerlo después.
 */
async function kickOutboxWorkflow(): Promise<void> {
  const url = process.env.N8N_OUTBOX_KICK_URL;
  const secret = process.env.N8N_OUTBOX_KICK_SECRET;

  if (!url || !secret) {
    console.warn(
      "N8N_OUTBOX_KICK_URL o N8N_OUTBOX_KICK_SECRET no están configuradas. El outbox queda pendiente para procesamiento posterior.",
    );
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 3000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-coraje-secret": secret,
      },
      body: JSON.stringify({
        source: "coraje-web",
        event: "ticket_redirected",
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("n8n outbox kick respondió con estado no exitoso.", {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    console.warn(
      "No se pudo disparar n8n outbox kick. El cron fallback debe procesar el outbox.",
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Redirige un ticket creado desde el portal hacia un área legacy válida.
 *
 * Reglas actuales:
 * - Solo empleado autenticado temporalmente puede ejecutar.
 * - El ticket debe venir de PORTAL_CLIENTE.
 * - El ticket debe estar ABIERTO.
 * - El ticket no debe tener área destino previa.
 * - El id_tipo_req seleccionado debe pertenecer al área seleccionada.
 * - El área que se guarda en fact_ticket sigue siendo la compatible con
 *   PowerApps/SharePoint.
 * - El encargado interno se resuelve así:
 *     1. Si existe helpdesk.routing_rule activa para id_tipo_req, usa esa regla.
 *     2. Si no existe regla, usa core.dim_area.encargado_recepcion.
 * - Se crea un registro PENDING en ticket_sync_outbox con operación CREATE_TICKET.
 * - Después del commit, se dispara un webhook kick de n8n para procesar la cola.
 *
 * Importante:
 * Esta acción NO escribe directamente en SharePoint.
 */
export async function redirectTicketAction(formData: FormData) {
  await requireRedireccionAuth();

  const ticketId = assertUuid(String(formData.get("ticketId") ?? ""), "ticketId");
  const areaId = assertUuid(String(formData.get("areaId") ?? ""), "areaId");
  const tipoReqId = assertUuid(
    String(formData.get("tipoReqId") ?? ""),
    "tipoReqId",
  );

  await prisma.$transaction(async (tx) => {
    /**
     * 1. Validar que el tipo de requerimiento pertenece al área seleccionada.
     */
    const tipoReq = await tx.dimTipoRequerimiento.findFirst({
      where: {
        idTipoReq: tipoReqId,
        idArea: areaId,
      },
      select: {
        idTipoReq: true,
        idArea: true,
      },
    });

    if (!tipoReq) {
      throw new Error(
        "El tipo de requerimiento seleccionado no pertenece al área elegida.",
      );
    }

    /**
     * 2. Validar que el ticket aún está disponible para redirección.
     */
    const ticket = await tx.factTicket.findFirst({
      where: {
        idTicket: ticketId,
        origenSistema: "PORTAL_CLIENTE",
        idAreaDestino: null,
        dimEstado: {
          nombreEstado: "ABIERTO",
        },
      },
      select: {
        idTicket: true,
      },
    });

    if (!ticket) {
      throw new Error(
        "El ticket no existe, ya fue redirigido o no está disponible para redirección.",
      );
    }

    /**
     * 3. Resolver encargado interno.
     */
    const encargadoRows = await tx.$queryRaw<
      { encargado_interno: string | null }[]
    >`
      SELECT
          COALESCE(rr.encargado_interno, a.encargado_recepcion) AS encargado_interno
      FROM helpdesk.dim_tipo_requerimiento tr
      JOIN core.dim_area a
          ON a.id_area = tr.id_area
      LEFT JOIN helpdesk.routing_rule rr
          ON rr.id_tipo_req = tr.id_tipo_req
         AND rr.activo = TRUE
      WHERE tr.id_tipo_req = ${tipoReqId}::uuid
        AND tr.id_area = ${areaId}::uuid
      LIMIT 1;
    `;

    const encargadoInterno = encargadoRows[0]?.encargado_interno ?? null;

    /**
     * 4. Actualizar el ticket.
     */
    await tx.$executeRaw`
      UPDATE helpdesk.fact_ticket
      SET
          id_area_destino = ${areaId}::uuid,
          id_tipo_req = ${tipoReqId}::uuid,
          encargado_interno = ${encargadoInterno ?? ""}::text,
          ultima_actualizacion = NOW()
      WHERE id_ticket = ${ticketId}::uuid
        AND origen_sistema = 'PORTAL_CLIENTE'
        AND id_area_destino IS NULL;
    `;

    /**
     * 5. Insertar intención de sincronización.
     *
     * Este registro deja la tarea lista para n8n.
     */
    await tx.$executeRaw`
      INSERT INTO helpdesk.ticket_sync_outbox (
          id_ticket,
          operation,
          status,
          target_system,
          payload
      )
      VALUES (
          ${ticketId}::uuid,
          'CREATE_TICKET',
          'PENDING',
          'SHAREPOINT',
          jsonb_build_object(
              'source', 'CORAJE_PORTAL',
              'id_ticket', ${ticketId}::text,
              'id_area_destino', ${areaId}::text,
              'id_tipo_req', ${tipoReqId}::text,
              'encargado_interno', ${encargadoInterno ?? ""}::text
          )
      )
      ON CONFLICT (id_ticket, operation)
      WHERE status IN ('PENDING', 'PROCESSING')
      DO NOTHING;
    `;
  });

  /**
   * El webhook se dispara fuera de la transacción.
   *
   * Si n8n falla, la acción no debe fallar porque PostgreSQL ya quedó con
   * el registro PENDING. El workflow n8n debe tener cron fallback.
   */
  await kickOutboxWorkflow();

  redirect("/redireccion");
}
