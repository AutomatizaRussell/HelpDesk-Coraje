import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthorizationDeniedError, requireGrant, requireTicketAction } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS, type TicketAction } from "@/server/authorization/catalog";
import { deliverTicketEvent, type TicketDelivery } from "@/server/notifications/ticket-notices";
import type { TicketMailKind } from "@/server/notifications/ticket-mail-content";
import type { TicketNoticeKind } from "@/server/notifications/ticket-notice-kinds";
import { logEvent } from "@/server/observability/log";
import { recordPortalAudit } from "@/server/portal/portal-audit";
import type { PortalAccess } from "@/server/portal/portal-access";

import { FOLLOWER_WHERE, MAX_OBSERVERS_PER_ACTION } from "./follow-rules";
import { TicketDomainError, translateCreationFailure } from "./ticket-errors";
import { OPEN_STATES, TICKET_STATES, isOperableInHelpDesk, isTicketState, type TicketState } from "./ticket-state";

/**
 * Comandos del ciclo del ticket (specs/tickets.md §4.1: T1 y T3 desde U8;
 * T2, T4, T7, T8 y la nota interna desde U7; seguimiento desde U11, §11).
 *
 * Todos siguen el mismo orden, y el orden es la garantía:
 * 1. Bloquear la fila del ticket (`FOR UPDATE`) dentro de la transacción.
 * 2. Autorizar contra esa fila bloqueada: nadie puede cambiar el responsable
 *    entre la comprobación y la escritura.
 * 3. Comprobar que el ticket se opera desde HelpDesk y que su estado admite la
 *    acción, con un mensaje claro antes de que el escritor lo rechace.
 * 4. Escribir las columnas que la acción cambia y, en la misma transacción,
 *    el evento a través de `helpdesk.registrar_evento_ticket`, que valida la
 *    transición y escribe la proyección del estado.
 *
 * 5. Registrar, en la misma transacción, a quién le toca saber de la acción
 *    (`deliverTicketEvent`, U15): un aviso en la campana para cada empleado
 *    y un correo para el contacto de un cliente. Nada sale de la base dentro
 *    de la transacción: la acción de servidor envía los correos después del
 *    commit, con los ids que devuelven estos comandos.
 */

type Tx = Prisma.TransactionClient;

/** Resultado de toda acción que produjo un evento. */
export interface TicketEventResult {
  idTicket: string;
  idEvento: string;
  /** Correos registrados como PENDIENTE, para enviarlos tras el commit. */
  mailIds: string[];
}

interface LockedTicket {
  idTicket: string;
  idSolicitante: string | null;
  /** Contacto del cliente que radicó un ticket del portal (U8, D2). */
  idContactoPortal: string | null;
  idAsignado: string | null;
  idAreaDestino: string | null;
  /** Decide quién lo recibe, y con eso el alcance `AREA` (scope.ts). */
  idTipoReq: string | null;
  origenSistema: string;
  estado: TicketState;
  /** Quienes siguen el ticket (U11). Entra en el alcance de consulta. */
  idObservadores: string[];
}

const DENIED_MESSAGE = "No tienes permiso para hacer esto en este ticket.";

async function lockTicket(tx: Tx, idTicket: string): Promise<LockedTicket> {
  const rows = await tx.$queryRaw<
    {
      id_ticket: string;
      id_solicitante: string | null;
      id_contacto_portal: string | null;
      id_asignado: string | null;
      id_area_destino: string | null;
      id_tipo_req: string | null;
      origen_sistema: string;
      nombre_estado: string;
      id_observadores: string[];
    }[]
  >`
    SELECT ticket.id_ticket::text,
           ticket.id_solicitante::text,
           ticket.id_contacto_portal::text,
           ticket.id_asignado::text,
           ticket.id_area_destino::text,
           ticket.id_tipo_req::text,
           ticket.origen_sistema,
           estado.nombre_estado,
           ARRAY(
               SELECT observador.id_personal::text
               FROM helpdesk.ticket_observador AS observador
               WHERE observador.id_ticket = ticket.id_ticket
           ) AS id_observadores
    FROM helpdesk.fact_ticket AS ticket
    JOIN helpdesk.dim_estado AS estado
        ON estado.id_estado = ticket.id_estado
    WHERE ticket.id_ticket = ${idTicket}::uuid
    FOR UPDATE OF ticket
  `;
  const row = rows[0];
  if (!row) throw new TicketDomainError("TICKET_NO_EXISTE", "El ticket no existe.");
  if (!isTicketState(row.nombre_estado)) {
    // El catálogo de la base tiene un estado que la aplicación no conoce: es
    // un defecto de despliegue, no algo que la persona pueda resolver.
    throw new Error(`Estado desconocido en dim_estado: ${row.nombre_estado}`);
  }
  return {
    idTicket: row.id_ticket,
    idSolicitante: row.id_solicitante,
    idContactoPortal: row.id_contacto_portal,
    idAsignado: row.id_asignado,
    idAreaDestino: row.id_area_destino,
    idTipoReq: row.id_tipo_req,
    origenSistema: row.origen_sistema,
    estado: row.nombre_estado,
    idObservadores: row.id_observadores,
  };
}

