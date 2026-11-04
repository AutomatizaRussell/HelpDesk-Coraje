import { renderMail, type MailBlock } from "./mail-layout";

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
 * Este módulo dice *qué* lleva cada correo, en bloques; cómo se ve lo decide
 * `mail-layout.ts`, que además escapa todo texto: una descripción con
 * `<script>` no puede volverse contenido activo en el correo de otra persona.
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

export function buildTicketMail(kind: TicketMailKind, ctx: TicketMailContext): { subject: string; html: string } {
  const { subject, blocks } = compose(kind, ctx);
  return { subject, html: renderMail(subject, blocks) };
}

function compose(kind: TicketMailKind, ctx: TicketMailContext): { subject: string; blocks: MailBlock[] } {
  const quien = { strong: ctx.remitente };
  const ticket = { strong: ctx.codigo };
  const abrir: MailBlock = { kind: "button", label: `Abrir ${ctx.codigo} en HelpDesk`, href: ctx.url };

  switch (kind) {
    case "RESPUESTA_CLIENTE":
      return {
        subject: `Respuesta a tu solicitud ${ctx.codigo}`,
        blocks: [
          { kind: "title", text: "Tu solicitud tiene respuesta" },
          { kind: "paragraph", parts: [quien, " respondió tu solicitud ", ticket, " y quedó cerrada."] },
          ...quote("Respuesta", ctx.texto),
          { kind: "button", label: "Ver la solicitud en el portal", href: ctx.url },
        ],
      };
    case "CREACION_EMPLEADO":
      return {
        subject: `Nuevo ticket ${ctx.codigo} para atender`,
        blocks: [
          { kind: "title", text: "Nuevo ticket para atender" },
          { kind: "paragraph", parts: [quien, " radicó el ticket ", ticket, " y te corresponde atenderlo."] },
          ...quote("Descripción", ctx.descripcion),
          abrir,
        ],
      };
    case "OBSERVADOR_EMPLEADO":
      return {
        subject: `Sigues el ticket ${ctx.codigo}`,
        blocks: [
          { kind: "title", text: "Eres observador de un ticket" },
          {
            kind: "paragraph",
            parts: [quien, " te añadió como observador del ticket ", ticket, ". Lo puedes consultar y te llegará un correo cuando se cierre."],
          },
          abrir,
        ],
      };
    case "APROBACION_EMPLEADO":
      return {
        subject: `Te piden aprobar algo del ticket ${ctx.codigo}`,
        blocks: [
          { kind: "title", text: "Aprobación pendiente" },
          {
            kind: "paragraph",
            parts: [quien, " te pide aprobar lo siguiente en el ticket ", ticket, ". El ticket no se puede cerrar hasta que respondas."],
          },
          ...quote("Lo que se pide aprobar", ctx.texto),
          { kind: "button", label: "Aprobar o no aprobar en HelpDesk", href: ctx.url },
        ],
      };
    case "CIERRE_EMPLEADO":
      return {
        subject: `El ticket ${ctx.codigo} quedó cerrado`,
        blocks: [
          { kind: "title", text: "Ticket cerrado" },
          { kind: "paragraph", parts: [quien, " respondió el ticket ", ticket, " y quedó cerrado."] },
          ...quote("Respuesta", ctx.texto),
          abrir,
        ],
      };
  }
}

/** La cita solo si hay texto: una caja vacía con su etiqueta se leería como un error. */
function quote(label: string, text: string | null | undefined): MailBlock[] {
  return text?.trim() ? [{ kind: "quote", label, text }] : [];
}
