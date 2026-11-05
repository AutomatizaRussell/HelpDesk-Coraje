import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/server/observability/log";
import { resolveGrant, resolveGrants } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS, type TicketAction } from "@/server/authorization/catalog";
import {
  VISIBLE_BY_PROJECTION,
  consultScopeConditions,
  historyProjection,
  isTicketWithinScope,
  type HistoryProjection,
} from "@/server/authorization/scope";

import { FOLLOWER_WHERE } from "./follow-rules";
import { UNREDIRECTED_WHERE, canRedirect } from "./redirect-queries";
import { DUE_SOON_MS, slaStatus, type SlaStatus } from "./sla";
import { modeCondition, ticketModeOf, type TicketMode } from "./ticket-mode";
import { OPEN_STATES, TICKET_STATES, isOpenState, isOperableInHelpDesk, isTicketState, type TicketState } from "./ticket-state";

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
 * Las vistas dicen **qué relación tengo con el ticket**; el estado se elige
 * aparte, con el filtro (decisión del usuario del 30-sep-2026: antes había
 * pestañas «Abiertos» y «Terminados» que eran filtros de estado, y combinadas
 * con el filtro daban vistas vacías por construcción).
 *
 * - `pendientes`: los que tengo que atender (soy responsable, siguen abiertos).
 *   Es la bandeja de trabajo del legacy (reglas-negocio-powerapps.md §6). Es
 *   la única que fija el estado, porque «por atender» ya lo implica: la vista
 *   no ofrece el filtro de estado.
 * - `radicados`: los que abrí yo, en cualquier estado.
 * - `siguiendo` (U11): los que sigo como observador, incluidos aquellos en
 *   los que me pidieron una validación. Abiertos primero.
 * - `alcance`: todo lo que puedo consultar. Para quien recibe un área es esa
 *   área; para `ADMIN`, toda la firma; para quien no recibe nada, lo suyo. La
 *   vista no mira el área: el alcance ya dice qué cabe (permisos.md §4.5).
 * - `redirigir` (U17, solo en modo Externo): los tickets del portal que
 *   esperan área. Es la única que **no** sale del alcance de consulta: un
 *   ticket sin área no lo cubre ninguno, y la vista la ve quien puede
 *   redirigir (`redirect-queries.ts`). Fija el estado, como «Por atender».
 *
 * Cada modo ofrece las suyas (`inboxViews`): en Externo no hay «Radicados por
 * mí», porque un empleado no radica tickets de clientes (tickets.md §7.1).
 */
export const INBOX_VIEWS = ["pendientes", "redirigir", "radicados", "siguiendo", "alcance"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

/** Las vistas de la bandeja en un modo, en orden; la primera es la de entrada. */
export function inboxViews(mode: TicketMode, access: { redirigir: boolean }): InboxView[] {
  if (mode === "interno") return ["pendientes", "radicados", "siguiendo", "alcance"];
  // Quien redirige entra por lo que espera área: es su trabajo diario.
  return [...(access.redirigir ? (["redirigir"] as const) : []), "pendientes", "siguiendo", "alcance"];
}

/** ¿La vista admite elegir estado? Solo las que no lo fijan ya. */
export function viewAllowsStateFilter(view: InboxView): boolean {
  return view !== "pendientes" && view !== "redirigir";
}

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
  /** Alguien me pidió validar algo de este ticket (U11). */
  validacionParaMi: boolean;
}

/**
 * Filtros de la bandeja (U11, prototipo de TI): texto y estado. Se combinan
 * con AND con la vista y con el alcance, así que nunca amplían lo que se ve.
 */
export interface InboxFilters {
  /** Busca en el código, la descripción y el nombre de quien radicó. */
  texto: string | null;
  estado: TicketState | null;
}

/** Longitud máxima del texto de búsqueda. Más largo no es una búsqueda. */
export const INBOX_SEARCH_MAX = 100;

