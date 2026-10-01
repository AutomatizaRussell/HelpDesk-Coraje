import { cn } from "../utilities/cn";

/**
 * Insignia: una etiqueta corta de estado en una fila o una ficha.
 *
 * El tono lo decide la autoridad del dominio que corresponda
 * (`patterns/ticket-status/ticket-status.ts` para estado y plazo), nunca la
 * vista. Todos los tonos llevan texto, no solo color, y cada par tinta/fondo
 * del tema da ≥ 4,5:1.
 */
const tones = {
  neutral: "border-line-strong bg-surface-sunken text-ink",
  // `info` y no `accent`: el acento sigue al área de quien mira (U16); un
  // estado tiene que verse igual para todos.
  info: "border-info bg-info-surface text-heading",
  success: "border-success bg-success-surface text-success",
  warning: "border-warning bg-warning-surface text-warning",
  danger: "border-danger bg-danger-surface text-danger",
} as const;

export type BadgeTone = keyof typeof tones;

export function badge(tone: BadgeTone): string {
  return cn("inline-flex items-center whitespace-nowrap rounded-pill border px-2 text-xs font-bold", tones[tone]);
}
