import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveGrant, resolveGrants } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS, type TicketAction } from "@/server/authorization/catalog";
import {
  VISIBLE_BY_PROJECTION,
  consultScopeConditions,
  historyProjection,
  isTicketWithinScope,
  type HistoryProjection,
} from "@/server/authorization/scope";

import { slaStatus, type SlaStatus } from "./sla";
import { OPEN_STATES, isOperableInHelpDesk, isTicketState, type TicketState } from "./ticket-state";

/**
 * Lecturas del ciclo del ticket. Toda consulta pasa por el alcance de
 * `ticket.consultar` **en la propia consulta SQL**: la bandeja no trae tickets
 * a memoria para descartarlos después, y un ticket fuera de alcance no existe
 * para quien lo pide (se responde igual que a un id inexistente).
 */

// ---------------------------------------------------------------------------
// Bandeja
// ---------------------------------------------------------------------------

/**
 * Vistas de la bandeja. Cada una es un subconjunto del alcance de consulta,
 * nunca una ampliación: el filtro de la vista se combina con AND con el de
 * alcance.
 *
 * - `pendientes`: los que tengo que atender (soy responsable, siguen abiertos).
 *   Es la bandeja de trabajo del legacy (reglas-negocio-powerapps.md §6).
 * - `radicados`: los que abrí yo, en cualquier estado.
 * - `area`: los abiertos de mi área, para ver la carga del equipo.
 * - `terminados`: los cerrados o rechazados dentro de mi alcance.
 */
export const INBOX_VIEWS = ["pendientes", "radicados", "area", "terminados"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export function isInboxView(value: string | undefined): value is InboxView {
  return value !== undefined && (INBOX_VIEWS as readonly string[]).includes(value);
}

/** Filas por página. La bandeja se escanea; no se lee de corrido. */
export const INBOX_PAGE_SIZE = 50;

export interface InboxRow {
  idTicket: string;
  codigoTicket: string | null;
  descripcion: string;
  estado: TicketState;
  prioridad: string | null;
  area: string | null;
  tipo: string | null;
  solicitante: string | null;
  responsable: string | null;
  fechaCreacion: Date;
  fechaLimite: Date | null;
  sla: SlaStatus | null;
  operable: boolean;
}

export interface InboxPage {
  rows: InboxRow[];
  total: number;
  page: number;
  pageCount: number;
}

const TERMINAL_STATES = ["CERRADO", "RECHAZADO"] as const;

function viewCondition(view: InboxView, idPersonal: string, idArea: string | null): Prisma.FactTicketWhereInput {
  const open = { dimEstado: { nombreEstado: { in: [...OPEN_STATES] } } };
  switch (view) {
    case "pendientes":
      return { idAsignado: idPersonal, ...open };
    case "radicados":
      return { idSolicitante: idPersonal };
    case "area":
      // Sin área, la vista está vacía en vez de caer en «todo mi alcance».
      return idArea === null ? { idTicket: { in: [] } } : { idAreaDestino: idArea, ...open };
    case "terminados":
      return { dimEstado: { nombreEstado: { in: [...TERMINAL_STATES] } } };
  }
}

/**
 * Una página de la bandeja, o `null` si la persona no puede consultar
 * tickets.
 *
 * Orden: los abiertos por vencimiento (lo más urgente arriba); los terminados
 * y los radicados, del más reciente al más antiguo.
 */
export async function listInbox(params: { idPersonal: string; view: InboxView; page: number }): Promise<InboxPage | null> {
  const grant = await resolveGrant(params.idPersonal, TICKET_ACTIONS.consultar);
  if (!grant) return null;

  const scope = consultScopeConditions(grant.alcance, grant.actor);
  const where: Prisma.FactTicketWhereInput = {
    AND: [scope === null ? {} : { OR: scope }, viewCondition(params.view, params.idPersonal, grant.actor.idArea)],
  };
  const orderBy: Prisma.FactTicketOrderByWithRelationInput[] =
    params.view === "pendientes" || params.view === "area"
      ? [{ fechaLimite: { sort: "asc", nulls: "last" } }, { fechaCreacion: "asc" }]
      : [{ fechaCreacion: "desc" }];

  const [total, tickets] = await Promise.all([
    prisma.factTicket.count({ where }),
    prisma.factTicket.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * INBOX_PAGE_SIZE,
      take: INBOX_PAGE_SIZE,
      select: {
        idTicket: true,
        codigoTicket: true,
        descripcionProblema: true,
        fechaCreacion: true,
        fechaLimite: true,
        origenSistema: true,
        dimEstado: { select: { nombreEstado: true } },
        dimPrioridad: { select: { nombrePrioridad: true } },
        dimArea: { select: { nombreArea: true } },
        dimTipoRequerimiento: { select: { tipoRequerimiento: true } },
        dimPersonalSolicitante: { select: { nombreCompleto: true } },
        dimPersonalAsignado: { select: { nombreCompleto: true } },
      },
    }),
  ]);

  const now = new Date();
  const rows = tickets.map((ticket): InboxRow => {
    const estado = requireKnownState(ticket.dimEstado.nombreEstado);
    return {
      idTicket: ticket.idTicket,
      codigoTicket: ticket.codigoTicket,
      descripcion: ticket.descripcionProblema,
      estado,
      prioridad: ticket.dimPrioridad?.nombrePrioridad ?? null,
      area: ticket.dimArea?.nombreArea ?? null,
      tipo: ticket.dimTipoRequerimiento?.tipoRequerimiento ?? null,
      solicitante: ticket.dimPersonalSolicitante?.nombreCompleto ?? null,
      responsable: ticket.dimPersonalAsignado?.nombreCompleto ?? null,
      fechaCreacion: ticket.fechaCreacion,
      fechaLimite: ticket.fechaLimite,
      sla: slaStatus({ state: estado, fechaLimite: ticket.fechaLimite, now }),
      operable: isOperableInHelpDesk(ticket.origenSistema),
    };
  });

  return {
    rows,
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE)),
  };
}