export interface InboxPage {
  rows: InboxRow[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Conteo de los tickets de mi alcance por estado, más los vencidos (U11).
 * Es lo que el prototipo de TI pone en tarjetas arriba de la bandeja, con una
 * diferencia a propósito: el prototipo llamaba «SLA cumplido» a cerrados
 * entre total, que no mide el plazo. Aquí se cuentan los **vencidos** con la
 * misma regla de `slaStatus` (abiertos con la fecha límite ya pasada).
 */
export interface InboxCounts {
  porEstado: Record<TicketState, number>;
  vencidos: number;
  /** Abiertos que vencen en menos de un día (U30): la frase de la cabecera. */
  porVencer: number;
}


function viewCondition(view: Exclude<InboxView, "redirigir">, idPersonal: string): Prisma.FactTicketWhereInput {
  const open = { dimEstado: { nombreEstado: { in: [...OPEN_STATES] } } };
  switch (view) {
    case "pendientes":
      // U29: aprobar lo que te pidieron también es atender.
      return { OR: [{ idAsignado: idPersonal }, { validaciones: { some: { idDestinatario: idPersonal, resultado: null } } }], ...open };
    case "radicados":
      return { idSolicitante: idPersonal };
    case "alcance":
      return {};
    case "siguiendo":
      return { observadores: { some: { idPersonal } } };
  }
}

/**
 * Qué lista la vista: el alcance de consulta, el modo y la vista, o `null`
 * si la persona no tiene con qué verla. «Por redirigir» no pasa por el
 * alcance de consulta sino por quién puede redirigir.
 */
async function inboxWhere(params: {
  idPersonal: string;
  view: InboxView;
  mode: TicketMode;
}): Promise<Prisma.FactTicketWhereInput | null> {
  if (params.view === "redirigir") {
    return params.mode === "externo" && (await canRedirect(params.idPersonal)) ? UNREDIRECTED_WHERE : null;
  }
  const grant = await resolveGrant(params.idPersonal, TICKET_ACTIONS.consultar);
  if (!grant) return null;
  const scope = consultScopeConditions(grant.alcance, grant.actor);
  return {
    AND: [scope === null ? {} : { OR: scope }, modeCondition(params.mode), viewCondition(params.view, params.idPersonal)],
  };
}

/**
 * Filtro de texto: `ILIKE '%…%'` sobre pocas columnas. Sin índice de
 * trigramas a propósito: el alcance de una persona son unos miles de tickets
 * (2.313 migrados más los nuevos), y un recorrido de esa tabla dentro del
 * filtro de alcance cuesta menos que mantener un índice que casi nadie usa
 * (CLAUDE.md, economía de recursos). Si la bandeja se vuelve lenta, se mide
 * antes de añadirlo.
 */
function filterConditions(filters: InboxFilters): Prisma.FactTicketWhereInput[] {
  const conditions: Prisma.FactTicketWhereInput[] = [];
  if (filters.texto) {
    const contains = { contains: filters.texto, mode: "insensitive" } as const;
    conditions.push({
      OR: [
        { codigoTicket: contains },
        { descripcionProblema: contains },
        { dimPersonalSolicitante: { nombreCompleto: contains } },
        { portalContacto: { nombre: contains } },
      ],
    });
  }
  if (filters.estado) conditions.push({ dimEstado: { nombreEstado: filters.estado } });
  return conditions;
}

/**
 * Una página de la bandeja, o `null` si la persona no puede consultar
 * tickets.
 *
 * Orden: lo que espera área, del más antiguo al más reciente (su plazo no
 * empieza hasta que se redirige, así que lo más viejo es lo más urgente); una
 * lista solo de abiertos, por vencimiento (lo más urgente arriba); el
 * seguimiento, abiertos primero; el resto (radicados y todo el alcance), del
 * más reciente al más antiguo.
 */
export async function listInbox(params: {
  idPersonal: string;
  view: InboxView;
  mode: TicketMode;
  page: number;
  filters: InboxFilters;
}): Promise<InboxPage | null> {
  const base = await inboxWhere(params);
  if (!base) return null;
  const where: Prisma.FactTicketWhereInput = { AND: [base, ...filterConditions(params.filters)] };
  // Por vencimiento solo cuando todo lo listado está abierto: en una lista con
  // terminados, la fecha límite de un ticket cerrado ya no ordena nada.
  const onlyOpen =
    params.view === "pendientes" || (params.filters.estado !== null && isOpenState(params.filters.estado));
  const orderBy: Prisma.FactTicketOrderByWithRelationInput[] =
    params.view === "redirigir"
      ? [{ fechaCreacion: "asc" }]
      : onlyOpen
        ? [{ fechaLimite: { sort: "asc", nulls: "last" } }, { fechaCreacion: "asc" }]
        : params.view === "siguiendo"
          ? [{ fechaResolucion: { sort: "desc", nulls: "first" } }, { fechaCreacion: "desc" }]
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
        ...REQUESTER_SELECT,
        dimPersonalAsignado: { select: { nombreCompleto: true } },
        validaciones: { where: { idDestinatario: params.idPersonal, resultado: null }, select: { idEvento: true }, take: 1 },
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
      solicitante: requesterLabel(ticket),
      responsable: ticket.dimPersonalAsignado?.nombreCompleto ?? null,
      fechaCreacion: ticket.fechaCreacion,
      fechaLimite: ticket.fechaLimite,
      sla: slaStatus({ state: estado, fechaLimite: ticket.fechaLimite, now }),
      operable: isOperableInHelpDesk(ticket.origenSistema),
      validacionParaMi: ticket.validaciones.length > 0,
    };
  });

  return {
    rows,
    total,
    page: params.page,
    pageCount: Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE)),
  };
}

