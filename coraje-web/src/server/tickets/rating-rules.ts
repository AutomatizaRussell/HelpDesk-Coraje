/**
 * Reglas de la calificación del ticket (U34, specs/tickets.md §15). Puro, sin
 * I/O: lo leen la acción de servidor, el formulario y la prueba que las cruza
 * con `helpdesk.calificar_ticket` (`rating-rules.test.mts`), que es quien las
 * hace cumplir de verdad.
 */

/** Rango de estrellas. Decisión del 03-sep-2026: se valida en servidor. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

/**
 * Con esta calificación o menos, el comentario es obligatorio (decisión del
 * 04-nov-2026): una nota baja sin motivo no le dice al equipo qué corregir.
 */
export const RATING_COMMENT_REQUIRED_AT_OR_BELOW = 2;

export function ratingRequiresComment(calificacion: number): boolean {
  return calificacion >= RATING_MIN && calificacion <= RATING_COMMENT_REQUIRED_AT_OR_BELOW;
}
