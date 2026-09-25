import type { MailState } from "@/server/notifications/mail-state";
import type { SlaStatus } from "@/server/tickets/sla";
import type { TicketState } from "@/server/tickets/ticket-state";

import type { BadgeTone } from "../../recipes/badge";

/**
 * Autoridad única que traduce estado y plazo a tono visual
 * (design/sistema-helpdesk.md §5, V5). Ninguna vista asigna color a un estado
 * por su cuenta: si dos lo hicieran, divergirían en la primera adición y la
 * persona aprendería dos códigos de color para el mismo dato.
 *
 * `Record` exhaustivo: añadir un estado al vocabulario sin decidir aquí su
 * tono no compila.
 *
 * El tono cálido (advertencia, peligro) queda reservado a lo que exige
 * atención: el plazo. Un ticket asignado en plazo no es una alarma.
 */
export const TICKET_STATE_TONE: Record<TicketState, BadgeTone> = {
  ABIERTO: "warning",
  ASIGNADO: "info",
  CERRADO: "success",
  RECHAZADO: "neutral",
};

/** Estado de un correo del ticket (D6). Solo el que no salió pide atención. */
export const MAIL_STATE_TONE: Record<MailState, BadgeTone> = {
  PENDIENTE: "neutral",
  ENVIANDO: "neutral",
  ENVIADO: "success",
  FALLIDO: "danger",
};

export const SLA_TONE: Record<SlaStatus, BadgeTone> = {
  VENCIDO: "danger",
  POR_VENCER: "warning",
  EN_PLAZO: "neutral",
};
