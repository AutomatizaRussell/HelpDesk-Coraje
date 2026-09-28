import { escapeHtml } from "@/server/notifications/ticket-mail-content";

import { OTP_TTL_MINUTES } from "./portal-policy";

/**
 * Contenido de los correos que emite la firma hacia sus clientes: la
 * invitación al portal y el código de acceso. Puro, sin I/O
 * (`portal-mail-content.test.mts`).
 *
 * Todo texto que viene de una persona (nombres, razón social) se escapa: un
 * nombre de contacto con `<a href=…>` no puede convertirse en un enlace del
 * correo de la firma.
 *
 * Estos dos correos son los únicos del sistema que llevan un secreto (el
 * enlace de un solo uso, el código). Se construyen en memoria, se entregan a
 * n8n y no se guardan en ninguna parte (D4, migración 20260928110000).
 */

export interface InvitationMailInput {
  nombreContacto: string;
  nombreCliente: string;
  url: string;
  venceEl: string;
}

export function buildInvitationMail(input: InvitationMailInput): { subject: string; html: string } {
  return {
    subject: `Tu acceso al portal de tickets de Russell Bedford`,
    html: [
      `<p>Hola, ${escapeHtml(input.nombreContacto)}:</p>`,
      `<p>Te damos acceso al portal de tickets de Russell Bedford como contacto de <strong>${escapeHtml(input.nombreCliente)}</strong>. Desde allí puedes radicar tus solicitudes y seguir su estado.</p>`,
      `<p><a href="${escapeHtml(input.url)}">Activar mi acceso</a></p>`,
      `<p>El enlace es personal, sirve una sola vez y vence el ${escapeHtml(input.venceEl)}. Al activarlo, este navegador queda recordado; desde otro navegador podrás entrar con tu correo y un código.</p>`,
      `<p>Si no esperabas este mensaje, puedes ignorarlo.</p>`,
    ].join(""),
  };
}

export interface CodeMailInput {
  nombreContacto: string;
  codigo: string;
}

export function buildCodeMail(input: CodeMailInput): { subject: string; html: string } {
  return {
    subject: `Tu código de acceso al portal de tickets`,
    html: [
      `<p>Hola, ${escapeHtml(input.nombreContacto)}:</p>`,
      `<p>Tu código para entrar al portal de tickets de Russell Bedford es:</p>`,
      `<p><strong>${escapeHtml(input.codigo)}</strong></p>`,
      `<p>Vence en ${OTP_TTL_MINUTES} minutos y sirve una sola vez.</p>`,
      `<p>Si no lo pediste, ignora este mensaje: nadie puede entrar sin el código.</p>`,
    ].join(""),
  };
}
