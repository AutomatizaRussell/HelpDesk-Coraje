/**
 * Estados de un correo del ticket (D6), iguales a los que admite
 * `chk_ticket_notificacion_estado` en `helpdesk.ticket_notificacion`
 * (migración 20260926110000_correo_delegado). Módulo puro, sin I/O: lo usan
 * tanto el servicio de correo como la insignia del sistema de diseño.
 */
export const MAIL_STATES = ["PENDIENTE", "ENVIANDO", "ENVIADO", "FALLIDO"] as const;
export type MailState = (typeof MAIL_STATES)[number];

export function isMailState(value: string): value is MailState {
  return (MAIL_STATES as readonly string[]).includes(value);
}

export const MAIL_STATE_LABEL: Record<MailState, string> = {
  PENDIENTE: "Pendiente",
  ENVIANDO: "Enviando",
  ENVIADO: "Enviado",
  FALLIDO: "No se envió",
};
