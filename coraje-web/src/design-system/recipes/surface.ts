import { cn } from "../utilities/cn";

/**
 * Superficie: la tarjeta que agrupa una entidad o una tarea real (una ficha de
 * ticket, un formulario). Dentro de una misma tarea se separa con divisores,
 * no con tarjetas anidadas.
 */
export function surface({ padded = true }: { padded?: boolean } = {}): string {
  return cn("rounded-surface border border-line bg-surface", padded && "p-5 lg:p-6");
}

/** Título de sección dentro de una superficie. */
export const sectionTitle = "text-md font-bold text-heading";

/** Aviso en línea, en contexto, con tono semántico. */
const noticeTones = {
  info: "border-line-strong bg-surface-sunken text-ink",
  success: "border-success bg-success-surface text-success",
  warning: "border-warning bg-warning-surface text-warning",
  danger: "border-danger bg-danger-surface text-danger",
} as const;

export type NoticeTone = keyof typeof noticeTones;

export function notice(tone: NoticeTone): string {
  return cn("rounded-control border px-4 py-3 text-base", noticeTones[tone]);
}