/**
 * Pasos 1 a 3 del orden de arriba. Devuelve el ticket bloqueado y el área de
 * quien actúa, que la reasignación necesita.
 */
async function lockAndAuthorize(params: {
  tx: Tx;
  idTicket: string;
  idPersonal: string;
  action: TicketAction;
  allowedStates: readonly TicketState[];
  stateMessage: string;
}) {
  const ticket = await lockTicket(params.tx, params.idTicket);
  let grant;
  try {
    grant = await requireTicketAction({
      idPersonal: params.idPersonal,
      action: params.action,
      ticket,
      db: params.tx,
    });
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      logEvent("warn", "tickets.accion_denegada", {
        accion: error.action,
        motivo: error.reason,
        idTicket: params.idTicket,
        idPersonal: params.idPersonal,
      });
      throw new TicketDomainError("NO_AUTORIZADO", DENIED_MESSAGE);
    }
    throw error;
  }
  if (!isOperableInHelpDesk(ticket.origenSistema)) {
    throw new TicketDomainError("TICKET_LEGACY", "Este ticket viene de PowerApps y se sigue gestionando allí.");
  }
  if (!params.allowedStates.includes(ticket.estado)) {
    throw new TicketDomainError("ESTADO_NO_PERMITE", params.stateMessage);
  }
  return { ticket, actor: grant.actor };
}

/** Llama al escritor único y devuelve el id del evento creado. */
async function writeEvent(
  tx: Tx,
  params: {
    idTicket: string;
    tipo:
      | "REASIGNACION"
      | "RESPUESTA"
      | "RECHAZO"
      | "COMENTARIO"
      | "OBSERVADOR_AGREGADO"
      | "OBSERVADOR_RETIRADO"
      | "SOLICITUD_VALIDACION"
      | "COMENTARIO_SOLICITANTE";
    idAutor: string;
    visibilidad: "INTERNO" | "AMBOS";
    contenido: string;
    estadoNuevo: TicketState | null;
  },
): Promise<string> {
  const rows = await tx.$queryRaw<{ id_evento: string | null }[]>`
    SELECT helpdesk.registrar_evento_ticket(
        ${params.idTicket}::uuid,
        ${params.tipo}::helpdesk.tipo_evento_ticket,
        'EMPLEADO'::helpdesk.tipo_actor_evento,
        ${params.idAutor}::uuid,
        ${params.visibilidad}::helpdesk.visibilidad_evento,
        ${params.contenido}::text,
        ${params.estadoNuevo}::text
    )::text AS id_evento
  `;
  const idEvento = rows[0]?.id_evento;
  // Sin event_hash, el escritor solo devuelve NULL si algo va muy mal: no hay
  // idempotencia que haga legítimo un evento omitido.
  if (!idEvento) throw new Error(`registrar_evento_ticket no devolvió evento para ${params.idTicket}`);
  return idEvento;
}

/**
 * El aviso a quien radicó, sea un empleado o el contacto de un cliente. Los
 * dos casos no se mezclan: el empleado recibe un aviso en la campana, con el
 * vocabulario interno; el contacto, un correo con el enlace al portal (U15).
 */
function requesterDelivery(
  ticket: LockedTicket,
  internalKind: TicketNoticeKind,
  clientKind: TicketMailKind,
): TicketDelivery | null {
  if (ticket.idSolicitante) return { tipo: "EMPLEADO", kind: internalKind, idPersonal: ticket.idSolicitante };
  if (ticket.idContactoPortal) return { tipo: "CONTACTO", kind: clientKind, idContacto: ticket.idContactoPortal };
  return null;
}

/** Un aviso por observador, para las acciones que terminan el ticket (U11). */
function observerDeliveries(ticket: LockedTicket, kind: TicketNoticeKind): TicketDelivery[] {
  return ticket.idObservadores.map((idPersonal) => ({ tipo: "EMPLEADO", kind, idPersonal }));
}

