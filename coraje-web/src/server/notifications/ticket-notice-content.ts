import { escapeHtml } from "./ticket-mail-content";
import type { TicketNoticeKind } from "./ticket-notice-kinds";

/**
 * Qué dice cada aviso de la campana, y el correo de escalamiento (U15,
 * specs/tickets.md §12). Puro, sin I/O (`ticket-notice-content.test.mts`).
 *
 * El aviso no guarda su texto: se compone al leer, a partir del tipo, del
 * ticket y del evento que lo produjo. Así el aviso dice siempre lo mismo que
 * la historia del ticket, y cambiar una frase no exige migrar filas.
 *
 * **Qué texto del evento entra en el detalle.** Solo el que el destinatario
 * puede leer en el ticket. El comentario de una reasignación es conversación
 * del equipo (visibilidad `INTERNO`): entra en el aviso de la persona que
 * recibe el ticket, nunca en el de quien lo radicó. Para esos casos el detalle
 * es la descripción del ticket, que el solicitante escribió.
 */
export interface NoticeContext {
  /** `null` solo en un ticket del portal sin clasificar, que no genera avisos. */
  codigo: string | null;
  /** Quien hizo la acción. */
  autor: string;
  descripcion: string;
  /** El contenido del evento: respuesta, motivo, comentario o solicitud. */
  textoEvento: string;
}

export interface NoticeText {
  titulo: string;
  detalle: string;
}

/** Largo del detalle en la lista: lo justo para reconocer el ticket. */
const EXCERPT_MAX = 180;

/** Una sola línea, sin espacios repetidos, cortada por palabra. */
export function excerpt(value: string, max = EXCERPT_MAX): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function describeNotice(kind: TicketNoticeKind, ctx: NoticeContext): NoticeText {
  const codigo = ctx.codigo ?? "un ticket";
  const descripcion = excerpt(ctx.descripcion);
  const texto = excerpt(ctx.textoEvento);
  switch (kind) {
    case "CREACION_RESPONSABLE":
      return { titulo: `${ctx.autor} radicó ${codigo} y te corresponde atenderlo`, detalle: descripcion };
    case "REASIGNACION_RESPONSABLE":
      return { titulo: `${ctx.autor} te reasignó ${codigo}`, detalle: descripcion };
    case "REDIRECCION_RESPONSABLE":
      return { titulo: `${ctx.autor} te asignó ${codigo}, del portal de clientes`, detalle: descripcion };
    case "SOLICITUD_VALIDACION":
      return { titulo: `${ctx.autor} te pide validar ${codigo}`, detalle: texto };
    case "REASIGNACION_SOLICITANTE":
      // El comentario de la reasignación es INTERNO: no entra aquí.
      return { titulo: `Tu ticket ${codigo} tiene nueva persona responsable`, detalle: descripcion };
    case "RESPUESTA_SOLICITANTE":
      return { titulo: `${ctx.autor} respondió tu ticket ${codigo}`, detalle: texto };
    case "RECHAZO_SOLICITANTE":
      return { titulo: `${ctx.autor} rechazó tu ticket ${codigo}`, detalle: texto };
    case "OBSERVADOR_AGREGADO":
      return { titulo: `${ctx.autor} te añadió como observador de ${codigo}`, detalle: descripcion };
    case "RESPUESTA_OBSERVADOR":
      return { titulo: `${ctx.autor} respondió ${codigo}, que sigues`, detalle: texto };
    case "RECHAZO_OBSERVADOR":
      return { titulo: `${ctx.autor} rechazó ${codigo}, que sigues`, detalle: texto };
    case "COMENTARIO_SOLICITANTE_RESPONSABLE":
      return { titulo: `${ctx.autor} escribió en ${codigo}`, detalle: texto };
  }
}

// ---------------------------------------------------------------------------
// Correo de escalamiento
// ---------------------------------------------------------------------------

export interface EscalationItem {
  titulo: string;
  /** Desde cuándo espera, ya formateado. */
  desde: string;
  url: string;
}

export interface EscalationMailInput {
  nombre: string;
  pendientes: readonly EscalationItem[];
  /** La página «Requiere tu atención». */
  avisosUrl: string;
}

/**
 * Un solo correo por persona y día con todos sus pendientes abiertos. Sale
 * del buzón de automatización, no de un compañero: nadie lo escribió.
 */
export function buildEscalationMail(input: EscalationMailInput): { subject: string; html: string } {
  const total = input.pendientes.length;
  return {
    subject:
      total === 1
        ? "Tienes un pendiente sin atender en HelpDesk"
        : `Tienes ${total} pendientes sin atender en HelpDesk`,
    html: [
      `<p>Hola, ${escapeHtml(input.nombre)}:</p>`,
      `<p>${total === 1 ? "Este pendiente espera" : "Estos pendientes esperan"} tu acción en HelpDesk desde hace más de un día hábil:</p>`,
      `<ul>${input.pendientes
        .map(
          (item) =>
            `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.titulo)}</a> · desde el ${escapeHtml(item.desde)}</li>`,
        )
        .join("")}</ul>`,
      `<p><a href="${escapeHtml(input.avisosUrl)}">Ver todo lo que requiere tu atención</a></p>`,
      `<p>Recibes este correo una vez por día hábil mientras quede algo pendiente. Un pendiente se cierra al responder o rechazar el ticket, al reasignarlo, o cuando el ticket termina.</p>`,
    ].join(""),
  };
}
