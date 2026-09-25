/**
 * Contenido de los correos del ticket. Puro, sin I/O: se prueba sin base ni
 * red (`ticket-mail-content.test.mts`).
 *
 * Qué correo produce cada acción, fiel al legacy
 * (reglas-negocio-powerapps.md §5-§7):
 * - crear → a quien recibe el ticket;
 * - reasignar → a la nueva persona responsable **y** a quien lo radicó;
 * - responder → a quien lo radicó, con la respuesta;
 * - rechazar → a quien lo radicó, con el motivo.
 *
 * Todo texto que viene de una persona (descripción, respuesta, nombres) se
 * escapa antes de entrar al HTML: un ticket cuya descripción trae `<script>`
 * o un enlace disfrazado no puede convertirse en contenido activo del correo
 * de otra persona.
 *
 * HTML semántico sin estilos: cada cliente de correo pinta distinto, y un
 * mensaje sobrio con el enlace al ticket es lo que la persona necesita.
 * Lo que el solicitante no debe ver (el comentario interno de una
 * reasignación) nunca entra en su correo.
 */
export type TicketMailKind =
  | "CREACION_RESPONSABLE"
  | "REASIGNACION_RESPONSABLE"
  | "REASIGNACION_SOLICITANTE"
  | "RESPUESTA_SOLICITANTE"
  | "RECHAZO_SOLICITANTE";

export interface TicketMailContext {
  codigo: string;
  descripcion: string;
  area: string | null;
  tipo: string | null;
  solicitante: string;
  remitente: string;
  responsable: string | null;
  /** Respuesta, motivo del rechazo o comentario de la reasignación, según el caso. */
  texto: string | null;
  vence: string | null;
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
function paragraph(value: string): string {
  return `<p>${escapeHtml(value).replace(/\r?\n/g, "<br>")}</p>`;
}

function detailList(ctx: TicketMailContext, extra: [string, string | null][] = []): string {
  const rows: [string, string | null][] = [
    ["Ticket", ctx.codigo],
    ["Área", ctx.area],
    ["Tipo", ctx.tipo],
    ["Radicado por", ctx.solicitante],
    ...extra,
  ];
  return `<ul>${rows
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join("")}</ul>`;
}

function link(ctx: TicketMailContext): string {
  return `<p><a href="${escapeHtml(ctx.url)}">Abrir el ticket ${escapeHtml(ctx.codigo)} en HelpDesk</a></p>`;
}

export function buildTicketMail(kind: TicketMailKind, ctx: TicketMailContext): { subject: string; html: string } {
  switch (kind) {
    case "CREACION_RESPONSABLE":
      return {
        subject: `Nuevo ticket ${ctx.codigo} asignado a ti`,
        html: [
          `<p>${escapeHtml(ctx.solicitante)} radicó un ticket que te corresponde atender.</p>`,
          detailList(ctx, [["Vence", ctx.vence]]),
          paragraph(ctx.descripcion),
          link(ctx),
        ].join(""),
      };
    case "REASIGNACION_RESPONSABLE":
      return {
        subject: `Se te reasignó el ticket ${ctx.codigo}`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} te reasignó este ticket. El plazo de respuesta no cambia.</p>`,
          detailList(ctx, [["Vence", ctx.vence]]),
          paragraph(ctx.descripcion),
          ctx.texto ? `<p><strong>Comentario:</strong></p>${paragraph(ctx.texto)}` : "",
          link(ctx),
        ].join(""),
      };
    case "REASIGNACION_SOLICITANTE":
      return {
        subject: `Tu ticket ${ctx.codigo} tiene nueva persona responsable`,
        html: [
          `<p>Tu ticket ahora lo atiende ${escapeHtml(ctx.responsable ?? "otra persona del área")}.</p>`,
          detailList(ctx),
          link(ctx),
        ].join(""),
      };
    case "RESPUESTA_SOLICITANTE":
      return {
        subject: `Respuesta a tu ticket ${ctx.codigo}`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} respondió tu ticket y quedó cerrado.</p>`,
          paragraph(ctx.texto ?? ""),
          detailList(ctx),
          link(ctx),
        ].join(""),
      };
    case "RECHAZO_SOLICITANTE":
      return {
        subject: `Tu ticket ${ctx.codigo} fue rechazado`,
        html: [
          `<p>${escapeHtml(ctx.remitente)} rechazó tu ticket. Motivo:</p>`,
          paragraph(ctx.texto ?? ""),
          detailList(ctx),
          link(ctx),
        ].join(""),
      };
  }
}
