import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { AuthorizationDeniedError, requireGrant, requireTicketAction } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS, type TicketAction } from "@/server/authorization/catalog";
import { enqueueTicketMail, type MailDelivery } from "@/server/notifications/ticket-notifications";
import type { TicketMailKind } from "@/server/notifications/ticket-mail-content";
import { recordPortalAudit } from "@/server/portal/portal-audit";
import type { PortalAccess } from "@/server/portal/portal-access";

import { TicketDomainError, translateCreationFailure } from "./ticket-errors";
import { TICKET_STATES, isOperableInHelpDesk, isTicketState, type TicketState } from "./ticket-state";

/**
 * Comandos del ciclo del ticket (specs/tickets.md §4.1: T1 y T3 desde U8;
 * T2, T4, T7, T8 y la nota interna desde U7).
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
 * 5. Registrar, en la misma transacción, los correos que la acción produce
 *    (`enqueueTicketMail`). Nada sale de la base dentro de la transacción:
 *    la acción de servidor los envía después del commit, con los ids que
 *    devuelven estos comandos.
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
  origenSistema: string;
  estado: TicketState;
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
      origen_sistema: string;
      nombre_estado: string;
    }[]
  >`
    SELECT ticket.id_ticket::text,
           ticket.id_solicitante::text,
           ticket.id_contacto_portal::text,
           ticket.id_asignado::text,
           ticket.id_area_destino::text,
           ticket.origen_sistema,
           estado.nombre_estado
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
    origenSistema: row.origen_sistema,
    estado: row.nombre_estado,
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
      console.warn(`[tickets] ${error.message} ticket=${params.idTicket} persona=${params.idPersonal}`);
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
    tipo: "REASIGNACION" | "RESPUESTA" | "RECHAZO" | "COMENTARIO";
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
 * dos casos no se mezclan: el empleado recibe el enlace a la bandeja y el
 * vocabulario interno; el contacto, el enlace al portal.
 */
function requesterDelivery(
  ticket: LockedTicket,
  internalKind: TicketMailKind,
  clientKind: TicketMailKind,
): MailDelivery | null {
  if (ticket.idSolicitante) return { kind: internalKind, destinatario: { tipo: "EMPLEADO", idPersonal: ticket.idSolicitante } };
  if (ticket.idContactoPortal) return { kind: clientKind, destinatario: { tipo: "CONTACTO", idContacto: ticket.idContactoPortal } };
  return null;
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
 */
export async function createInternalTicket(params: {
  idPersonal: string;
  idTipoReq: string;
  prioridad: string;
  descripcion: string;
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
        ? await enqueueTicketMail(tx, {
            idTicket: row.id_ticket,
            idEvento: creado.idEvento,
            idRemitente: params.idPersonal,
            texto: null,
            deliveries: [
              { kind: "CREACION_RESPONSABLE", destinatario: { tipo: "EMPLEADO", idPersonal: creado.factTicket.idAsignado } },
            ],
          })
        : [];

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
 * la cola de clasificación es donde se ve lo que llega.
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
 * Clasifica un ticket del portal: el tipo de requerimiento decide el área,
 * la regla de enrutamiento decide la persona, y empieza el plazo de 3 días
 * hábiles. Todo eso lo hace `helpdesk.redirigir_ticket`, en una sola regla
 * compartida con la creación interna.
 *
 * Autoriza `ticket.redirigir` contra la fila bloqueada. Un ticket sin
 * clasificar no tiene responsable ni área, así que solo el alcance `TOTAL`
 * lo cubre (scope.ts); en la v1 lo tiene `CLASIFICADOR`.
 *
 * No encola nada hacia SharePoint: los tickets del portal viven solo en
 * HelpDesk hasta U9 (migración 20260928110000, §5b).
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
        stateMessage: "Este ticket ya fue clasificado.",
      });
      if (ticket.idContactoPortal === null || ticket.idAreaDestino !== null) {
        throw new TicketDomainError("ESTADO_NO_PERMITE", "Este ticket ya fue clasificado o no viene del portal.");
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
      // Como al crear un ticket interno: avisa a la persona que lo recibe,
      // desde el buzón de quien clasificó.
      const mailIds = redirigido.idAsignado
        ? await enqueueTicketMail(tx, {
            idTicket: ticket.idTicket,
            idEvento,
            idRemitente: params.idPersonal,
            texto: null,
            deliveries: [
              { kind: "REDIRECCION_RESPONSABLE", destinatario: { tipo: "EMPLEADO", idPersonal: redirigido.idAsignado } },
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
      throw new TicketDomainError("ESTADO_NO_PERMITE", "Este ticket ya fue clasificado.");
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
    // El comentario solo entra en el correo del equipo (ticket-mail-content.ts).
    const mailIds = await enqueueTicketMail(tx, {
      idTicket: ticket.idTicket,
      idEvento,
      idRemitente: params.idPersonal,
      texto: params.comentario,
      deliveries: [
        { kind: "REASIGNACION_RESPONSABLE", destinatario: { tipo: "EMPLEADO", idPersonal: destino.idPersonal } },
        // Solo al solicitante interno. Al contacto de un cliente no se le
        // avisa de un movimiento dentro del equipo: sigue viendo su ticket en
        // atención, y quién lo atiende es asunto interno.
        ...(ticket.idSolicitante
          ? [{ kind: "REASIGNACION_SOLICITANTE" as const, destinatario: { tipo: "EMPLEADO" as const, idPersonal: ticket.idSolicitante } }]
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
    const mailIds = delivery
      ? await enqueueTicketMail(tx, {
          idTicket: ticket.idTicket,
          idEvento,
          idRemitente: params.idPersonal,
          texto: params.respuesta,
          deliveries: [delivery],
        })
      : [];

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
    const mailIds = delivery
      ? await enqueueTicketMail(tx, {
          idTicket: ticket.idTicket,
          idEvento,
          idRemitente: params.idPersonal,
          texto: params.motivo,
          deliveries: [delivery],
        })
      : [];

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
