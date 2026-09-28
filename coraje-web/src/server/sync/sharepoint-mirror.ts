import { after } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * Espejo en SharePoint de los tickets de HelpDesk (U9,
 * docs/specs/sincronizacion-sharepoint.md §4.3).
 *
 * Lo que **no** hace este módulo: decidir qué se envía. El trigger
 * `helpdesk.trg_encolar_espejo_sharepoint` encola el cambio en la misma
 * transacción que lo produce, sin que ningún comando tenga que acordarse, y
 * `helpdesk.item_espejo_sharepoint` arma el ítem. Aquí solo quedan dos cosas:
 * despertar a n8n y leer el estado para mostrarlo.
 */

const KICK_TIMEOUT_MS = 3000;

/**
 * Despierta el workflow de salida para que envíe lo encolado ahora y no en
 * su próxima pasada programada.
 *
 * Corre con `after()`, cuando la respuesta ya salió: la persona no espera a
 * n8n. Y **no puede fallar la acción**: el webhook despierta, no es el
 * mecanismo. Si n8n está caído o la variable falta, la fila sigue PENDING en
 * PostgreSQL y la pasada programada la recoge (§2.2). Con el espejo apagado,
 * la salida no envía nada aunque se la despierte.
 */
export function kickSharePointMirror(): void {
  after(async () => {
    const url = process.env.N8N_OUTBOX_KICK_URL;
    const secret = process.env.N8N_OUTBOX_KICK_SECRET;
    if (!url || !secret) {
      console.warn("[espejo] N8N_OUTBOX_KICK_URL o N8N_OUTBOX_KICK_SECRET no están configuradas; el envío espera a la pasada programada.");
      return;
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-coraje-secret": secret },
        body: JSON.stringify({ source: "helpdesk-web", event: "ticket_changed" }),
        signal: AbortSignal.timeout(KICK_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!response.ok) console.warn(`[espejo] n8n respondió ${response.status} al despertar la salida.`);
    } catch (error) {
      console.warn("[espejo] No se pudo despertar la salida; la pasada programada la recogerá.", error);
    }
  });
}

export interface MirrorStatus {
  /** El espejo está encendido (helpdesk.espejo_sharepoint). */
  activo: boolean;
  /** Id del ítem en HelpDeskBd, si ya existe. */
  spId: number | null;
  /** Último envío: estado de la cola y error, si lo hubo. */
  ultimoEnvio: { operacion: string; estado: string; error: string | null; fecha: Date } | null;
  /** Cambios hechos en PowerApps sobre este ticket, aplicados o rechazados. */
  divergencias: {
    id: string;
    campo: string;
    valorSharepoint: string | null;
    resultado: "APLICADO" | "RECHAZADO";
    motivo: string | null;
    fecha: Date;
  }[];
}

/**
 * Estado del espejo de un ticket, para el equipo. Solo tiene sentido en
 * tickets cuyo dueño es HelpDesk; quien llama ya comprobó que la persona
 * puede consultar el ticket.
 */
export async function getMirrorStatus(idTicket: string): Promise<MirrorStatus> {
  const [config, ref, envio, divergencias] = await Promise.all([
    prisma.espejoSharepoint.findUnique({ where: { id: true }, select: { activoDesde: true } }),
    prisma.ticketLegacySharepointRef.findUnique({ where: { idTicket }, select: { spId: true } }),
    prisma.ticketSyncOutbox.findFirst({
      where: { idTicket },
      orderBy: { createdAt: "desc" },
      select: { operation: true, status: true, lastError: true, updatedAt: true },
    }),
    prisma.syncDivergencia.findMany({
      where: { idTicket },
      orderBy: { detectadoAt: "desc" },
      take: 20,
      select: { id: true, campo: true, valorSharepoint: true, resultado: true, motivo: true, detectadoAt: true },
    }),
  ]);
  return {
    activo: config?.activoDesde != null,
    spId: ref?.spId ?? null,
    ultimoEnvio: envio
      ? { operacion: envio.operation, estado: envio.status, error: envio.lastError, fecha: envio.updatedAt }
      : null,
    divergencias: divergencias.map((row) => ({
      id: row.id,
      campo: row.campo,
      valorSharepoint: row.valorSharepoint,
      // El CHECK de la tabla solo admite estos dos valores.
      resultado: row.resultado === "APLICADO" ? "APLICADO" : "RECHAZADO",
      motivo: row.motivo,
      fecha: row.detectadoAt,
    })),
  };
}
