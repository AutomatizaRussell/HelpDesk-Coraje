import { TICKET_ACTIONS, type TicketAction } from "./catalog";

/**
 * Significado del alcance de una regla (specs/permisos.md §4), en un solo
 * sitio. Sin I/O a propósito: son las reglas que más importa probar, y así se
 * prueban sin base de datos (`scope.test.mts`).
 *
 * La base guarda el alcance (`PROPIO`, `AREA`, `TOTAL`); este módulo dice qué
 * relación entre la persona y el ticket satisface cada uno. **No mira el rol**:
 * el rol ya se resolvió al elegir la regla en `app.permiso_regla`.
 */

export type Alcance = "PROPIO" | "AREA" | "TOTAL";

/** Quién actúa, con lo que el alcance necesita saber de esa persona. */
export interface ScopeActor {
  idPersonal: string;
  /** Área de la persona en `core.dim_personal`. Sin área, `AREA` equivale a `PROPIO`. */
  idArea: string | null;
}

/** Lo que el alcance necesita saber del ticket. */
export interface ScopeTicket {
  idSolicitante: string | null;
  idAsignado: string | null;
  idAreaDestino: string | null;
  /**
   * Quienes siguen el ticket (U11, tickets.md §11). Obligatorio a propósito:
   * quien construya un ticket para evaluarlo tiene que decir quién lo sigue,
   * o un observador quedaría fuera de su propio ticket sin que el compilador
   * lo note.
   */
  idObservadores: readonly string[];
}

/**
 * Qué hace «propio» a un ticket, según la acción.
 *
 * - Consultar: haberlo radicado o ser su responsable. Quien radica tiene que
 *   poder seguir su propio ticket.
 * - Consultar, además: seguirlo como observador (U11). Es lo único que da
 *   ser observador: ninguna otra acción lo mira (tickets.md §11).
 * - Comentar como solicitante (U11): haberlo radicado, y nada más. Es la
 *   única acción cuyo «propio» no es ser el responsable, porque es la voz de
 *   quien pidió, no de quien atiende.
 * - Todo lo demás: ser su responsable. Es la regla del legacy
 *   (reglas-negocio-powerapps.md §6): quien recibe el ticket es quien actúa
 *   sobre él. Radicarlo no da derecho a responderlo ni a rechazarlo.
 *
 * - Redirigir (T3): cae en «ser su responsable», y un ticket sin clasificar
 *   no tiene responsable ni área. Por eso solo `TOTAL` lo cubre, y es el
 *   alcance que la migración de U8 le da a `CLASIFICADOR`. No es un caso
 *   especial: es la regla general aplicada a un ticket que todavía no es de
 *   nadie.
 *
 * `ticket.crear` no aparece: no se evalúa sobre un ticket existente. Su
 * alcance `PROPIO` significa que se crea a nombre propio, y el servicio de
 * creación lo garantiza usando siempre a quien actúa como solicitante.
 */
function isOwnTicket(action: TicketAction, actor: ScopeActor, ticket: ScopeTicket): boolean {
  const isResponsable = ticket.idAsignado === actor.idPersonal;
  if (action === TICKET_ACTIONS.consultar) {
    return isResponsable || ticket.idSolicitante === actor.idPersonal || ticket.idObservadores.includes(actor.idPersonal);
  }
  if (action === TICKET_ACTIONS.comentarSolicitante) {
    return ticket.idSolicitante === actor.idPersonal;
  }
  return isResponsable;
}

function isAreaTicket(actor: ScopeActor, ticket: ScopeTicket): boolean {
  return actor.idArea !== null && ticket.idAreaDestino === actor.idArea;
}

/**
 * ¿Cubre el alcance concedido este ticket para esta acción?
 *
 * Cada alcance incluye al anterior: `AREA` es `PROPIO` más el área, y `TOTAL`
 * es todo.
 */
