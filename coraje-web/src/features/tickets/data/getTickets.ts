import { prisma } from "@/lib/prisma";
import type { TicketListItem } from "../types";

/**
 * Obtiene los tickets recientes para la vista operativa principal.
 *
 * Decisiones técnicas:
 * - Consulta directa server-side mediante Prisma.
 * - No expone el modelo Prisma completo a la UI.
 * - Traduce nombres semánticos camelCase del cliente Prisma a los campos de
 *   TicketListItem.
 * - Usa fallbacks explícitos para relaciones opcionales que pueden venir
 *   incompletas desde la migración legacy.
 */
export async function getRecentTickets(limit = 25): Promise<TicketListItem[]> {
  const tickets = await prisma.factTicket.findMany({
    take: limit,
    orderBy: {
      fechaCreacion: "desc",
    },
    select: {
      idTicket: true,
      codigoTicket: true,
      descripcionProblema: true,
      fechaCreacion: true,
      fechaLimite: true,
      fechaResolucion: true,
      origenSistema: true,

      dimEstado: {
        select: {
          nombreEstado: true,
        },
      },

      dimPrioridad: {
        select: {
          nombrePrioridad: true,
        },
      },

      dimArea: {
        select: {
          nombreArea: true,
        },
      },

      dimClienteContai: {
        select: {
          nombreCliente: true,
        },
      },

      dimTipoRequerimiento: {
        select: {
          tipoRequerimiento: true,
          categoria1: true,
          categoria2: true,
        },
      },
    },
  });

  return tickets.map((ticket) => ({
    idTicket: ticket.idTicket,
    codigoTicket: ticket.codigoTicket,
    descripcion: ticket.descripcionProblema,

    cliente: ticket.dimClienteContai?.nombreCliente ?? "Sin cliente",
    area: ticket.dimArea?.nombreArea ?? "Sin área",
    estado: ticket.dimEstado.nombreEstado,
    prioridad: ticket.dimPrioridad?.nombrePrioridad ?? "Sin prioridad",

    tipoRequerimiento:
      ticket.dimTipoRequerimiento?.tipoRequerimiento ?? "Sin tipo",
    categoria1: ticket.dimTipoRequerimiento?.categoria1 ?? "Sin categoría",
    categoria2:
      ticket.dimTipoRequerimiento?.categoria2 ?? "Sin subcategoría",

    fechaCreacion: ticket.fechaCreacion,
    fechaLimite: ticket.fechaLimite,
    fechaResolucion: ticket.fechaResolucion,
    origenSistema: ticket.origenSistema,
  }));
}
