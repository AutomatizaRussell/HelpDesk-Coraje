import { prisma } from "@/lib/prisma";
import { resolveGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import { isTicketWithinScope } from "@/server/authorization/scope";

import { PORTAL_ORIGIN } from "./ticket-state";

/**
 * Lecturas de la cola de clasificación (T3): los tickets del portal que
 * todavía no tienen área.
 *
 * Esta cola no pasa por `ticket.consultar`, a propósito: un ticket sin
 * clasificar no tiene responsable ni área, así que ningún alcance de consulta
 * de la v1 lo cubre. Quien la ve es quien puede redirigir, y se decide con la
 * misma regla que aplicará el comando (`redirectTicket`): `ticket.redirigir`
 * evaluado con `isTicketWithinScope`.
 *
 * Todos los tickets de la cola tienen la misma forma frente al alcance —sin
 * solicitante interno, sin responsable, sin área—, así que una sola
 * evaluación vale para todos, y el filtro de la cola va en la consulta SQL.
 */

const UNCLASSIFIED_SHAPE = { idSolicitante: null, idAsignado: null, idAreaDestino: null, idObservadores: [] } as const;

/** Tamaño de la cola por página. Es trabajo pendiente, no un histórico. */
export const CLASSIFICATION_PAGE_SIZE = 100;

async function canClassify(idPersonal: string): Promise<boolean> {
  const grant = await resolveGrant(idPersonal, TICKET_ACTIONS.redirigir);
  return (
    grant !== null &&
    isTicketWithinScope({ alcance: grant.alcance, action: TICKET_ACTIONS.redirigir, actor: grant.actor, ticket: UNCLASSIFIED_SHAPE })
  );
}

const UNCLASSIFIED_WHERE = {
  origenSistema: PORTAL_ORIGIN,
  idAreaDestino: null,
  dimEstado: { nombreEstado: "ABIERTO" },
} as const;

export interface UnclassifiedRow {
  idTicket: string;
  descripcion: string;
  fechaCreacion: Date;
  contacto: string;
  cliente: string;
}

/**
 * La cola, del más antiguo al más reciente: lo que lleva más tiempo sin
 * clasificar va primero. `null` si la persona no puede clasificar.
 */
export async function listUnclassified(idPersonal: string): Promise<UnclassifiedRow[] | null> {
  if (!(await canClassify(idPersonal))) return null;
  const tickets = await prisma.factTicket.findMany({
    where: UNCLASSIFIED_WHERE,
    orderBy: { fechaCreacion: "asc" },
    take: CLASSIFICATION_PAGE_SIZE,
    select: {
      idTicket: true,
      descripcionProblema: true,
      fechaCreacion: true,
      portalContacto: { select: { nombre: true } },
      dimClienteContai: { select: { nombreCliente: true } },
    },
  });
  return tickets.map((ticket) => ({
    idTicket: ticket.idTicket,
    descripcion: ticket.descripcionProblema,
    fechaCreacion: ticket.fechaCreacion,
    contacto: ticket.portalContacto?.nombre ?? "Contacto",
    cliente: ticket.dimClienteContai?.nombreCliente ?? "Cliente",
  }));
}

export interface UnclassifiedDetail extends UnclassifiedRow {
  identificacionFiscal: string | null;
}

/**
 * Un ticket de la cola, o `null` si no existe, ya se clasificó o la persona
 * no puede clasificar. Las tres respuestas son iguales.
 */
export async function getUnclassifiedTicket(params: { idPersonal: string; idTicket: string }): Promise<UnclassifiedDetail | null> {
  if (!(await canClassify(params.idPersonal))) return null;
  const ticket = await prisma.factTicket.findFirst({
    where: { idTicket: params.idTicket, ...UNCLASSIFIED_WHERE },
    select: {
      idTicket: true,
      descripcionProblema: true,
      fechaCreacion: true,
      portalContacto: { select: { nombre: true } },
      dimClienteContai: { select: { nombreCliente: true, identificacionFiscal: true } },
    },
  });
  if (!ticket) return null;
  return {
    idTicket: ticket.idTicket,
    descripcion: ticket.descripcionProblema,
    fechaCreacion: ticket.fechaCreacion,
    contacto: ticket.portalContacto?.nombre ?? "Contacto",
    cliente: ticket.dimClienteContai?.nombreCliente ?? "Cliente",
    identificacionFiscal: ticket.dimClienteContai?.identificacionFiscal ?? null,
  };
}
