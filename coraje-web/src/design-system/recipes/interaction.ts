/**
 * Recetas de interacción universales: el foco y la transición.
 *
 * El foco es visible solo con teclado (`focus-visible`), en navy y separado
 * del control por un hueco, para que se lea igual sobre blanco, sobre el
 * lienzo y sobre una fila seleccionada con el acento. Ningún componente
 * escribe su propio anillo: si uno lo necesita distinto, se amplía aquí.
 */
export const focusRing =
  "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Transición de color para estados hover/activo. */
export const colorTransition = "transition-colors duration-(--hd-motion-fast) ease-standard";

/** Mismo foco sobre superficie oscura (sidebar navy), en blanco. */
export const focusRingInverse =
  "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-inverse";
