import { cn } from "../utilities/cn";
import { colorTransition, focusRing } from "./interaction";

/**
 * Recetas de campo de formulario: etiqueta, control, ayuda y error.
 *
 * Un solo control para `<input>`, `<select>` y `<textarea>`: tienen la misma
 * jerarquía y deben leerse como la misma familia. El tamaño de texto es
 * `base`, igual que el cuerpo: un campo con letra más grande que la etiqueta
 * se lee como el elemento principal de la pantalla.
 *
 * El error se marca con borde **y** con mensaje en texto, nunca solo con
 * color, y el control lleva `aria-invalid` y `aria-describedby` desde el
 * componente que lo usa.
 */
export const fieldLabel = "block text-sm font-bold text-heading";

export const fieldHint = "mt-1 text-sm text-ink-muted";

export const fieldError = "mt-1 text-sm text-danger";

export function fieldControl({ invalid = false, multiline = false }: { invalid?: boolean; multiline?: boolean } = {}): string {
  return cn(
    "mt-1.5 block w-full rounded-control border bg-surface px-3 text-base text-ink",
    "placeholder:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted",
    multiline ? "min-h-28 py-2" : "h-10",
    colorTransition,
    focusRing,
    invalid ? "border-danger" : "border-line-strong",
  );
}
