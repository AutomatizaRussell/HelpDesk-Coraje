import { typography } from "../foundations/typography";
import { helpdeskTheme } from "./helpdesk";

/**
 * Tema de los correos de HelpDesk: el tercer adaptador del contrato.
 *
 * **Por qué no vive dentro de `helpdeskTheme`.** Todo lo que está allí tiene un
 * gemelo en el `:root` de `globals.css`, y el validador exige la pareja. Un
 * correo no lee variables CSS —Outlook clásico pinta con el motor de Word y no
 * las entiende— ni carga la hoja de la aplicación: estos valores se escriben
 * en línea, celda por celda. Meterlos en el tema obligaría a declarar en
 * `:root` variables que ningún navegador consume.
 *
 * **Qué se hereda y qué es propio.** Colores, radios y el ancho del logotipo
 * salen del tema de la aplicación, sin copiar ningún literal: un cambio de
 * marca llega a los correos sin tocar este archivo. Los tamaños de letra se
 * convierten de la escala (`rem`) a píxeles, porque Word no resuelve `rem`.
 * Lo único escrito aquí es lo que solo existe en un correo: el ancho de la
 * columna, los márgenes de las celdas y las medidas del botón para Outlook.
 */

/** `"0.9375rem"` → `"15px"`. La raíz del navegador y de los clientes de correo es 16 px. */
function remToPx(value: string): string {
  return `${Number.parseFloat(value) * 16}px`;
}

const scale = typography.scale;
const color = helpdeskTheme.color;

export const helpdeskEmailTheme = {
  /**
   * Lato es la fuente de la interfaz, pero ningún cliente de correo garantiza
   * cargarla. Arial es la secundaria que fija el manual (§2.2) y la que
   * Outlook usa sin caer en Times New Roman, que es lo que hace cuando no
   * encuentra la primera de una lista.
   */
  fontFamily: "Lato, Arial, Helvetica, sans-serif",
  fallbackFontFamily: "Arial, Helvetica, sans-serif",
  /** Columna fija: Word ignora `max-width` y estiraría el mensaje a todo el panel. */
  width: 600,
  /** El logotipo al ancho de la pantalla de ingreso, que supera el mínimo del manual (≈ 113 px). */
  logoWidth: Number.parseFloat(helpdeskTheme.size.logoAccess),
  color: {
    canvas: color.canvas,
    surface: color.surface,
    sunken: color.surfaceSunken,
    text: color.ink,
    textMuted: color.inkMuted,
    heading: color.heading,
    line: color.line,
    // Sky Blue solo como marca (la raya bajo el título, el filete de la
    // cita), nunca como texto: sobre blanco no llega a 3:1 (tema, `accent`).
    accent: color.accent,
    action: color.action,
    onAction: color.onAction,
  },
  radius: {
    control: helpdeskTheme.radius.control,
    surface: helpdeskTheme.radius.surface,
    pill: helpdeskTheme.radius.pill,
  },
  fontSize: {
    eyebrow: remToPx(scale.xs.size),
    small: remToPx(scale.sm.size),
    body: remToPx(scale.md.size),
    title: remToPx(scale.xl.size),
    code: remToPx(scale["2xl"].size),
  },
  lineHeight: {
    eyebrow: remToPx(scale.xs.lineHeight),
    small: remToPx(scale.sm.lineHeight),
    body: remToPx(scale.md.lineHeight),
    title: remToPx(scale.xl.lineHeight),
    code: remToPx(scale["2xl"].lineHeight),
  },
  letterSpacing: { eyebrow: "1px", code: "6px" },
  /** La raya corta bajo el título: la marca de HelpDesk, nunca su masa. */
  titleRule: { width: 32, height: 4, gap: 10 },
  /** Grosor de los bordes de la tarjeta, del divisor de la cabecera y de la caja del código. */
  border: 1,
  /** Filete izquierdo de la cita (el texto que escribió una persona). */
  quoteRule: 3,
  /**
   * Márgenes en píxeles, como números: cada uno es el `padding` de una celda,
   * porque Word descarta los márgenes de bloque. `vmlMinWidth` y
   * `vmlCharWidth` dimensionan el botón de Outlook, que no ajusta una forma
   * VML a su texto y hay que estimar su ancho por el largo de la etiqueta.
   */
  space: {
    gutter: 28,
    block: 16,
    // `labelGap`: entre la etiqueta de la cita («Respuesta») y el texto.
    quote: { x: 16, y: 12, labelGap: 4 },
    code: 14,
    button: { x: 22, y: 12, height: 44, vmlMinWidth: 180, vmlCharWidth: 9 },
  },
} as const;

export type HelpdeskEmailTheme = typeof helpdeskEmailTheme;
