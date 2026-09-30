/**
 * Tipos de aviso a empleados y su clase (U15, specs/tickets.md §12). Puro:
 * lo leen el servidor, la vista y las pruebas.
 *
 * - `ATENCION`: pide una acción y queda en «Requiere tu atención» hasta que
 *   se actúa. Qué la cierra lo decide la base (trigger
 *   `trg_resolver_avisos_ticket`): terminar el ticket, o dejar de ser su
 *   responsable. Leerla no la cierra.
 * - `NOVEDAD`: solo informa. Se marca leída al abrirla.
 *
 * Esta tabla es la misma que los CHECK `chk_ticket_aviso_tipo` y
 * `chk_ticket_aviso_clase` de la migración `20260930120000_avisos_ticket`.
 * `ticket-notice-kinds.test.mts` lee la migración y falla si divergen.
 */
export const NOTICE_CLASS = {
  /** Te llega un ticket que radicó otra persona del equipo. */
  CREACION_RESPONSABLE: "ATENCION",
  /** Te reasignaron un ticket. */
  REASIGNACION_RESPONSABLE: "ATENCION",
  /** Te llega un ticket del portal que alguien clasificó. */
  REDIRECCION_RESPONSABLE: "ATENCION",
  /** Te piden validar algo. En la v1 no hay respuesta del validador: se cierra al terminar el ticket. */
  SOLICITUD_VALIDACION: "ATENCION",
  /** Tu ticket cambió de responsable. */
  REASIGNACION_SOLICITANTE: "NOVEDAD",
  RESPUESTA_SOLICITANTE: "NOVEDAD",
  RECHAZO_SOLICITANTE: "NOVEDAD",
  OBSERVADOR_AGREGADO: "NOVEDAD",
  RESPUESTA_OBSERVADOR: "NOVEDAD",
  RECHAZO_OBSERVADOR: "NOVEDAD",
  /** Quien radicó escribió en el ticket que atiendes. No te pide una acción nueva: el ticket ya lo era. */
  COMENTARIO_SOLICITANTE_RESPONSABLE: "NOVEDAD",
} as const satisfies Record<string, NoticeClass>;

export type NoticeClass = "ATENCION" | "NOVEDAD";

export type TicketNoticeKind = keyof typeof NOTICE_CLASS;

/**
 * Los que piden atender el ticket como responsable. El trigger los cierra
 * cuando esa persona deja de ser la responsable; la validación no, porque
 * pedirle algo a alguien no depende de quién atienda el ticket.
 */
export const RESPONSIBLE_NOTICE_KINDS = [
  "CREACION_RESPONSABLE",
  "REASIGNACION_RESPONSABLE",
  "REDIRECCION_RESPONSABLE",
] as const satisfies readonly TicketNoticeKind[];

export function isTicketNoticeKind(value: string): value is TicketNoticeKind {
  return Object.hasOwn(NOTICE_CLASS, value);
}

export function noticeClass(kind: TicketNoticeKind): NoticeClass {
  return NOTICE_CLASS[kind];
}
