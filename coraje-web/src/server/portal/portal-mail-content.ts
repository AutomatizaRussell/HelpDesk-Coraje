import { renderMail, type MailBlock } from "@/server/notifications/mail-layout";

import { OTP_TTL_MINUTES } from "./portal-policy";

/**
 * Contenido de los correos que emite la firma hacia sus clientes: la
 * invitación al portal y el código de acceso. Puro, sin I/O
 * (`portal-mail-content.test.mts`).
 *
 * Se dibujan con el mismo layout que los del ticket (`mail-layout.ts`), que
 * escapa todo texto: un nombre de contacto con `<a href=…>` no puede
 * convertirse en un enlace del correo de la firma.
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

function mail(subject: string, blocks: MailBlock[]): { subject: string; html: string } {
  return { subject, html: renderMail(subject, blocks) };
}

export function buildInvitationMail(input: InvitationMailInput): { subject: string; html: string } {
  return mail(`Tu acceso al portal de tickets de Russell Bedford`, [
    { kind: "greeting", name: input.nombreContacto },
    {
      kind: "paragraph",
      parts: [
        "Te damos acceso al portal de tickets de Russell Bedford como contacto de ",
        { strong: input.nombreCliente },
        ". Desde allí puedes radicar tus solicitudes y seguir su estado.",
      ],
    },
    { kind: "button", label: "Activar mi acceso", href: input.url },
    {
      kind: "note",
      text: `El enlace es personal, sirve una sola vez y vence el ${input.venceEl}. Al activarlo, este navegador queda recordado; desde otro navegador podrás entrar con tu correo y un código.`,
    },
    { kind: "note", text: "Si no esperabas este mensaje, puedes ignorarlo." },
  ]);
}

export interface CodeMailInput {
  nombreContacto: string;
  codigo: string;
}

export function buildCodeMail(input: CodeMailInput): { subject: string; html: string } {
  return mail(`Tu código de acceso al portal de tickets`, [
    { kind: "greeting", name: input.nombreContacto },
    { kind: "paragraph", parts: ["Tu código para entrar al portal de tickets de Russell Bedford es:"] },
    { kind: "code", value: input.codigo },
    { kind: "note", text: `Vence en ${OTP_TTL_MINUTES} minutos y sirve una sola vez.` },
    { kind: "note", text: "Si no lo pediste, ignora este mensaje: nadie puede entrar sin el código." },
  ]);
}
