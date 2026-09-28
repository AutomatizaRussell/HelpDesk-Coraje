/**
 * Vocabulario de estados de la v1 (specs/tickets.md §4), una sola lista para
 * toda la aplicación. `helpdesk.dim_estado` tiene las mismas cuatro filas y
 * `helpdesk.registrar_evento_ticket` hace cumplir las transiciones: aquí solo
 * se nombran para que las vistas y los servicios no escriban literales
 * sueltos. Una prueba (`ticket-state.test.mts`) impide una segunda lista de
 * estados en `src/` (tickets.md §8).
 */
export const TICKET_STATES = ["ABIERTO", "ASIGNADO", "CERRADO", "RECHAZADO"] as const;

export type TicketState = (typeof TICKET_STATES)[number];

/** Estados en los que el ticket todavía espera trabajo de la firma. */
export const OPEN_STATES = ["ABIERTO", "ASIGNADO"] as const satisfies readonly TicketState[];

export function isTicketState(value: string): value is TicketState {
  return (TICKET_STATES as readonly string[]).includes(value);
}

export function isOpenState(state: TicketState): boolean {
  return (OPEN_STATES as readonly TicketState[]).includes(state);
}

/**
 * Rótulo visible de cada estado. Es traducción de presentación, no otro
 * vocabulario (tickets.md §4): el valor sigue siendo el de `dim_estado`.
 */
export const TICKET_STATE_LABEL: Record<TicketState, string> = {
  ABIERTO: "Abierto",
  ASIGNADO: "Asignado",
  CERRADO: "Cerrado",
  RECHAZADO: "Rechazado",
};

/**
 * `EXCEPCIÓN TEMPORAL` — solo los tickets creados en HelpDesk se operan desde
 * HelpDesk: los internos (`SISTEMA_INTERNO`, U7) y los del portal de
 * clientes (`PORTAL_CLIENTE`, U8). U9 fijó la regla: su dueño es HelpDesk.
 * Se reflejan en SharePoint para quien siga en PowerApps, y la ingesta no
 * los reescribe (sincronizacion-sharepoint.md §4.3).
 *
 * Mientras conviven PowerApps y HelpDesk, la ingesta sobrescribe con lo que
 * tenga SharePoint los tickets que vienen de allí
 * (specs/sincronizacion-sharepoint.md §4.1), y nada de lo que se haga aquí
 * vuelve a SharePoint. Reasignar o cerrar un ticket legacy en HelpDesk sería
 * trabajo que la siguiente ingesta deshace, o que PowerApps nunca ve.
 * Decisión del 25-sep-2026: U7 se prueba solo con tickets creados en
 * HelpDesk y no se usa de verdad hasta U9. Los tickets legacy se pueden
 * consultar, no operar.
 *
 * Los tickets legacy siguen siendo de SharePoint hasta el corte (decisión del
 * 28-sep-2026, U9): aquí se consultan, no se operan.
 *
 * Condición de eliminación: el apagado de PowerApps (contexto-canonico.md §2).
 * Con él, todos los tickets pasan a HelpDesk y esta función desaparece.
 */
export const OPERABLE_ORIGINS = ["SISTEMA_INTERNO", "PORTAL_CLIENTE"] as const;

/** Origen de los tickets que radica un contacto de cliente (T1). */
export const PORTAL_ORIGIN = "PORTAL_CLIENTE" satisfies (typeof OPERABLE_ORIGINS)[number];

export function isOperableInHelpDesk(origenSistema: string): boolean {
  return (OPERABLE_ORIGINS as readonly string[]).includes(origenSistema);
}
