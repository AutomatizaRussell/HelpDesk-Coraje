/**
 * Une clases de recetas con clases de composición del consumidor, ignorando
 * los valores falsos (`cond && "clase"`). Sin dependencia: las recetas de
 * HelpDesk no necesitan resolver conflictos entre utilidades, solo
 * concatenarlas.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