/**
 * Añade observadores a un ticket ya bloqueado, con su evento y sus avisos, en
 * la transacción de quien llama. Lo usan la creación (quien radica elige a
 * quién involucrar) y la acción de añadir observadores.
 *
 * Descarta en silencio a quien ya ve el ticket por otra vía —quien lo radicó,
 * su responsable, quien ya lo sigue—: seguir lo que ya se atiende no añade
 * nada. Rechaza, en cambio, a quien no puede seguirlo (`FOLLOWER_WHERE`): es
 * un formulario manipulado o un directorio que cambió, y la persona debe
 * saberlo.
 *
 * Un solo evento por operación, con todos los nombres: añadir tres personas
 * de una vez es un acto, no tres.
 *
 * @returns el evento y los correos creados, o `null` si no quedó nadie que
 * añadir.
 */
async function addObserversInTx(
  tx: Tx,
  params: { ticket: LockedTicket; idAutor: string; idPersonas: readonly string[] },
): Promise<{ idEvento: string; mailIds: string[] } | null> {
  const { ticket } = params;
  const yaLoVen = new Set([ticket.idSolicitante, ticket.idAsignado, ...ticket.idObservadores]);
  const nuevos = [...new Set(params.idPersonas)].filter((id) => !yaLoVen.has(id));
  if (nuevos.length === 0) return null;
  if (nuevos.length > MAX_OBSERVERS_PER_ACTION) {
    throw new TicketDomainError("DESTINO_INVALIDO", `Puedes añadir hasta ${MAX_OBSERVERS_PER_ACTION} personas de una vez.`);
  }

  const personas = await tx.dimPersonal.findMany({
    where: { idPersonal: { in: nuevos }, ...FOLLOWER_WHERE },
    orderBy: { nombreCompleto: "asc" },
    select: { idPersonal: true, nombreCompleto: true },
  });
  if (personas.length !== nuevos.length) {
    throw new TicketDomainError("DESTINO_INVALIDO", "Solo puedes añadir personas activas que tengan acceso a HelpDesk.");
  }

  await tx.ticketObservador.createMany({
    data: personas.map((persona) => ({ idTicket: ticket.idTicket, idPersonal: persona.idPersonal, agregadoPor: params.idAutor })),
  });

  const idEvento = await writeEvent(tx, {
    idTicket: ticket.idTicket,
    tipo: "OBSERVADOR_AGREGADO",
    idAutor: params.idAutor,
    visibilidad: "INTERNO",
    contenido: `Sigue${personas.length > 1 ? "n" : ""} el ticket: ${personas.map((persona) => persona.nombreCompleto).join(", ")}.`,
    estadoNuevo: null,
  });

  const mailIds = await deliverTicketEvent(tx, {
    idTicket: ticket.idTicket,
    idEvento,
    idAutor: params.idAutor,
    texto: null,
    deliveries: personas.map((persona) => ({
      tipo: "EMPLEADO" as const,
      kind: "OBSERVADOR_AGREGADO" as const,
      idPersonal: persona.idPersonal,
    })),
  });

  ticket.idObservadores.push(...personas.map((persona) => persona.idPersonal));
  return { idEvento, mailIds };
}

// ---------------------------------------------------------------------------
// T2 · Crear
// ---------------------------------------------------------------------------

/**
 * Radica un ticket a nombre de quien actúa. El área, el responsable y el
 * plazo los resuelve `helpdesk.crear_ticket_interno`, que inserta el ticket y
 * su `CREACION` en la misma transacción.
 *
 * El solicitante es siempre `idPersonal`, nunca un dato del formulario: es lo
 * que significa el alcance `PROPIO` de `ticket.crear`.
 *
 * Quien radica puede elegir observadores (U11, como en el prototipo de TI).
 * Es parte de radicar, bajo `ticket.crear`, y no de
 * `ticket.observador.gestionar`: quien pide ayuda decide a quién le interesa
 * enterarse, y después de crear ya no gestiona el ticket.
 */
