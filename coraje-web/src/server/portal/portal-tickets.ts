import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { VISIBLE_TO_CLIENT } from "@/server/authorization/scope";
import { isTicketState, type TicketState } from "@/server/tickets/ticket-state";

import type { PortalAccess } from "./portal-access";

/**
 * Lo que un contacto ve de sus tickets en el portal.
 *
 * D2 (decisión del usuario, 28-sep-2026): **solo los que él radicó**. El
 * filtro va en la consulta y usa el contacto **y** el cliente del acceso
 * resuelto en servidor, así que un ticket de otro contacto —o de otra
 * empresa— no existe para esta persona, ni pidiendo su id directamente
 * (acceso-clientes.md §10). La respuesta a un id ajeno es la misma que a uno
 * inexistente.
 *
 * Lo que el contacto no ve: responsable, área, tipo, plazo interno, notas
 * internas y clasificación. Ve su descripción, el estado, y las respuestas o
 * rechazos que la firma le dirigió.
 */

function ownTickets(access: PortalAccess): Prisma.FactTicketWhereInput {
  return { idContactoPortal: access.idContacto, idClienteContai: access.idCliente };
}

export const PORTAL_PAGE_SIZE = 25;

export interface PortalTicketRow {
  idTicket: string;
  codigoTicket: string | null;
  descripcion: string;
  estado: TicketState;
  fechaCreacion: Date;
  fechaResolucion: Date | null;
}

function knownState(value: string): TicketState {
  if (!isTicketState(value)) throw new Error(`Estado desconocido en dim_estado: ${value}`);
  return value;
}

export async function listContactTickets(access: PortalAccess, page: number): Promise<{ rows: PortalTicketRow[]; total: number; pageCount: number }> {
  const where = ownTickets(access);
  const [total, tickets] = await Promise.all([
    prisma.factTicket.count({ where }),
    prisma.factTicket.findMany({
      where,
      orderBy: { fechaCreacion: "desc" },
      skip: (page - 1) * PORTAL_PAGE_SIZE,
      take: PORTAL_PAGE_SIZE,
      select: {
        idTicket: true,
        codigoTicket: true,
        descripcionProblema: true,
        fechaCreacion: true,
        fechaResolucion: true,
        dimEstado: { select: { nombreEstado: true } },
      },
    }),
  ]);
  return {
    total,
    pageCount: Math.max(1, Math.ceil(total / PORTAL_PAGE_SIZE)),
    rows: tickets.map((ticket) => ({
      idTicket: ticket.idTicket,
      codigoTicket: ticket.codigoTicket,
      descripcion: ticket.descripcionProblema,
      estado: knownState(ticket.dimEstado.nombreEstado),
      fechaCreacion: ticket.fechaCreacion,
      fechaResolucion: ticket.fechaResolucion,
    })),
  };
}

export interface PortalHistoryEntry {
  idEvento: string;
  tipo: string;
  autor: string;
  deCliente: boolean;
  contenido: string;
  fecha: Date;
}

export interface PortalTicketDetail extends PortalTicketRow {
  history: PortalHistoryEntry[];
}

export async function getContactTicket(access: PortalAccess, idTicket: string): Promise<PortalTicketDetail | null> {
  const ticket = await prisma.factTicket.findFirst({
    where: { idTicket, ...ownTickets(access) },
    select: {
      idTicket: true,
      codigoTicket: true,
      descripcionProblema: true,
      fechaCreacion: true,
      fechaResolucion: true,
      dimEstado: { select: { nombreEstado: true } },
    },
  });
  if (!ticket) return null;

  const eventos = await prisma.factTicketEvento.findMany({
    // El filtro de visibilidad va en la consulta: una nota interna no llega
    // nunca a la memoria de una petición del portal.
    where: { idTicket: ticket.idTicket, visibilidad: { in: [...VISIBLE_TO_CLIENT] } },
    orderBy: { fechaRegistro: "asc" },
    select: {
      idEvento: true,
      tipoEvento: true,
      tipoActor: true,
      contenido: true,
      fechaRegistro: true,
      dimPersonal: { select: { nombreCompleto: true } },
      contactoAutor: { select: { nombre: true } },
    },
  });

  return {
    idTicket: ticket.idTicket,
    codigoTicket: ticket.codigoTicket,
    descripcion: ticket.descripcionProblema,
    estado: knownState(ticket.dimEstado.nombreEstado),
    fechaCreacion: ticket.fechaCreacion,
    fechaResolucion: ticket.fechaResolucion,
    history: eventos.map((evento) => ({
      idEvento: evento.idEvento,
      tipo: evento.tipoEvento,
      deCliente: evento.tipoActor === "CLIENTE",
      autor:
        evento.tipoActor === "CLIENTE"
          ? (evento.contactoAutor?.nombre ?? "Tú")
          : (evento.dimPersonal?.nombreCompleto ?? "Russell Bedford"),
      contenido: evento.contenido,
      fecha: evento.fechaRegistro,
    })),
  };
}
