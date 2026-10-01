import { cache } from "react";

import { prisma } from "@/lib/prisma";
import { resolveGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import { isTicketWithinScope } from "@/server/authorization/scope";

import { PORTAL_ORIGIN } from "./ticket-state";

/**
 * Lecturas de los tickets por redirigir (T3): lo que los clientes radicaron
 * en el portal y todavía no tiene área. Hasta el 01-oct-2026 se llamaba
 * «clasificación» y tenía una sección propia; desde U17 es la vista «Por
 * redirigir» de la bandeja en modo Coraje (`listInbox`).
 *
 * Estos tickets no pasan por `ticket.consultar`, a propósito: un ticket sin
 * redirigir no tiene responsable ni área, así que ningún alcance de consulta
 * de la v1 lo cubre. Quien los ve es quien puede redirigir, y se decide con
 * la misma regla que aplicará el comando (`redirectTicket`):
 * `ticket.redirigir` evaluado con `isTicketWithinScope`.
 *
 * Todos tienen la misma forma frente al alcance —sin solicitante interno, sin
 * responsable, sin área—, así que una sola evaluación vale para todos, y el
 * filtro va en la consulta SQL.
 */

const UNREDIRECTED_SHAPE = { idSolicitante: null, idAsignado: null, idAreaDestino: null, idTipoReq: null, idObservadores: [] } as const;

/** Los tickets del portal que esperan área. */
export const UNREDIRECTED_WHERE = {
  origenSistema: PORTAL_ORIGIN,
  idAreaDestino: null,
  dimEstado: { nombreEstado: "ABIERTO" },
} as const;

/**
 * ¿Puede esta persona redirigir tickets del portal? Una vez por petición
 * (`cache`): la piden el marco, la bandeja y el interruptor de modo.
 */
export const canRedirect = cache(async (idPersonal: string): Promise<boolean> => {
  const grant = await resolveGrant(idPersonal, TICKET_ACTIONS.redirigir);
  return (
    grant !== null &&
    isTicketWithinScope({ alcance: grant.alcance, action: TICKET_ACTIONS.redirigir, actor: grant.actor, ticket: UNREDIRECTED_SHAPE })
  );
});

/** Cuántos esperan área, o `null` si la persona no puede redirigir. */
export async function countUnredirected(idPersonal: string): Promise<number | null> {
  if (!(await canRedirect(idPersonal))) return null;
  return prisma.factTicket.count({ where: UNREDIRECTED_WHERE });
}

export interface TicketToRedirect {
  idTicket: string;
  descripcion: string;
  fechaCreacion: Date;
  contacto: string;
  cliente: string;
  identificacionFiscal: string | null;
}

/**
 * Un ticket por redirigir, o `null` si no existe, ya se redirigió o la
 * persona no puede redirigir. Las tres respuestas son iguales.
 */
export async function getTicketToRedirect(params: { idPersonal: string; idTicket: string }): Promise<TicketToRedirect | null> {
  if (!(await canRedirect(params.idPersonal))) return null;
  const ticket = await prisma.factTicket.findFirst({
    where: { idTicket: params.idTicket, ...UNREDIRECTED_WHERE },
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