export async function createInternalTicket(params: {
  idPersonal: string;
  idTipoReq: string;
  prioridad: string;
  descripcion: string;
  idObservadores: readonly string[];
}): Promise<{ idTicket: string; codigoTicket: string | null; mailIds: string[] }> {
  try {
    await requireGrant(params.idPersonal, TICKET_ACTIONS.crear);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      throw new TicketDomainError("NO_AUTORIZADO", "No tienes permiso para crear tickets.");
    }
    throw error;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id_ticket: string; codigo_ticket: string | null }[]>`
        SELECT id_ticket::text, codigo_ticket
        FROM helpdesk.crear_ticket_interno(
            ${params.idPersonal}::uuid,
            ${params.idTipoReq}::uuid,
            ${params.prioridad}::text,
            ${params.descripcion}::text
        )
      `;
      const row = rows[0];
      if (!row) throw new Error("crear_ticket_interno no devolvió el ticket creado");

      // La función no devuelve el evento: se lee en la misma transacción, donde
      // existe exactamente uno de inicio.
      const creado = await tx.factTicketEvento.findFirstOrThrow({
        where: { idTicket: row.id_ticket, tipoEvento: "CREACION" },
        select: { idEvento: true, factTicket: { select: { idAsignado: true } } },
      });
      const mailIds = creado.factTicket.idAsignado
        ? await deliverTicketEvent(tx, {
            idTicket: row.id_ticket,
            idEvento: creado.idEvento,
            idAutor: params.idPersonal,
            texto: null,
            deliveries: [
              { tipo: "EMPLEADO", kind: "CREACION_RESPONSABLE", idPersonal: creado.factTicket.idAsignado },
            ],
          })
        : [];

      if (params.idObservadores.length > 0) {
        const ticket = await lockTicket(tx, row.id_ticket);
        const observers = await addObserversInTx(tx, { ticket, idAutor: params.idPersonal, idPersonas: params.idObservadores });
        if (observers) mailIds.push(...observers.mailIds);
      }

      return { idTicket: row.id_ticket, codigoTicket: row.codigo_ticket, mailIds };
    });
  } catch (error) {
    const translated = translateCreationFailure(error);
    if (translated) throw translated;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// T1 · Un contacto de cliente radica desde el portal
// ---------------------------------------------------------------------------

/**
 * Radica un ticket a nombre del contacto del acceso. El contacto y el
 * cliente salen del acceso resuelto en servidor, nunca de un dato del
 * formulario: nadie puede radicar a nombre de otra empresa ni de otra
 * persona. Quien llama ya exigió escritura (`requirePortalWriteAccess`).
 *
 * El ticket nace ABIERTO y sin plazo: espera a que alguien lo clasifique
 * (T3), y el plazo del cliente empieza entonces (tickets.md §5). No avisa a
 * nadie por correo: no hay un empleado que lo envíe desde su buzón (D6), y
 * la vista «Por redirigir» de la bandeja es donde se ve lo que llega.
 */
export async function createPortalTicket(params: { access: PortalAccess; descripcion: string }): Promise<{ idTicket: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id_ticket: string }[]>`
        SELECT helpdesk.crear_ticket_cliente(
            ${params.access.idContacto}::uuid,
            ${params.descripcion}::text
        )::text AS id_ticket
      `;
      const idTicket = rows[0]?.id_ticket;
      if (!idTicket) throw new Error("crear_ticket_cliente no devolvió el ticket creado");
      await recordPortalAudit(tx, {
        evento: "TICKET_RADICADO",
        resultado: "EXITO",
        idContacto: params.access.idContacto,
        idAutorizacion: params.access.idAutorizacion,
        metadata: { idTicket, idDispositivo: params.access.idDispositivo },
      });
      return { idTicket };
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // El contacto o su cliente se desactivaron entre la lectura del acceso y
    // la escritura: para la persona, el acceso dejó de ser válido.
    if (message.includes("HD_CONTACTO_INACTIVO")) {
      throw new TicketDomainError("NO_AUTORIZADO", "Tu acceso al portal ya no está activo.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// T3 · Redirigir un ticket del portal
// ---------------------------------------------------------------------------

/**
 * Redirige un ticket del portal: el tipo de requerimiento decide el área,
 * la regla de enrutamiento decide la persona, y empieza el plazo de 3 días
 * hábiles. Todo eso lo hace `helpdesk.redirigir_ticket`, en una sola regla
 * compartida con la creación interna.
 *
 * Autoriza `ticket.redirigir` contra la fila bloqueada. Un ticket sin
 * clasificar no tiene responsable ni área, así que solo el alcance `TOTAL`
 * lo cubre (scope.ts); en la v1 lo tiene `REDIRECTOR`.
 *
 * No encola nada hacia SharePoint por su cuenta: al fijar el área, el
 * trigger `trg_encolar_espejo_sharepoint` encola la creación del ítem en
 * HelpDeskBd (U9, migración 20260928120000), y la acción despierta la salida.
 */
export async function redirectTicket(params: {
  idPersonal: string;
  idTicket: string;
  idTipoReq: string;
}): Promise<TicketEventResult & { idResponsable: string | null; codigoTicket: string | null }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const { ticket } = await lockAndAuthorize({
        tx,
        idTicket: params.idTicket,
        idPersonal: params.idPersonal,
        action: TICKET_ACTIONS.redirigir,
        allowedStates: ["ABIERTO"],
        stateMessage: "Este ticket ya fue redirigido.",
      });
      if (ticket.idContactoPortal === null || ticket.idAreaDestino !== null) {
        throw new TicketDomainError("ESTADO_NO_PERMITE", "Este ticket ya fue redirigido o no viene del portal.");
      }

      const rows = await tx.$queryRaw<{ id_evento: string | null }[]>`
        SELECT helpdesk.redirigir_ticket(
            ${ticket.idTicket}::uuid,
            ${params.idPersonal}::uuid,
            ${params.idTipoReq}::uuid
        )::text AS id_evento
      `;
      const idEvento = rows[0]?.id_evento;
      if (!idEvento) throw new Error(`redirigir_ticket no devolvió evento para ${ticket.idTicket}`);

      const redirigido = await tx.factTicket.findUniqueOrThrow({
        where: { idTicket: ticket.idTicket },
        select: { idAsignado: true, codigoTicket: true },
      });
      // Como al crear un ticket interno: avisa a la persona que lo recibe.
      const mailIds = redirigido.idAsignado
        ? await deliverTicketEvent(tx, {
            idTicket: ticket.idTicket,
            idEvento,
            idAutor: params.idPersonal,
            texto: null,
            deliveries: [
              { tipo: "EMPLEADO", kind: "REDIRECCION_RESPONSABLE", idPersonal: redirigido.idAsignado },
            ],
          })
        : [];

      return {
        idTicket: ticket.idTicket,
        idEvento,
        mailIds,
        idResponsable: redirigido.idAsignado,
        codigoTicket: redirigido.codigoTicket,
      };
    });
  } catch (error) {
    const translated = translateCreationFailure(error);
    if (translated) throw translated;
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("HD_NO_REDIRIGIBLE")) {
      throw new TicketDomainError("ESTADO_NO_PERMITE", "Este ticket ya fue redirigido.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// T4 · Reasignar dentro del área
// ---------------------------------------------------------------------------

/**
 * Pasa el ticket a otra persona **del área de quien reasigna**, como en el
 * legacy (reglas-negocio-powerapps.md §6). El plazo se conserva: reasignar no
 * lo reinicia (tickets.md §5, reloj por turno).
 *
 * El destino tiene que estar activo y tener rol en HelpDesk: reasignar a quien
 * no puede entrar deja el ticket sin nadie que lo atienda. El legacy solo
 * exigía que existiera en el roster.
 */
export async function reassignTicket(params: {
  idPersonal: string;
  idTicket: string;
  idNuevoResponsable: string;
  comentario: string | null;
}): Promise<TicketEventResult & { idNuevoResponsable: string }> {
  return prisma.$transaction(async (tx) => {
    const { ticket, actor } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.reasignar,
      allowedStates: ["ASIGNADO"],
      stateMessage: "Solo se puede reasignar un ticket asignado.",
    });

    if (params.idNuevoResponsable === ticket.idAsignado) {
      throw new TicketDomainError("DESTINO_INVALIDO", "Esa persona ya es la responsable del ticket.");
    }

    const invalidDestination = new TicketDomainError(
      "DESTINO_INVALIDO",
      "Solo puedes reasignar a una persona activa de tu área que tenga acceso a HelpDesk.",
    );
    // Sin área propia no hay «misma área» a la que reasignar.
    if (actor.idArea === null) throw invalidDestination;

    const destino = await tx.dimPersonal.findFirst({
      where: {
        idPersonal: params.idNuevoResponsable,
        estadoActivo: true,
        esResponsableHistoricoNoIdentificado: false,
        rolAplicacion: { not: null },
        idArea: actor.idArea,
      },
      select: { idPersonal: true, nombreCompleto: true },
    });
    if (!destino) throw invalidDestination;

    await tx.factTicket.update({
      where: { idTicket: ticket.idTicket },
      data: { idAsignado: destino.idPersonal, ultimaActualizacion: new Date() },
    });

    const contenido = params.comentario
      ? `Reasignado a ${destino.nombreCompleto}.\n\n${params.comentario}`
      : `Reasignado a ${destino.nombreCompleto}.`;

    // INTERNO: el comentario de una reasignación es conversación del equipo.
    // El solicitante ve el responsable vigente en la ficha del ticket.
    const idEvento = await writeEvent(tx, {
      idTicket: ticket.idTicket,
      tipo: "REASIGNACION",
      idAutor: params.idPersonal,
      visibilidad: "INTERNO",
      contenido,
      estadoNuevo: null,
    });

    // Como en el legacy, avisan a la nueva persona responsable y a quien radicó.
    // El comentario solo entra en el aviso del equipo (ticket-notice-content.ts).
    const mailIds = await deliverTicketEvent(tx, {
      idTicket: ticket.idTicket,
      idEvento,
      idAutor: params.idPersonal,
      texto: params.comentario,
      deliveries: [
        { tipo: "EMPLEADO", kind: "REASIGNACION_RESPONSABLE", idPersonal: destino.idPersonal },
        // Solo al solicitante interno. Al contacto de un cliente no se le
        // avisa de un movimiento dentro del equipo: sigue viendo su ticket en
        // atención, y quién lo atiende es asunto interno.
        ...(ticket.idSolicitante
          ? [{ tipo: "EMPLEADO" as const, kind: "REASIGNACION_SOLICITANTE" as const, idPersonal: ticket.idSolicitante }]
          : []),
      ],
    });

    return { idTicket: ticket.idTicket, idEvento, mailIds, idNuevoResponsable: destino.idPersonal };
  });
}

