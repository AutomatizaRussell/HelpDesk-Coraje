/**
 * Tipografía de HelpDesk (design/sistema-helpdesk.md §2): Lato, la fuente principal del Manual de Marca, con
 * Arial como respaldo — es la secundaria que el propio manual designa para
 * cuando Lato no está disponible (§2.2), no una elección genérica.
 *
 * **Pesos: solo los que existen.** El manual aprueba Regular, Italic, Bold y
 * Black, y `next/font/google` sirve Lato en `100, 300, 400, 700, 900`: no hay
 * 500 ni 600. Pedir `font-medium` o `font-semibold` no produce un peso
 * intermedio —el navegador pinta el disponible más cercano—, así que la clase
 * miente sobre lo que se ve. Por eso el tema de Tailwind **solo declara estos
 * tres pesos** (`globals.css`): una clase de peso inexistente no genera CSS, y
 * el validador del contrato falla si alguien la escribe.
 */
export const typography = {
  weight: {
    normal: "400",
    bold: "700",
    black: "900",
  },
  /**
   * Escala tipográfica. Base de 14 px, no 16: la pantalla principal es una
   * bandeja que se escanea muchas veces al día, y la densidad es un requisito
   * (design/sistema-helpdesk.md §2), no una preferencia. Los dos tamaños
   * inferiores existen por la réplica del shell de Conecta (etiquetas de
   * sección y distintivos), no para texto corrido.
   */
  scale: {
    "2xs": { size: "0.625rem", lineHeight: "0.875rem" }, // 10 / 14
    xs: { size: "0.6875rem", lineHeight: "1rem" }, // 11 / 16
    sm: { size: "0.8125rem", lineHeight: "1.125rem" }, // 13 / 18
    base: { size: "0.875rem", lineHeight: "1.25rem" }, // 14 / 20
    md: { size: "1rem", lineHeight: "1.5rem" }, // 16 / 24
    lg: { size: "1.25rem", lineHeight: "1.75rem" }, // 20 / 28
    xl: { size: "1.5rem", lineHeight: "2rem" }, // 24 / 32
  },
} as const;

/** Pesos que `next/font` debe cargar: exactamente los del contrato. */
export const LATO_WEIGHTS = Object.values(typography.weight);