/**
 * Los contadores de arriba de la bandeja, sobre **todo** mi alcance de
 * consulta en el modo, no sobre la vista ni los filtros: responden «cómo está
 * lo mío», y cambiar de pestaña no debe cambiarlos. Tres consultas agregadas
 * en la base, sin traer tickets a memoria.
 *
 * `null` si la persona no puede consultar tickets.
 */
export async function countInbox(idPersonal: string, mode: TicketMode): Promise<InboxCounts | null> {
  const grant = await resolveGrant(idPersonal, TICKET_ACTIONS.consultar);
  if (!grant) return null;

  const scope = consultScopeConditions(grant.alcance, grant.actor);
  const where: Prisma.FactTicketWhereInput = { AND: [scope === null ? {} : { OR: scope }, modeCondition(mode)] };

  // Un solo «ahora» para los dos conteos de plazo: con dos relojes, un ticket
  // que vence justo entre una consulta y la otra se contaría dos veces o
  // ninguna. Los límites son los de `slaStatus`.
  const now = new Date();
  const open = { dimEstado: { nombreEstado: { in: [...OPEN_STATES] } } };
  const [grupos, estados, vencidos, porVencer] = await Promise.all([
    prisma.factTicket.groupBy({ by: ["idEstado"], where, _count: { _all: true } }),
    prisma.dimEstado.findMany({ select: { idEstado: true, nombreEstado: true } }),
    prisma.factTicket.count({ where: { AND: [where, open, { fechaLimite: { lt: now } }] } }),
    // U30: la cabecera dice cuántos están por vencer. Misma forma que el
    // conteo de vencidos, sobre los mismos índices.
    prisma.factTicket.count({
      where: { AND: [where, open, { fechaLimite: { gte: now, lt: new Date(now.getTime() + DUE_SOON_MS) } }] },
    }),
  ]);

  const nombre = new Map(estados.map((estado) => [estado.idEstado, estado.nombreEstado]));
  const porEstado = Object.fromEntries(TICKET_STATES.map((state) => [state, 0])) as Record<TicketState, number>;
  for (const grupo of grupos) {
    const estado = nombre.get(grupo.idEstado);
    if (estado && isTicketState(estado)) porEstado[estado] += grupo._count._all;
  }
  return { porEstado, vencidos, porVencer };
}