// ---------------------------------------------------------------------------
// T7 · Responder y cerrar
// ---------------------------------------------------------------------------

/**
 * Responde al solicitante y cierra el ticket en el mismo paso, como en el
 * legacy (reglas-negocio-powerapps.md §7). A diferencia del legacy, el aviso
 * por correo sale **después** de guardar, nunca antes (§10 de ese documento).
 */
export async function respondTicket(params: {
  idPersonal: string;
  idTicket: string;
  respuesta: string;
}): Promise<TicketEventResult> {
  return prisma.$transaction(async (tx) => {
    const { ticket } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.responder,
      allowedStates: ["ASIGNADO"],
      stateMessage: "Este ticket ya no admite respuesta.",
    });

    const now = new Date();
    await tx.factTicket.update({
      where: { idTicket: ticket.idTicket },
      data: { respuestaFinal: params.respuesta, fechaResolucion: now, ultimaActualizacion: now },
    });

    const idEvento = await writeEvent(tx, {
      idTicket: ticket.idTicket,
      tipo: "RESPUESTA",
      idAutor: params.idPersonal,
      visibilidad: "AMBOS",
      contenido: params.respuesta,
      estadoNuevo: "CERRADO",
    });

    const delivery = requesterDelivery(ticket, "RESPUESTA_SOLICITANTE", "RESPUESTA_CLIENTE");
    const mailIds = await deliverTicketEvent(tx, {
      idTicket: ticket.idTicket,
      idEvento,
      idAutor: params.idPersonal,
      texto: params.respuesta,
      deliveries: [...(delivery ? [delivery] : []), ...observerDeliveries(ticket, "RESPUESTA_OBSERVADOR")],
    });

    return { idTicket: ticket.idTicket, idEvento, mailIds };
  });
}

