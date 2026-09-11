"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { CLIENT_COOKIE_NAME } from "@/features/portal/data/getSelectedClient";

/**
 * Crea un ticket desde el portal de clientes.
 *
 * Reglas actuales:
 * - cliente viene de cookie temporal;
 * - estado inicial = ABIERTO;
 * - prioridad = MEDIA;
 * - fecha_creacion = default PostgreSQL;
 * - fecha_limite = CURRENT_DATE + días_sla de prioridad MEDIA en calendario hábil colombiano;
 * - origen_sistema = PORTAL_CLIENTE;
 * - no se asigna área, tipo ni responsable todavía.
 */
export async function createPortalTicketAction(formData: FormData) {
  const descripcion = String(formData.get("descripcion") ?? "").trim();

  if (descripcion.length < 10) {
    throw new Error("El requerimiento debe tener al menos 10 caracteres.");
  }

  const cookieStore = await cookies();
  const clientId = cookieStore.get(CLIENT_COOKIE_NAME)?.value;

  if (!clientId) {
    redirect("/portal");
  }

  await prisma.$transaction(async (tx) => {
    const estadoAbierto = await tx.dimEstado.findUnique({
      where: {
        nombreEstado: "ABIERTO",
      },
      select: {
        idEstado: true,
      },
    });

    if (!estadoAbierto) {
      throw new Error("No existe el estado ABIERTO en helpdesk.dim_estado.");
    }

    const prioridadMedia = await tx.dimPrioridad.findUnique({
      where: {
        nombrePrioridad: "MEDIA",
      },
      select: {
        idPrioridad: true,
        diasSla: true,
      },
    });

    if (!prioridadMedia) {
      throw new Error("No existe la prioridad MEDIA en helpdesk.dim_prioridad.");
    }

    // SQL crudo: el alias de columna es de la fila devuelta, no un campo del
    // modelo Prisma — se queda en snake_case a propósito.
    const fechaLimiteRows = await tx.$queryRaw<{ fecha_limite: Date }[]>`
      SELECT core.add_colombia_business_days(
        CURRENT_DATE,
        ${prioridadMedia.diasSla}
      )::timestamptz AS fecha_limite
    `;

    const fechaLimite = fechaLimiteRows[0]?.fecha_limite;

    if (!fechaLimite) {
      throw new Error("No fue posible calcular la fecha límite del ticket.");
    }

    await tx.factTicket.create({
      data: {
        descripcionProblema: descripcion,
        idClienteContai: clientId,
        idEstado: estadoAbierto.idEstado,
        idPrioridad: prioridadMedia.idPrioridad,
        fechaLimite: fechaLimite,
        origenSistema: "PORTAL_CLIENTE",
      },
    });
  });

  redirect("/portal/tickets");
}