/**
 * Quién radicó, en una línea: el empleado, o el contacto con su cliente para
 * un ticket del portal. Un ticket legacy de cliente no tiene contacto y se
 * nombra por el cliente.
 */
function requesterLabel(ticket: {
  dimPersonalSolicitante: { nombreCompleto: string } | null;
  portalContacto: { nombre: string } | null;
  dimClienteContai: { nombreCliente: string } | null;
}): string | null {
  if (ticket.dimPersonalSolicitante) return ticket.dimPersonalSolicitante.nombreCompleto;
  if (ticket.portalContacto) return `${ticket.portalContacto.nombre} · ${ticket.dimClienteContai?.nombreCliente ?? "Cliente"}`;
  return ticket.dimClienteContai?.nombreCliente ?? null;
}

const REQUESTER_SELECT = {
  dimPersonalSolicitante: { select: { nombreCompleto: true } },
  portalContacto: { select: { nombre: true } },
  dimClienteContai: { select: { nombreCliente: true } },
} as const;

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
  /** U7: archivos que trajo este evento. Los ve quien ve el evento, y nadie más. */
  adjuntos: { id: string; nombre: string; tamanoBytes: number }[];
}

/** Lo que la vista puede ofrecer, decidido con las mismas reglas que el servicio. */
export interface TicketCapabilities {
  reasignar: boolean;
  responder: boolean;
  notaInterna: boolean;
  /** U11: añadir y retirar observadores. */
  gestionarObservadores: boolean;
  /** U29: pedir aprobación a una persona. Solo si no hay una pendiente. */
  solicitarValidacion: boolean;
  /** U29: aprobar o no aprobar; solo la persona a quien se pidió. */
  responderAprobacion: boolean;
  /** U29: retirar la aprobación pendiente; quien la pidió o el responsable. */
  retirarAprobacion: boolean;
  /** U11: quien radicó escribe en su ticket abierto sin cerrarlo. */
  comentarSolicitante: boolean;
  /** U34: quien radicó califica su ticket cerrado, si nadie lo ha calificado. */
  calificar: boolean;
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
  /** Empleado que lo radicó; `null` en los tickets del portal y los legacy de cliente. */
  idSolicitante: string | null;
  idAsignado: string | null;
  responsable: string | null;
  fechaCreacion: Date;
  fechaLimite: Date | null;
  fechaResolucion: Date | null;
  sla: SlaStatus | null;
  /** U34: 1 a 5. En los tickets de PowerApps, la que trae la ingesta. */
  calificacion: number | null;
  operable: boolean;
  projection: HistoryProjection;
  history: TicketHistoryEntry[];
  capabilities: TicketCapabilities;
  /** Modo al que pertenece (U17): Externo si es de un cliente. Decide cómo se dibuja. */
  modo: TicketMode;
  /** Quienes siguen el ticket (U11). Los ve cualquiera que pueda consultarlo. */
  observadores: { idPersonal: string; nombre: string }[];
  /** U29: la aprobación pendiente, que bloquea el cierre, y las ya resueltas. */
  aprobacion: {
    pendiente: { aprobador: string; desde: Date } | null;
    resueltas: { aprobador: string; resultado: "APROBADA" | "NO_APROBADA" | "RETIRADA"; fecha: Date }[];
  };
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
      idTipoReq: true,
      fechaCreacion: true,
      fechaLimite: true,
      fechaResolucion: true,
      calificacion: true,
      idClienteContai: true,
      origenSistema: true,
      dimEstado: { select: { nombreEstado: true } },
      dimPrioridad: { select: { nombrePrioridad: true } },
      dimArea: { select: { nombreArea: true } },
      dimTipoRequerimiento: { select: { tipoRequerimiento: true, categoria1: true, categoria2: true } },
      ...REQUESTER_SELECT,
      dimPersonalAsignado: { select: { nombreCompleto: true } },
      observadores: {
        orderBy: { persona: { nombreCompleto: "asc" } },
        select: { idPersonal: true, persona: { select: { nombreCompleto: true } } },
      },
      validaciones: {
        orderBy: { createdAt: "desc" },
        select: {
          idDestinatario: true,
          resultado: true,
          createdAt: true,
          respondidaAt: true,
          destinatario: { select: { nombreCompleto: true } },
          evento: { select: { idAutor: true } },
        },
      },
    },
  });
  if (!ticket) return null;

  const scopeTicket = {
    idSolicitante: ticket.idSolicitante,
    idAsignado: ticket.idAsignado,
    idAreaDestino: ticket.idAreaDestino,
    idTipoReq: ticket.idTipoReq,
    idObservadores: ticket.observadores.map((observador) => observador.idPersonal),
    idAprobadores: [...new Set(ticket.validaciones.map((aprobacion) => aprobacion.idDestinatario))],
  };
  if (!isTicketWithinScope({ alcance: grant.alcance, action: TICKET_ACTIONS.consultar, actor: grant.actor, ticket: scopeTicket })) {
    return null;
  }

  const projection = historyProjection({ alcance: grant.alcance, actor: grant.actor, ticket: scopeTicket });
  const eventos = await prisma.factTicketEvento.findMany({
    // El filtro de visibilidad va en la consulta: una nota interna no llega
    // nunca a la memoria de una petición que no debe verla.
    where: { idTicket: ticket.idTicket, visibilidad: { in: [...VISIBLE_BY_PROJECTION[projection]] } },
    // Lo más reciente primero (30-sep-2026): la historia va debajo del cuadro
    // de respuesta, y lo último que pasó tiene que quedar a su lado.
    orderBy: [{ fechaRegistro: "desc" }, { idEvento: "desc" }],
    select: {
      idEvento: true,
      tipoEvento: true,
      tipoActor: true,
      visibilidad: true,
      contenido: true,
      fechaRegistro: true,
      dimPersonal: { select: { nombreCompleto: true } },
      contactoAutor: { select: { nombre: true } },
      estadoNuevo: { select: { nombreEstado: true } },
      adjuntos: { orderBy: { createdAt: "asc" }, select: { id: true, nombreOriginal: true, tamanoBytes: true } },
    },
  });

  const estado = requireKnownState(ticket.dimEstado.nombreEstado);
  const operable = isOperableInHelpDesk(ticket.origenSistema);

  const grants = await resolveGrants<TicketAction>(params.idPersonal, [
    TICKET_ACTIONS.reasignar,
    TICKET_ACTIONS.responder,
    TICKET_ACTIONS.notaInterna,
    TICKET_ACTIONS.gestionarObservadores,
    TICKET_ACTIONS.solicitarValidacion,
    TICKET_ACTIONS.responderAprobacion,
    TICKET_ACTIONS.comentarSolicitante,
    TICKET_ACTIONS.calificar,
  ]);
  const can = (action: TicketAction) => {
    const granted = grants.get(action);
    return granted !== undefined && isTicketWithinScope({ alcance: granted.alcance, action, actor: granted.actor, ticket: scopeTicket });
  };
  const reasignar = can(TICKET_ACTIONS.reasignar);
  const responder = can(TICKET_ACTIONS.responder);
  const notaInterna = can(TICKET_ACTIONS.notaInterna);

  // La misma condición de estado que aplican los comandos (ticket-commands.ts):
  // la vista no ofrece lo que el servicio va a rechazar.
  const open = isOpenState(estado);
  // A lo sumo una pendiente (ux_ticket_validacion_pendiente).
  const pendiente = ticket.validaciones.find((aprobacion) => aprobacion.resultado === null) ?? null;
  const capabilities: TicketCapabilities = {
    reasignar: operable && reasignar && estado === "ASIGNADO",
    responder: operable && responder && estado === "ASIGNADO",
    notaInterna: operable && notaInterna,
    gestionarObservadores: operable && open && can(TICKET_ACTIONS.gestionarObservadores),
    solicitarValidacion: operable && open && pendiente === null && can(TICKET_ACTIONS.solicitarValidacion),
    responderAprobacion:
      operable && open && pendiente?.idDestinatario === params.idPersonal && can(TICKET_ACTIONS.responderAprobacion),
    // La misma regla que la rama APROBACION_RETIRADA del escritor único.
    retirarAprobacion:
      operable &&
      open &&
      pendiente !== null &&
      (pendiente.evento.idAutor === params.idPersonal || ticket.idAsignado === params.idPersonal) &&
      can(TICKET_ACTIONS.solicitarValidacion),
    comentarSolicitante: operable && open && can(TICKET_ACTIONS.comentarSolicitante),
    // Las mismas condiciones que rateTicket y la rama CALIFICACION del escritor.
    calificar: operable && estado === "CERRADO" && ticket.calificacion === null && can(TICKET_ACTIONS.calificar),
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
    solicitante: requesterLabel(ticket),
    idSolicitante: ticket.idSolicitante,
    idAsignado: ticket.idAsignado,
    responsable: ticket.dimPersonalAsignado?.nombreCompleto ?? null,
    fechaCreacion: ticket.fechaCreacion,
    fechaLimite: ticket.fechaLimite,
    fechaResolucion: ticket.fechaResolucion,
    sla: slaStatus({ state: estado, fechaLimite: ticket.fechaLimite, now: new Date() }),
    calificacion: ticket.calificacion,
    modo: ticketModeOf(ticket.idClienteContai),
    operable,
    projection,
    history: eventos.map((evento) => ({
      idEvento: evento.idEvento,
      tipo: evento.tipoEvento,
      visibilidad: evento.visibilidad,
      autor: evento.dimPersonal?.nombreCompleto ?? evento.contactoAutor?.nombre ?? null,
      esSistema: evento.tipoActor === "SISTEMA",
      contenido: evento.contenido,
      fecha: evento.fechaRegistro,
      estadoNuevo: evento.estadoNuevo && isTicketState(evento.estadoNuevo.nombreEstado) ? evento.estadoNuevo.nombreEstado : null,
      adjuntos: evento.adjuntos.map((adjunto) => ({ id: adjunto.id, nombre: adjunto.nombreOriginal, tamanoBytes: adjunto.tamanoBytes })),
    })),
    capabilities,
    observadores: ticket.observadores.map((observador) => ({
      idPersonal: observador.idPersonal,
      nombre: observador.persona.nombreCompleto,
    })),
    aprobacion: {
      pendiente: pendiente ? { aprobador: pendiente.destinatario.nombreCompleto, desde: pendiente.createdAt } : null,
      resueltas: ticket.validaciones.flatMap((aprobacion) =>
        aprobacion.resultado === "APROBADA" || aprobacion.resultado === "NO_APROBADA" || aprobacion.resultado === "RETIRADA"
          ? [{ aprobador: aprobacion.destinatario.nombreCompleto, resultado: aprobacion.resultado, fecha: aprobacion.respondidaAt ?? aprobacion.createdAt }]
          : [],
      ),
    },
  };
}