// ---------------------------------------------------------------------------
// T8 · Rechazar
// ---------------------------------------------------------------------------

/**
 * Declara que el ticket no se atiende. El motivo es obligatorio y lo ve el
 * solicitante: rechazar sin decir por qué deja a quien radicó sin saber qué
 * hacer.
 */
export async function rejectTicket(params: {
  idPersonal: string;
  idTicket: string;
  motivo: string;
}): Promise<TicketEventResult> {
  return prisma.$transaction(async (tx) => {
    const { ticket } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.rechazar,
      allowedStates: ["ABIERTO", "ASIGNADO"],
      stateMessage: "Este ticket ya terminó y no se puede rechazar.",
    });

    const now = new Date();
    await tx.factTicket.update({
      where: { idTicket: ticket.idTicket },
      data: { fechaResolucion: now, ultimaActualizacion: now },
    });

    const idEvento = await writeEvent(tx, {
      idTicket: ticket.idTicket,
      tipo: "RECHAZO",
      idAutor: params.idPersonal,
      visibilidad: "AMBOS",
      contenido: params.motivo,
      estadoNuevo: "RECHAZADO",
    });

    const delivery = requesterDelivery(ticket, "RECHAZO_SOLICITANTE", "RECHAZO_CLIENTE");
    const mailIds = await deliverTicketEvent(tx, {
      idTicket: ticket.idTicket,
      idEvento,
      idAutor: params.idPersonal,
      texto: params.motivo,
      deliveries: [...(delivery ? [delivery] : []), ...observerDeliveries(ticket, "RECHAZO_OBSERVADOR")],
    });

    return { idTicket: ticket.idTicket, idEvento, mailIds };
  });
}