export function isTicketWithinScope(params: {
  alcance: Alcance;
  action: TicketAction;
  actor: ScopeActor;
  ticket: ScopeTicket;
}): boolean {
  const { alcance, action, actor, ticket } = params;
  if (alcance === "TOTAL") return true;
  if (isOwnTicket(action, actor, ticket)) return true;
  return alcance === "AREA" && isAreaTicket(actor, ticket);
}

/**
 * Filtro de lectura equivalente a `isTicketWithinScope` para `ticket.consultar`,
 * expresado como condiciones que la base evalúa: la bandeja no trae tickets a
 * memoria para descartarlos después (CLAUDE.md, economía de recursos).
 *
 * Devuelve `null` para `TOTAL`, que no filtra, y una lista de condiciones que
 * se combinan con OR en el resto. La prueba de `scope.test.mts` cruza este
 * filtro con `isTicketWithinScope` para que las dos formas no diverjan.
 */
export type ConsultScopeCondition =
  | { idSolicitante: string }
  | { idAsignado: string }
  | { idAreaDestino: string }
  | { observadores: { some: { idPersonal: string } } };

export function consultScopeConditions(alcance: Alcance, actor: ScopeActor): ConsultScopeCondition[] | null {
  if (alcance === "TOTAL") return null;
  const conditions: ConsultScopeCondition[] = [
    { idSolicitante: actor.idPersonal },
    { idAsignado: actor.idPersonal },
    { observadores: { some: { idPersonal: actor.idPersonal } } },
  ];
  if (alcance === "AREA" && actor.idArea !== null) {
    conditions.push({ idAreaDestino: actor.idArea });
  }
  return conditions;
}

/**
 * Qué parte de la historia ve quien consulta (specs/tickets.md §6).
 *
 * - `EQUIPO`: el responsable y su área, quien tiene alcance total y quien
 *   sigue el ticket como observador. Ven las notas internas (`INTERNO`) y lo
 *   que ve el solicitante (`AMBOS`). El observador está aquí por decisión de
 *   tickets.md §11: ve «lo mismo que vería un agente interno», no una vista
 *   recortada.
 * - `SOLICITANTE`: quien solo radicó el ticket. Ve `AMBOS`, nunca `INTERNO`.
 *   Es lo que hace que una nota interna signifique algo: si quien radicó la
 *   viera, no sería interna.
 *
 * Solo tiene sentido sobre un ticket que ya pasó `isTicketWithinScope` para
 * consultar.
 */
export type HistoryProjection = "EQUIPO" | "SOLICITANTE";

export function historyProjection(params: {
  alcance: Alcance;
  actor: ScopeActor;
  ticket: ScopeTicket;
}): HistoryProjection {
  const { alcance, actor, ticket } = params;
  if (alcance === "TOTAL") return "EQUIPO";
  if (ticket.idAsignado === actor.idPersonal) return "EQUIPO";
  if (ticket.idObservadores.includes(actor.idPersonal)) return "EQUIPO";
  if (alcance === "AREA" && isAreaTicket(actor, ticket)) return "EQUIPO";
  return "SOLICITANTE";
}

/** Visibilidades de evento que cada proyección puede leer. */
export const VISIBLE_BY_PROJECTION = {
  EQUIPO: ["INTERNO", "AMBOS"],
  SOLICITANTE: ["AMBOS"],
} as const satisfies Record<HistoryProjection, readonly ("INTERNO" | "CLIENTE" | "AMBOS")[]>;

/**
 * Lo que ve el contacto de un cliente en el portal (tickets.md §6): `CLIENTE`
 * y `AMBOS`, nunca `INTERNO`. No es una proyección de `historyProjection`
 * porque no hay alcance que evaluar: el contacto no es un empleado, y lo que
 * lo limita es D2 (solo sus tickets), aplicado en la consulta del portal.
 */
export const VISIBLE_TO_CLIENT = ["CLIENTE", "AMBOS"] as const satisfies readonly ("INTERNO" | "CLIENTE" | "AMBOS")[];
