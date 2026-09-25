import { MAIL_STATE_LABEL, type MailState } from "@/server/notifications/mail-state";
import { SLA_STATUS_LABEL, type SlaStatus } from "@/server/tickets/sla";
import { TICKET_STATE_LABEL, type TicketState } from "@/server/tickets/ticket-state";

import { badge } from "../../recipes/badge";
import { MAIL_STATE_TONE, SLA_TONE, TICKET_STATE_TONE } from "./ticket-status";

/**
 * Insignias de estado y de plazo. Son la única forma de pintar uno u otro: el
 * tono sale de `ticket-status.ts` y el texto del vocabulario único, así que
 * dos vistas no pueden mostrar el mismo estado de dos maneras.
 */
export function TicketStateBadge({ state }: { state: TicketState }) {
  return <span className={badge(TICKET_STATE_TONE[state])}>{TICKET_STATE_LABEL[state]}</span>;
}

export function SlaBadge({ status }: { status: SlaStatus }) {
  return <span className={badge(SLA_TONE[status])}>{SLA_STATUS_LABEL[status]}</span>;
}

export function MailStateBadge({ state }: { state: MailState }) {
  return <span className={badge(MAIL_STATE_TONE[state])}>{MAIL_STATE_LABEL[state]}</span>;
}
