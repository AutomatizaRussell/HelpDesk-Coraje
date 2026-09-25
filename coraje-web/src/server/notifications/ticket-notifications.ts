import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/features/tickets/format";
import { AuthorizationDeniedError, requireGrant } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import { publicTicketUrl } from "@/server/auth/conecta-return";
import { TicketDomainError } from "@/server/tickets/ticket-errors";

import { MailSendError, sendMailAsEmployee } from "./graph-mail";
import { isMailState, type MailState } from "./mail-state";
import { buildTicketMail, type TicketMailKind } from "./ticket-mail-content";

/**
 * Correos del ticket (D6): registro en PostgreSQL, envío después del commit,
 * reenvío manual. **Sin worker y sin cron**, por el objetivo de economía de
 * recursos (CLAUDE.md):
 *
 * 1. El comando escribe cada correo como `PENDIENTE` en la **misma
 *    transacción** que su evento (`enqueueTicketMail`). Si la acción no se
 *    guarda, tampoco queda correo que enviar; si se guarda, el correo queda
 *    registrado aunque el envío no llegue a ocurrir.
 * 2. La acción de servidor lo envía justo después del commit
 *    (`dispatchTicketMail`), y la persona ve el resultado en ese momento.
 * 3. Si el envío falla, o el proceso muere antes de enviar, la fila queda
 *    `FALLIDO` o `PENDIENTE` y el ticket la muestra con la opción de
 *    reenviarla (`resendTicketMail`). No hay reintento automático: el caso
 *    típico (autorización de correo vencida) solo lo arregla la persona
 *    volviendo a entrar, y reintentarlo solo no serviría.
 */

type Tx = Prisma.TransactionClient;

/** Un envío que lleva más de esto en `ENVIANDO` se da por muerto y se puede reclamar. */
const STALE_SENDING_MS = 5 * 60 * 1000;

export interface MailDelivery {
  kind: TicketMailKind;
  idDestinatario: string;
}

/**
 * Registra los correos de una acción, dentro de su transacción. Omite a quien
 * no tiene correo y a quien sería remitente y destinatario a la vez: nadie
 * necesita que le avisen de lo que acaba de hacer.
 *
 * @returns los ids de los correos creados, para enviarlos tras el commit.
 */