// ---------------------------------------------------------------------------
// Nota interna
// ---------------------------------------------------------------------------

/**
 * Añade una nota que el solicitante no ve. No cambia el estado, y se admite
 * también en un ticket terminado: dejar constancia de algo después del cierre
 * no reabre nada.
 */
export async function addInternalNote(params: {
  idPersonal: string;
  idTicket: string;
  nota: string;
}): Promise<TicketEventResult> {
  return prisma.$transaction(async (tx) => {
    const { ticket } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.notaInterna,
      allowedStates: TICKET_STATES,
      stateMessage: "Este ticket no admite notas.",
    });

    const idEvento = await writeEvent(tx, {
      idTicket: ticket.idTicket,
      tipo: "COMENTARIO",
      idAutor: params.idPersonal,
      visibilidad: "INTERNO",
      contenido: params.nota,
      estadoNuevo: null,
    });

    // Una nota interna no avisa a nadie: es constancia, no conversación.
    return { idTicket: ticket.idTicket, idEvento, mailIds: [] };
  });
}

// ---------------------------------------------------------------------------
// Seguimiento (U11, tickets.md §11)
// ---------------------------------------------------------------------------

/**
 * Añade personas que siguen el ticket sin atenderlo. Solo en un ticket
 * abierto: seguir algo terminado no tiene nada que avisar.
 */
export async function addObservers(params: {
  idPersonal: string;
  idTicket: string;
  idObservadores: readonly string[];
}): Promise<TicketEventResult> {
  return prisma.$transaction(async (tx) => {
    const { ticket } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.gestionarObservadores,
      allowedStates: OPEN_STATES,
      stateMessage: "Solo se añaden observadores a un ticket abierto.",
    });

    const added = await addObserversInTx(tx, { ticket, idAutor: params.idPersonal, idPersonas: params.idObservadores });
    if (!added) {
      throw new TicketDomainError("DESTINO_INVALIDO", "Esas personas ya siguen el ticket, lo radicaron o lo atienden.");
    }
    return { idTicket: ticket.idTicket, idEvento: added.idEvento, mailIds: added.mailIds };
  });
}

/**
 * Retira a una persona del seguimiento. No le avisa: dejar de recibir avisos
 * de un ticket no necesita otro aviso.
 */
export async function removeObserver(params: {
  idPersonal: string;
  idTicket: string;
  idObservador: string;
}): Promise<TicketEventResult> {
  return prisma.$transaction(async (tx) => {
    const { ticket } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.gestionarObservadores,
      allowedStates: OPEN_STATES,
      stateMessage: "Solo se retiran observadores de un ticket abierto.",
    });

    if (!ticket.idObservadores.includes(params.idObservador)) {
      throw new TicketDomainError("DESTINO_INVALIDO", "Esa persona ya no sigue el ticket.");
    }

    const [, persona] = await Promise.all([
      tx.ticketObservador.delete({
        where: { idTicket_idPersonal: { idTicket: ticket.idTicket, idPersonal: params.idObservador } },
      }),
      tx.dimPersonal.findUniqueOrThrow({ where: { idPersonal: params.idObservador }, select: { nombreCompleto: true } }),
    ]);

    const idEvento = await writeEvent(tx, {
      idTicket: ticket.idTicket,
      tipo: "OBSERVADOR_RETIRADO",
      idAutor: params.idPersonal,
      visibilidad: "INTERNO",
      contenido: `Deja de seguir el ticket: ${persona.nombreCompleto}.`,
      estadoNuevo: null,
    });

    return { idTicket: ticket.idTicket, idEvento, mailIds: [] };
  });
}

