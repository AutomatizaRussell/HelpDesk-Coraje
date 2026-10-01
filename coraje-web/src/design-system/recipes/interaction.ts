/**
 * Recetas de interacción universales: el foco y la transición.
 *
 * El foco es visible solo con teclado (`focus-visible`), en navy y separado
 * del control por un hueco, para que se lea igual sobre blanco, sobre el
 * lienzo y sobre una fila seleccionada con el acento. Ningún componente
 * escribe su propio anillo: si uno lo necesita distinto, se amplía aquí.
 *
 * **`outline-solid` es obligatorio, no redundante.** En Tailwind 4,
 * `outline-hidden` fija `--tw-outline-style: none`, y `outline-2` reutiliza
 * esa variable como estilo: sin `outline-solid` el anillo mide 2 px pero su
 * estilo es «ninguno», y no se ve. Fue un defecto real, observado en el
 * despliegue el 24-sep-2026; `contract.test.mts` lo impide ahora.
 */
const focusBase =
  "outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2";

export const focusRing = `${focusBase} focus-visible:outline-focus`;

/** Mismo foco sobre superficie oscura (sidebar navy), en blanco. */
export const focusRingInverse = `${focusBase} focus-visible:outline-focus-inverse`;

/**
 * Foco de los controles de la topbar: navy sobre la topbar blanca y blanco
 * sobre la navy del modo Coraje (U17). Sigue a la topbar, no al contenido.
 */
export const focusRingTopbar = `${focusBase} focus-visible:outline-shell-topbar-focus`;

/**
 * Foco hacia dentro, para controles que llenan un contenedor con
 * desbordamiento (las pestañas): un anillo hacia fuera quedaría recortado.
 */
export const focusRingInset =
  "outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-focus";

/** Transición de color para estados hover/activo. */
export const colorTransition = "transition-colors duration-(--hd-motion-fast) ease-standard";

/**
 * Transición del cambio de modo (U17): el lienzo, las barras y las
 * superficies pasan de un modo al otro en vez de saltar. Más lenta que la de
 * un control, porque cambia la pantalla entera; la preferencia de movimiento
 * reducido la anula, como a todas (`globals.css`).
 */
export const modeTransition = "transition-colors duration-(--hd-motion-normal) ease-standard";