export async function enqueueTicketMail(
  tx: Tx,
  params: { idTicket: string; idEvento: string; idRemitente: string; texto: string | null; deliveries: MailDelivery[] },
): Promise<string[]> {
  const deliveries = params.deliveries.filter((delivery) => delivery.idDestinatario !== params.idRemitente);
  if (deliveries.length === 0) return [];

  const ticket = await tx.factTicket.findUniqueOrThrow({
    where: { idTicket: params.idTicket },
    select: {
      codigoTicket: true,
      descripcionProblema: true,
      fechaLimite: true,
      dimArea: { select: { nombreArea: true } },
      dimTipoRequerimiento: { select: { tipoRequerimiento: true } },
      dimPersonalSolicitante: { select: { nombreCompleto: true } },
      dimPersonalAsignado: { select: { nombreCompleto: true } },
    },
  });
  const personas = await tx.dimPersonal.findMany({
    where: { idPersonal: { in: [params.idRemitente, ...deliveries.map((delivery) => delivery.idDestinatario)] } },
    select: { idPersonal: true, nombreCompleto: true, correoCorporativo: true },
  });
  const persona = new Map(personas.map((row) => [row.idPersonal, row]));
  const remitente = persona.get(params.idRemitente)?.nombreCompleto ?? "HelpDesk";

  const context = {
    codigo: ticket.codigoTicket ?? "sin código",
    descripcion: ticket.descripcionProblema,
    area: ticket.dimArea?.nombreArea ?? null,
    tipo: ticket.dimTipoRequerimiento?.tipoRequerimiento ?? null,
    solicitante: ticket.dimPersonalSolicitante?.nombreCompleto ?? "Sin solicitante",
    remitente,
    responsable: ticket.dimPersonalAsignado?.nombreCompleto ?? null,
    texto: params.texto,
    vence: ticket.fechaLimite ? formatDate(ticket.fechaLimite) : null,
    url: publicTicketUrl(params.idTicket),
  };

  const ids: string[] = [];
  for (const delivery of deliveries) {
    const destinatario = persona.get(delivery.idDestinatario);
    const correo = destinatario?.correoCorporativo?.trim();
    if (!correo) continue;
    const { subject, html } = buildTicketMail(delivery.kind, context);
    const created = await tx.ticketNotificacion.create({
      data: {
        idTicket: params.idTicket,
        idEvento: params.idEvento,
        idRemitente: params.idRemitente,
        idDestinatario: delivery.idDestinatario,
        destinatarioCorreo: correo.slice(0, 150),
        asunto: subject.slice(0, 300),
        cuerpoHtml: html,
      },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return ids;
}

export interface MailDispatchResult {
  id: string;
  destinatario: string;
  ok: boolean;
  error: string | null;
}

/**
 * Reclama un correo para enviarlo. El `UPDATE … WHERE estado …` es la
 * exclusión: si dos envíos del mismo correo coinciden (doble clic en
 * «Reenviar»), solo uno lo reclama y el otro no envía nada.
 */
async function claim(id: string) {
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
  const rows = await prisma.$queryRaw<
    { id: string; id_remitente: string; destinatario_correo: string; asunto: string; cuerpo_html: string }[]
  >`
    UPDATE helpdesk.ticket_notificacion
    SET estado = 'ENVIANDO', intentos = intentos + 1, updated_at = NOW()
    WHERE id = ${id}::uuid
      AND (estado IN ('PENDIENTE', 'FALLIDO') OR (estado = 'ENVIANDO' AND updated_at < ${staleBefore}))
    RETURNING id::text, id_remitente::text, destinatario_correo, asunto, cuerpo_html
  `;
  return rows[0] ?? null;
}

async function sendClaimed(row: NonNullable<Awaited<ReturnType<typeof claim>>>): Promise<MailDispatchResult> {
  try {
    await sendMailAsEmployee({
      idPersonal: row.id_remitente,
      message: { subject: row.asunto, html: row.cuerpo_html, to: row.destinatario_correo },
    });
    await prisma.ticketNotificacion.update({
      where: { id: row.id },
      data: { estado: "ENVIADO", enviadoAt: new Date(), ultimoError: null, updatedAt: new Date() },
    });
    return { id: row.id, destinatario: row.destinatario_correo, ok: true, error: null };
  } catch (error) {
    const message =
      error instanceof MailSendError ? error.message : "No fue posible enviar el correo. Intenta reenviarlo en unos minutos.";
    if (!(error instanceof MailSendError)) console.error("[correo] Fallo inesperado al enviar:", error);
    await prisma.ticketNotificacion.update({
      where: { id: row.id },
      data: { estado: "FALLIDO", ultimoError: message.slice(0, 1000), updatedAt: new Date() },
    });
    return { id: row.id, destinatario: row.destinatario_correo, ok: false, error: message };
  }
}

/**
 * Envía los correos recién registrados, después del commit de la acción.
 * Nunca lanza: un correo que no sale no deshace la acción, ya guardada. El
 * resultado dice a la persona qué pasó.
 */
export async function dispatchTicketMail(ids: readonly string[]): Promise<MailDispatchResult[]> {
  const results: MailDispatchResult[] = [];
  for (const id of ids) {
    try {
      const row = await claim(id);
      if (row) results.push(await sendClaimed(row));
    } catch (error) {
      console.error(`[correo] No se pudo procesar el correo ${id}:`, error);
      results.push({ id, destinatario: "", ok: false, error: "No fue posible enviar el correo. Intenta reenviarlo." });
    }
  }
  return results;
}

/**
 * Reenvía un correo que no salió. Solo lo puede hacer quien lo envió: sale de
 * su buzón y con su autorización, así que nadie más puede enviarlo en su
 * nombre. Esa comprobación de identidad no es una comparación de rol: el rol
 * lo decide `ticket.notificacion.reenviar`, y la identidad, el buzón.
 */
export async function resendTicketMail(params: { idPersonal: string; idNotificacion: string }): Promise<{ idTicket: string; result: MailDispatchResult }> {
  try {
    await requireGrant(params.idPersonal, TICKET_ACTIONS.reenviarNotificacion);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      throw new TicketDomainError("NO_AUTORIZADO", "No tienes permiso para reenviar correos.");
    }
    throw error;
  }

  const notificacion = await prisma.ticketNotificacion.findUnique({
    where: { id: params.idNotificacion },
    select: { idTicket: true, idRemitente: true, estado: true },
  });
  if (!notificacion || notificacion.idRemitente !== params.idPersonal) {
    throw new TicketDomainError("NO_AUTORIZADO", "Solo quien envió un correo puede reenviarlo.");
  }
  if (notificacion.estado === "ENVIADO") {
    throw new TicketDomainError("ESTADO_NO_PERMITE", "Ese correo ya se envió.");
  }

  const row = await claim(params.idNotificacion);
  if (!row) throw new TicketDomainError("ESTADO_NO_PERMITE", "Ese correo se está enviando en este momento.");
  return { idTicket: notificacion.idTicket, result: await sendClaimed(row) };
}

export interface TicketMailRow {
  id: string;
  destinatario: string;
  asunto: string;
  estado: MailState;
  error: string | null;
  fecha: Date;
  puedeReenviar: boolean;
}

/**
 * Correos de un ticket. El equipo ve todos; quien solo radicó el ticket, los
 * suyos (los que envió o recibió). Solo quien envió un correo puede
 * reenviarlo, y solo si no salió.
 */
export async function listTicketMail(params: {
  idTicket: string;
  idPersonal: string;
  teamView: boolean;
}): Promise<TicketMailRow[]> {
  const rows = await prisma.ticketNotificacion.findMany({
    where: {
      idTicket: params.idTicket,
      ...(params.teamView ? {} : { OR: [{ idRemitente: params.idPersonal }, { idDestinatario: params.idPersonal }] }),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      idRemitente: true,
      asunto: true,
      estado: true,
      ultimoError: true,
      createdAt: true,
      updatedAt: true,
      destinatario: { select: { nombreCompleto: true } },
    },
  });
  const staleBefore = Date.now() - STALE_SENDING_MS;
  return rows.map((row) => {
    // El CHECK de la tabla impide otro valor; si apareciera, se muestra como
    // fallido para que alguien lo mire, no como enviado.
    const estado: MailState = isMailState(row.estado) ? row.estado : "FALLIDO";
    // Un PENDIENTE o ENVIANDO reciente lo está enviando la propia acción; solo
    // si se quedó ahí (el proceso murió) se ofrece reenviarlo.
    const stuck = (estado === "ENVIANDO" || estado === "PENDIENTE") && row.updatedAt.getTime() < staleBefore;
    return {
      id: row.id,
      destinatario: row.destinatario.nombreCompleto,
      asunto: row.asunto,
      estado,
      error: row.ultimoError,
      fecha: row.createdAt,
      puedeReenviar: row.idRemitente === params.idPersonal && (estado === "FALLIDO" || stuck),
    };
  });
}
