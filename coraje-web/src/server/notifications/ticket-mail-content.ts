/**
 * Contenido de los correos del ticket. Puro, sin I/O: se prueba sin base ni
 * red (`ticket-mail-content.test.mts`).
 *
 * **Desde U15 solo los recibe el contacto de un cliente** (tickets.md §12).
 * A los empleados les llega un aviso a la campana (`ticket-notice-kinds.ts`)
 * y, si un pendiente se queda sin atender, un correo de escalamiento
 * (`ticket-notice-content.ts`). Los correos a empleados escritos antes de U15
 * siguen en `helpdesk.ticket_notificacion` con su asunto y su cuerpo ya
 * construidos, así que reenviarlos no necesita este módulo.
 *
 * Qué correo produce cada acción sobre un ticket del portal (U8):
 * - responder → al contacto, con la respuesta;
 * - rechazar → al contacto, con el motivo.
 *
 * El contacto nunca recibe la clasificación ni el nombre del área interna que
 * la hizo: solo lo que le toca saber. El enlace lleva al portal, no a la
 * bandeja interna.
 *
 * Todo texto que viene de una persona (descripción, respuesta, nombres) se
 * escapa antes de entrar al HTML: un ticket cuya descripción trae `<script>`
 * o un enlace disfrazado no puede convertirse en contenido activo del correo
 * de otra persona.
 *
 * HTML semántico sin estilos: cada cliente de correo pinta distinto, y un
 * mensaje sobrio con el enlace al ticket es lo que la persona necesita.
 */
export type TicketMailKind = "RESPUESTA_CLIENTE" | "RECHAZO_CLIENTE";

export interface TicketMailContext {
  codigo: string;
  remitente: string;
  /** La respuesta o el motivo del rechazo. */
  texto: string | null;
  url: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Texto libre a párrafo HTML, conservando los saltos de línea. */
export function paragraph(value: string): string {
  return `<p>${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p>`;
}

export function buildTicketMail(kind: TicketMailKind, ctx: TicketMailContext): { subject: string; html: string } {
  switch (kind) {
    case "RESPUESTA_CLIENTE":
      return {
        subject: `Respuesta a tu solicitud ${ctx.codigo}`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} respondió tu solicitud y quedó cerrada.</p>`,
          paragraph(ctx.texto ?? ""),
          clientLink(ctx),
        ].join(""),
      };
    case "RECHAZO_CLIENTE":
      return {
        subject: `Tu solicitud ${ctx.codigo} no se atenderá`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} revisó tu solicitud y no se atenderá. Motivo:</p>`,
          paragraph(ctx.texto ?? ""),
          clientLink(ctx),
        ].join(""),
      };
  }
}

/** Enlace para un contacto de cliente: al portal, con su vocabulario. */
function clientLink(ctx: TicketMailContext): string {
  return `<p><a href="${escapeHtml(ctx.url)}">Ver la solicitud ${escapeHtml(ctx.codigo)} en el portal</a></p>`;
}