/**
 * Un adjunto que la persona puede descargar, con el id del objeto en OneDrive,
 * o `null`. Reutiliza `getTicketDetail` en lugar de repetir sus reglas: el
 * adjunto se entrega solo si su evento está en la historia que esa persona ve,
 * así que el de una nota interna no llega a quien solo radicó el ticket.
 * Inexistente y fuera de alcance responden igual, como el detalle.
 */
export async function getDownloadableAttachment(params: {
  idPersonal: string;
  idTicket: string;
  idAdjunto: string;
}): Promise<{ driveItemId: string; nombre: string } | null> {
  const detail = await getTicketDetail({ idPersonal: params.idPersonal, idTicket: params.idTicket });
  if (!detail) return null;
  const visible = detail.history.some((entry) => entry.adjuntos.some((adjunto) => adjunto.id === params.idAdjunto));
  if (!visible) return null;
  const adjunto = await prisma.ticketAdjunto.findUnique({
    where: { id: params.idAdjunto },
    select: { idTicket: true, driveItemId: true, nombreOriginal: true },
  });
  if (!adjunto || adjunto.idTicket !== params.idTicket) return null;
  return { driveItemId: adjunto.driveItemId, nombre: adjunto.nombreOriginal };
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

/** Una persona que se puede elegir para seguir un ticket o validar algo. */
export interface FollowCandidate {
  idPersonal: string;
  nombre: string;
  /** Para distinguir a dos personas con el mismo nombre. */
  area: string | null;
}

/**
 * Personas que pueden seguir un ticket o recibir una solicitud de validación,
 * de cualquier área: se involucra a quien hace falta, no solo a los
 * compañeros. Misma condición que aplican los comandos (`FOLLOWER_WHERE`),
 * sin las que ya ven el ticket por otra vía.
 */
export async function listFollowCandidates(params: { excludeIdPersonal: readonly (string | null)[] }): Promise<FollowCandidate[]> {
  const exclude = params.excludeIdPersonal.filter((id): id is string => id !== null);
  const personas = await prisma.dimPersonal.findMany({
    where: { ...FOLLOWER_WHERE, ...(exclude.length > 0 ? { idPersonal: { notIn: exclude } } : {}) },
    orderBy: { nombreCompleto: "asc" },
    select: { idPersonal: true, nombreCompleto: true, dimArea: { select: { nombreArea: true } } },
  });
  return personas.map((persona) => ({
    idPersonal: persona.idPersonal,
    nombre: persona.nombreCompleto,
    area: persona.dimArea?.nombreArea ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Catálogo para crear
// ---------------------------------------------------------------------------

export interface CreationCatalog {
  areas: { idArea: string; nombre: string }[];
  tipos: { idTipoReq: string; idArea: string; tipo: string; categoria1: string | null; categoria2: string | null }[];
  /**
   * `vence` (U31): el día en que vencería un ticket creado hoy con esa
   * prioridad, `AAAA-MM-DD` en Bogotá, o `null` si no se pudo calcular.
   */
  prioridades: { nombre: string; diasSla: number; vence: string | null }[];
}

/**
 * Día de vencimiento de un ticket creado hoy, por cada plazo en días hábiles
 * (U31: las tarjetas de prioridad dicen «vence el lunes 9»). Lo calcula la
 * misma función que fija el plazo al crear (`core.add_colombia_business_days`,
 * con los festivos de Colombia), así que la fecha que se promete es la que el
 * ticket tendrá. Una consulta para todos los plazos.
 *
 * Si falla, devuelve un mapa vacío y la tarjeta muestra solo los días: una
 * fecha de cortesía no puede impedir que alguien radique un ticket.
 */
async function dueDatesFor(dias: number[]): Promise<Map<number, string>> {
  try {
    const rows = await prisma.$queryRaw<{ dias: number; vence: Date }[]>`
      SELECT d AS dias,
             core.add_colombia_business_days((now() AT TIME ZONE 'America/Bogota')::date, d) AS vence
      FROM unnest(${dias}::int[]) AS d`;
    // `vence` es un DATE: llega como medianoche UTC, y su parte de fecha es el día.
    return new Map(rows.map((row) => [Number(row.dias), row.vence.toISOString().slice(0, 10)]));
  } catch (error) {
    logEvent("warn", "ticket.vencimiento_previo_fallido", {}, error);
    return new Map();
  }
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
  const vence = await dueDatesFor(prioridades.map((prioridad) => prioridad.diasSla));

  return {
    areas: [...areas].map(([idArea, nombre]) => ({ idArea, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    tipos: tipos.map((tipo) => ({
      idTipoReq: tipo.idTipoReq,
      idArea: tipo.idArea,
      tipo: tipo.tipoRequerimiento,
      categoria1: tipo.categoria1,
      categoria2: tipo.categoria2,
    })),
    prioridades: prioridades.map((prioridad) => ({
      nombre: prioridad.nombrePrioridad,
      diasSla: prioridad.diasSla,
      vence: vence.get(prioridad.diasSla) ?? null,
    })),
  };
}

/**
 * Lo que la confirmación de «Nuevo ticket» muestra del ticket recién creado
 * (U31): su código, el área que lo recibió y quién quedó como responsable.
 * Lo decide la base al crear, así que se lee después, no se supone.
 */
export async function getCreatedTicketSummary(
  idTicket: string,
): Promise<{ codigo: string | null; area: string | null; responsable: string | null }> {
  const ticket = await prisma.factTicket.findUnique({
    where: { idTicket },
    select: {
      codigoTicket: true,
      dimArea: { select: { nombreArea: true } },
      dimPersonalAsignado: { select: { nombreCompleto: true } },
    },
  });
  return {
    codigo: ticket?.codigoTicket ?? null,
    area: ticket?.dimArea?.nombreArea ?? null,
    responsable: ticket?.dimPersonalAsignado?.nombreCompleto ?? null,
  };
}

/**
 * Días hábiles del plazo de un ticket: los que ya pasaron y los que tiene en
 * total (U32, el anillo de la cabecera del detalle). Los cuenta PostgreSQL con
 * el mismo calendario que fija el plazo (`core.is_colombia_holiday`, lunes a
 * viernes), en fechas de Bogotá:
 *
 * - `total`: días hábiles después del de radicación, hasta el día límite.
 * - `consumidos`: los días hábiles completos ya pasados, más la **fracción**
 *   del día en curso (o del de cierre) si es hábil y cae dentro del plazo:
 *   a las 15:18 se lleva el 64 % de ese día. Corte 72: sin la fracción, un
 *   ticket radicado un día y cerrado al siguiente marcaba 0 %, porque el día
 *   de cierre no contaba hasta terminar.
 *
 * Una consulta de una fila; no se llama para tickets sin fecha límite.
 * Si falla, `null`: el anillo se dibuja vacío y el plazo sigue en texto.
 */
export async function getPlazoProgress(idTicket: string): Promise<{ consumidos: number; total: number } | null> {
  try {
    const rows = await prisma.$queryRaw<{ consumidos: number; total: number }[]>`
      WITH t AS (
        SELECT (fecha_creacion AT TIME ZONE 'America/Bogota')::date AS c,
               (fecha_limite AT TIME ZONE 'America/Bogota')::date AS l,
               (COALESCE(fecha_resolucion, now()) AT TIME ZONE 'America/Bogota') AS fin
        FROM helpdesk.fact_ticket
        WHERE id_ticket = ${idTicket}::uuid AND fecha_limite IS NOT NULL
      ), u AS (
        SELECT t.*, t.fin::date AS e FROM t
      )
      SELECT
        ((SELECT count(*) FROM generate_series(u.c + 1, LEAST(u.e - 1, u.l), interval '1 day') AS g(d)
           WHERE EXTRACT(ISODOW FROM g.d) < 6 AND NOT core.is_colombia_holiday(g.d::date))
         + CASE
             WHEN u.e > u.c AND u.e <= u.l AND EXTRACT(ISODOW FROM u.e) < 6 AND NOT core.is_colombia_holiday(u.e)
               THEN EXTRACT(EPOCH FROM (u.fin - u.e::timestamp)) / 86400
             ELSE 0
           END)::float8 AS consumidos,
        (SELECT count(*) FROM generate_series(u.c + 1, u.l, interval '1 day') AS g(d)
          WHERE EXTRACT(ISODOW FROM g.d) < 6 AND NOT core.is_colombia_holiday(g.d::date))::int AS total
      FROM u`;
    const row = rows[0];
    return row ? { consumidos: Number(row.consumidos), total: Number(row.total) } : null;
  } catch (error) {
    logEvent("warn", "ticket.plazo_progreso_fallido", { idTicket }, error);
    return null;
  }
}