/**
 * Pide a una persona concreta que confirme algo del ticket. **No bloquea**:
 * el ticket sigue su curso, y la solicitud queda en la historia y en la
 * bandeja de quien la recibe (decisión del 24-sep-2026). No es la
 * autorización excepcional de permisos.md §5: no exige justificación ni se
 * audita como excepción.
 *
 * Quien la recibe pasa a seguir el ticket si no lo veía ya: sin eso, el
 * aviso le llevaría a un ticket que no puede abrir. Esa incorporación no
 * escribe un evento propio; el de la solicitud ya dice por qué está ahí.
 */
export async function requestValidation(params: {
  idPersonal: string;
  idTicket: string;
  idDestinatario: string;
  comentario: string;
}): Promise<TicketEventResult> {
  return prisma.$transaction(async (tx) => {
    const { ticket } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.solicitarValidacion,
      allowedStates: OPEN_STATES,
      stateMessage: "Solo se pide validación en un ticket abierto.",
    });

    if (params.idDestinatario === params.idPersonal) {
      throw new TicketDomainError("DESTINO_INVALIDO", "No puedes pedirte la validación a ti.");
    }
    const destinatario = await tx.dimPersonal.findFirst({
      where: { idPersonal: params.idDestinatario, ...FOLLOWER_WHERE },
      select: { idPersonal: true, nombreCompleto: true },
    });
    if (!destinatario) {
      throw new TicketDomainError("DESTINO_INVALIDO", "Solo puedes pedir validación a una persona activa con acceso a HelpDesk.");
    }

    const idEvento = await writeEvent(tx, {
      idTicket: ticket.idTicket,
      tipo: "SOLICITUD_VALIDACION",
      idAutor: params.idPersonal,
      visibilidad: "INTERNO",
      contenido: `Validación solicitada a ${destinatario.nombreCompleto}.\n\n${params.comentario}`,
      estadoNuevo: null,
    });
    await tx.ticketValidacion.create({
      data: { idEvento, idTicket: ticket.idTicket, idDestinatario: destinatario.idPersonal },
    });

    const yaLoVe = [ticket.idSolicitante, ticket.idAsignado, ...ticket.idObservadores].includes(destinatario.idPersonal);
    if (!yaLoVe) {
      await tx.ticketObservador.create({
        data: { idTicket: ticket.idTicket, idPersonal: destinatario.idPersonal, agregadoPor: params.idPersonal },
      });
    }

    const mailIds = await deliverTicketEvent(tx, {
      idTicket: ticket.idTicket,
      idEvento,
      idAutor: params.idPersonal,
      texto: params.comentario,
      deliveries: [{ tipo: "EMPLEADO", kind: "SOLICITUD_VALIDACION", idPersonal: destinatario.idPersonal }],
    });

    return { idTicket: ticket.idTicket, idEvento, mailIds };
  });
}

/**
 * El empleado que radicó el ticket escribe en él sin cerrarlo: aclarar algo,
 * añadir un dato, preguntar cómo va. Lo ve el equipo y el propio
 * solicitante, y la persona responsable recibe aviso. En el prototipo de TI
 * es el «Responder» de la vista del solicitante.
 *
 * No cambia el estado ni el plazo: en la v1 no hay espera del solicitante
 * (tickets.md §4, decisión del 25-sep-2026).
 */
export async function commentAsRequester(params: {
  idPersonal: string;
  idTicket: string;
  comentario: string;
}): Promise<TicketEventResult> {
  return prisma.$transaction(async (tx) => {
    const { ticket } = await lockAndAuthorize({
      tx,
      idTicket: params.idTicket,
      idPersonal: params.idPersonal,
      action: TICKET_ACTIONS.comentarSolicitante,
      allowedStates: OPEN_STATES,
      stateMessage: "Este ticket ya terminó. Si el problema sigue, radica uno nuevo.",
    });

    const idEvento = await writeEvent(tx, {
      idTicket: ticket.idTicket,
      tipo: "COMENTARIO_SOLICITANTE",
      idAutor: params.idPersonal,
      visibilidad: "AMBOS",
      contenido: params.comentario,
      estadoNuevo: null,
    });

    const mailIds = ticket.idAsignado
      ? await deliverTicketEvent(tx, {
          idTicket: ticket.idTicket,
          idEvento,
          idAutor: params.idPersonal,
          texto: params.comentario,
          deliveries: [
            { tipo: "EMPLEADO", kind: "COMENTARIO_SOLICITANTE_RESPONSABLE", idPersonal: ticket.idAsignado },
          ],
        })
      : [];

    return { idTicket: ticket.idTicket, idEvento, mailIds };
  });
}
