import { CircleCheck, CircleDot, CircleX, Clock, TriangleAlert, UserCheck, type LucideIcon } from "lucide-react";

import { MAIL_STATE_LABEL, type MailState } from "@/server/notifications/mail-state";
import { SLA_STATUS_LABEL, type SlaStatus } from "@/server/tickets/sla";
import { TICKET_STATE_LABEL, type TicketState } from "@/server/tickets/ticket-state";

import { iconStroke } from "../../foundations/iconography";
import { badge } from "../../recipes/badge";
import { MAIL_STATE_TONE, SLA_TONE, TICKET_STATE_TONE } from "./ticket-status";

/**
 * Insignias de estado y de plazo. Son la única forma de pintar uno u otro: el
 * tono sale de `ticket-status.ts` y el texto del vocabulario único, así que
 * dos vistas no pueden mostrar el mismo estado de dos maneras.
 *
 * U30: estado y plazo llevan además un icono, que distingue la insignia por
 * forma y no solo por color (quien no distingue el ámbar del rojo sigue
 * viendo un triángulo contra un reloj). El icono es decorativo: el texto ya
 * lo dice todo, y el lector de pantalla no lo lee.
 */
const STATE_ICON: Record<TicketState, LucideIcon> = {
  ABIERTO: CircleDot,
  ASIGNADO: UserCheck,
  CERRADO: CircleCheck,
  RECHAZADO: CircleX,
};

const SLA_ICON: Record<SlaStatus, LucideIcon> = {
  VENCIDO: TriangleAlert,
  POR_VENCER: Clock,
  EN_PLAZO: Clock,
};

export function TicketStateBadge({ state }: { state: TicketState }) {
  const Icon = STATE_ICON[state];
  return (
    <span className={badge(TICKET_STATE_TONE[state])}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={iconStroke.regular} />
      {TICKET_STATE_LABEL[state]}
    </span>
  );
}

export function SlaBadge({ status }: { status: SlaStatus }) {
  const Icon = SLA_ICON[status];
  return (
    <span className={badge(SLA_TONE[status])}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={iconStroke.regular} />
      {SLA_STATUS_LABEL[status]}
    </span>
  );
}

export function MailStateBadge({ state }: { state: MailState }) {
  return <span className={badge(MAIL_STATE_TONE[state])}>{MAIL_STATE_LABEL[state]}</span>;
}