function requireKnownState(value: string): TicketState {
  if (!isTicketState(value)) throw new Error(`Estado desconocido en dim_estado: ${value}`);
  return value;
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

export interface TicketHistoryEntry {
  idEvento: string;
  tipo: string;
  visibilidad: "INTERNO" | "CLIENTE" | "AMBOS";
  autor: string | null;
  esSistema: boolean;
  contenido: string;
  fecha: Date;
  estadoNuevo: TicketState | null;
}

/** Lo que la vista puede ofrecer, decidido con las mismas reglas que el servicio. */
export interface TicketCapabilities {
  reasignar: boolean;
  responder: boolean;
  rechazar: boolean;
  notaInterna: boolean;
}

export interface TicketDetail {
  idTicket: string;
  codigoTicket: string | null;
  descripcion: string;
  estado: TicketState;
  prioridad: string | null;
  area: string | null;
  tipo: string | null;
  categoria1: string | null;
  categoria2: string | null;
  solicitante: string | null;
  idAsignado: string | null;
  responsable: string | null;
  fechaCreacion: Date;
  fechaLimite: Date | null;
  fechaResolucion: Date | null;
  sla: SlaStatus | null;
  operable: boolean;
  projection: HistoryProjection;
  history: TicketHistoryEntry[];
  capabilities: TicketCapabilities;
}

/**
 * El detalle de un ticket, o `null` si no existe **o** si la persona no puede
 * consultarlo. Las dos respuestas son iguales a propósito: distinguirlas le
 * diría a quien prueba ids qué tickets existen.
 */
export async function getTicketDetail(params: { idPersonal: string; idTicket: string }): Promise<TicketDetail | null> {
  const grant = await resolveGrant(params.idPersonal, TICKET_ACTIONS.consultar);
  if (!grant) return null;

  const ticket = await prisma.factTicket.findUnique({
    where: { idTicket: params.idTicket },
    select: {
      idTicket: true,
      codigoTicket: true,
      descripcionProblema: true,
      idSolicitante: true,
      idAsignado: true,
      idAreaDestino: true,
      fechaCreacion: true,
      fechaLimite: true,
      fechaResolucion: true,
      origenSistema: true,
      dimEstado: { select: { nombreEstado: true } },
      dimPrioridad: { select: { nombrePrioridad: true } },
      dimArea: { select: { nombreArea: true } },
      dimTipoRequerimiento: { select: { tipoRequerimiento: true, categoria1: true, categoria2: true } },
      dimPersonalSolicitante: { select: { nombreCompleto: true } },
      dimPersonalAsignado: { select: { nombreCompleto: true } },
    },
  });
  if (!ticket) return null;

  const scopeTicket = {
    idSolicitante: ticket.idSolicitante,
    idAsignado: ticket.idAsignado,
    idAreaDestino: ticket.idAreaDestino,
  };
  if (!isTicketWithinScope({ alcance: grant.alcance, action: TICKET_ACTIONS.consultar, actor: grant.actor, ticket: scopeTicket })) {
    return null;
  }

  const projection = historyProjection({ alcance: grant.alcance, actor: grant.actor, ticket: scopeTicket });
  const eventos = await prisma.factTicketEvento.findMany({
    // El filtro de visibilidad va en la consulta: una nota interna no llega
    // nunca a la memoria de una petición que no debe verla.
    where: { idTicket: ticket.idTicket, visibilidad: { in: [...VISIBLE_BY_PROJECTION[projection]] } },
    orderBy: { fechaRegistro: "asc" },
    select: {
      idEvento: true,
      tipoEvento: true,
      tipoActor: true,
      visibilidad: true,
      contenido: true,
      fechaRegistro: true,
      dimPersonal: { select: { nombreCompleto: true } },
      estadoNuevo: { select: { nombreEstado: true } },
    },
  });

  const estado = requireKnownState(ticket.dimEstado.nombreEstado);
  const operable = isOperableInHelpDesk(ticket.origenSistema);

  const grants = await resolveGrants(params.idPersonal, [
    TICKET_ACTIONS.reasignar,
    TICKET_ACTIONS.responder,
    TICKET_ACTIONS.rechazar,
    TICKET_ACTIONS.notaInterna,
  ]);
  const can = (action: TicketAction) => {
    const granted = grants.get(action);
    return granted !== undefined && isTicketWithinScope({ alcance: granted.alcance, action, actor: granted.actor, ticket: scopeTicket });
  };
  const reasignar = can(TICKET_ACTIONS.reasignar);
  const responder = can(TICKET_ACTIONS.responder);
  const rechazar = can(TICKET_ACTIONS.rechazar);
  const notaInterna = can(TICKET_ACTIONS.notaInterna);

  // La misma condición de estado que aplican los comandos (ticket-commands.ts):
  // la vista no ofrece lo que el servicio va a rechazar.
  const capabilities: TicketCapabilities = {
    reasignar: operable && reasignar && estado === "ASIGNADO",
    responder: operable && responder && estado === "ASIGNADO",
    rechazar: operable && rechazar && (estado === "ABIERTO" || estado === "ASIGNADO"),
    notaInterna: operable && notaInterna,
  };

  return {
    idTicket: ticket.idTicket,
    codigoTicket: ticket.codigoTicket,
    descripcion: ticket.descripcionProblema,
    estado,
    prioridad: ticket.dimPrioridad?.nombrePrioridad ?? null,
    area: ticket.dimArea?.nombreArea ?? null,
    tipo: ticket.dimTipoRequerimiento?.tipoRequerimiento ?? null,
    categoria1: ticket.dimTipoRequerimiento?.categoria1 ?? null,
    categoria2: ticket.dimTipoRequerimiento?.categoria2 ?? null,
    solicitante: ticket.dimPersonalSolicitante?.nombreCompleto ?? null,
    idAsignado: ticket.idAsignado,
    responsable: ticket.dimPersonalAsignado?.nombreCompleto ?? null,
    fechaCreacion: ticket.fechaCreacion,
    fechaLimite: ticket.fechaLimite,
    fechaResolucion: ticket.fechaResolucion,
    sla: slaStatus({ state: estado, fechaLimite: ticket.fechaLimite, now: new Date() }),
    operable,
    projection,
    history: eventos.map((evento) => ({
      idEvento: evento.idEvento,
      tipo: evento.tipoEvento,
      visibilidad: evento.visibilidad,
      autor: evento.dimPersonal?.nombreCompleto ?? null,
      esSistema: evento.tipoActor === "SISTEMA",
      contenido: evento.contenido,
      fecha: evento.fechaRegistro,
      estadoNuevo: evento.estadoNuevo && isTicketState(evento.estadoNuevo.nombreEstado) ? evento.estadoNuevo.nombreEstado : null,
    })),
    capabilities,
  };
}

/**
 * Personas a las que quien actúa puede reasignar: activas, con rol, de su
 * misma área, sin el responsable actual. Es la misma condición que valida
 * `reassignTicket`; aquí solo sirve para llenar el selector.
 */
export async function listReassignCandidates(params: { idPersonal: string; excludeIdPersonal: string | null }) {
  const persona = await prisma.dimPersonal.findUnique({
    where: { idPersonal: params.idPersonal },
    select: { idArea: true },
  });
  if (!persona?.idArea) return [];
  return prisma.dimPersonal.findMany({
    where: {
      idArea: persona.idArea,
      estadoActivo: true,
      esResponsableHistoricoNoIdentificado: false,
      rolAplicacion: { not: null },
      ...(params.excludeIdPersonal ? { idPersonal: { not: params.excludeIdPersonal } } : {}),
    },
    orderBy: { nombreCompleto: "asc" },
    select: { idPersonal: true, nombreCompleto: true },
  });
}

// ---------------------------------------------------------------------------
// Catálogo para crear
// ---------------------------------------------------------------------------

export interface CreationCatalog {
  areas: { idArea: string; nombre: string }[];
  tipos: { idTipoReq: string; idArea: string; tipo: string; categoria1: string | null; categoria2: string | null }[];
  prioridades: { nombre: string; diasSla: number }[];
}

/**
 * Áreas, tipos y prioridades para el formulario de creación. Solo se ofrecen
 * áreas que tienen algún tipo de requerimiento: un área sin tipos no puede
 * recibir un ticket, porque el tipo es lo que decide el área.
 */
export async function getCreationCatalog(): Promise<CreationCatalog> {
  const [tipos, prioridades] = await Promise.all([
    prisma.dimTipoRequerimiento.findMany({
      orderBy: [{ tipoRequerimiento: "asc" }, { categoria1: "asc" }, { categoria2: "asc" }],
      select: {
        idTipoReq: true,
        idArea: true,
        tipoRequerimiento: true,
        categoria1: true,
        categoria2: true,
        dimArea: { select: { nombreArea: true } },
      },
    }),
    prisma.dimPrioridad.findMany({
      orderBy: { diasSla: "asc" },
      select: { nombrePrioridad: true, diasSla: true },
    }),
  ]);

  const areas = new Map<string, string>();
  for (const tipo of tipos) areas.set(tipo.idArea, tipo.dimArea.nombreArea);

  return {
    areas: [...areas].map(([idArea, nombre]) => ({ idArea, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    tipos: tipos.map((tipo) => ({
      idTipoReq: tipo.idTipoReq,
      idArea: tipo.idArea,
      tipo: tipo.tipoRequerimiento,
      categoria1: tipo.categoria1,
      categoria2: tipo.categoria2,
    })),
    prioridades: prioridades.map((prioridad) => ({ nombre: prioridad.nombrePrioridad, diasSla: prioridad.diasSla })),
  };
}
