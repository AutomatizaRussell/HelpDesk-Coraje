/**
 * Contenido de los correos del ticket. Puro, sin I/O: se prueba sin base ni
 * red (`ticket-mail-content.test.mts`).
 *
 * Qué correo produce cada acción (U29, tickets.md §12.1, decisión del
 * 03-nov-2026: «un correo al observador, uno al aprobador, uno al abrir el
 * ticket y uno al cerrarlo»):
 * - crear → a la persona responsable, con la descripción;
 * - añadir observadores (al crear o después) → a cada observador nuevo;
 * - pedir aprobación → a quien debe aprobar, con lo que se le pide;
 * - responder, que cierra → a quien radicó y a los observadores, con la
 *   respuesta;
 * - responder un ticket del portal (U8) → al contacto, con la respuesta.
 *
 * Todo lo demás llega solo a la campana. El escalamiento diario de los
 * pendientes se retiró en U29.
 *
 * El contacto nunca recibe la clasificación ni el nombre del área interna que
 * la hizo: solo lo que le toca saber. Su enlace lleva al portal; el de un
 * empleado, al detalle del ticket en HelpDesk.
 *
 * Todo texto que viene de una persona (descripción, respuesta, nombres) se
 * escapa antes de entrar al HTML: un ticket cuya descripción trae `<script>`
 * o un enlace disfrazado no puede convertirse en contenido activo del correo
 * de otra persona.
 *
 * HTML semántico sin estilos: cada cliente de correo pinta distinto, y un
 * mensaje sobrio con el enlace al ticket es lo que la persona necesita.
 */
/** Correos a empleados (U29). */
export type EmployeeMailKind = "CREACION_EMPLEADO" | "OBSERVADOR_EMPLEADO" | "APROBACION_EMPLEADO" | "CIERRE_EMPLEADO";
/** Correo al contacto de un cliente (U8). */
export type ClientMailKind = "RESPUESTA_CLIENTE";
export type TicketMailKind = EmployeeMailKind | ClientMailKind;

export interface TicketMailContext {
  codigo: string;
  remitente: string;
  /** Lo que escribió quien actúa: la respuesta o lo que se pide aprobar. */
  texto: string | null;
  /** La descripción del ticket, para el correo de creación. */
  descripcion?: string | null;
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
    case "CREACION_EMPLEADO":
      return {
        subject: `Nuevo ticket ${ctx.codigo} para atender`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} radicó el ticket ${escapeHtml(ctx.codigo)} y te corresponde atenderlo.</p>`,
          paragraph(ctx.descripcion ?? ""),
          ticketLink(ctx),
        ].join(""),
      };
    case "OBSERVADOR_EMPLEADO":
      return {
        subject: `Sigues el ticket ${ctx.codigo}`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} te añadió como observador del ticket ${escapeHtml(ctx.codigo)}. Lo puedes consultar y te llegará un correo cuando se cierre.</p>`,
          ticketLink(ctx),
        ].join(""),
      };
    case "APROBACION_EMPLEADO":
      return {
        subject: `Te piden aprobar algo del ticket ${ctx.codigo}`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} te pide aprobar lo siguiente. El ticket no se puede cerrar hasta que respondas.</p>`,
          paragraph(ctx.texto ?? ""),
          ticketLink(ctx, "Aprobar o no aprobar en HelpDesk"),
        ].join(""),
      };
    case "CIERRE_EMPLEADO":
      return {
        subject: `El ticket ${ctx.codigo} quedó cerrado`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} respondió el ticket ${escapeHtml(ctx.codigo)} y quedó cerrado. Respuesta:</p>`,
          paragraph(ctx.texto ?? ""),
          ticketLink(ctx),
        ].join(""),
      };
  }
}

/** Enlace para un empleado: al detalle del ticket en HelpDesk. */
function ticketLink(ctx: TicketMailContext, label = `Abrir ${ctx.codigo} en HelpDesk`): string {
  return `<p><a href="${escapeHtml(ctx.url)}">${escapeHtml(label)}</a></p>`;
}

/** Enlace para un contacto de cliente: al portal, con su vocabulario. */
function clientLink(ctx: TicketMailContext): string {
  return `<p><a href="${escapeHtml(ctx.url)}">Ver la solicitud ${escapeHtml(ctx.codigo)} en el portal</a></p>`;
}
