import { isOpenState, type TicketState } from "./ticket-state";

/**
 * Estado del plazo de un ticket (specs/tickets.md §5;
 * design/sistema-helpdesk.md §5: «solo con condición semántica real,
 * calculada en servidor»).
 *
 * El plazo se fija al crear (`helpdesk.crear_ticket_interno`) y en la v1 no se
 * pausa ni se reinicia: no hay cambio de turno sin `ESPERANDO_SOLICITANTE`.
 * Por eso basta con comparar `fecha_limite` con el momento de la consulta; no
 * hace falta ningún proceso que recorra los tickets vencidos.
 *
 * - `VENCIDO`: pasó el final del día hábil límite y el ticket sigue abierto.
 * - `POR_VENCER`: vence en menos de un día.
 * - `EN_PLAZO`: el resto de tickets abiertos con fecha límite.
 * - `null`: el ticket terminó o no tiene fecha límite, así que no hay plazo
 *   que señalar.
 */
export type SlaStatus = "VENCIDO" | "POR_VENCER" | "EN_PLAZO";

const DUE_SOON_MS = 24 * 60 * 60 * 1000;

export function slaStatus(params: { state: TicketState; fechaLimite: Date | null; now: Date }): SlaStatus | null {
  const { state, fechaLimite, now } = params;
  if (!fechaLimite || !isOpenState(state)) return null;
  const remaining = fechaLimite.getTime() - now.getTime();
  if (remaining < 0) return "VENCIDO";
  if (remaining < DUE_SOON_MS) return "POR_VENCER";
  return "EN_PLAZO";
}

export const SLA_STATUS_LABEL: Record<SlaStatus, string> = {
  VENCIDO: "Vencido",
  POR_VENCER: "Por vencer",
  EN_PLAZO: "En plazo",
};
