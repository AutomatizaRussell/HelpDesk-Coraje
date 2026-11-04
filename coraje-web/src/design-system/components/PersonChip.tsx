import { cn } from "../utilities/cn";

/**
 * Una persona en una celda (U30): un círculo con sus iniciales y su nombre.
 * Sin nombre, el círculo es punteado y vacío y el texto lo dice («Sin
 * responsable»): el hueco se ve de lejos, que es justo lo que importa en una
 * bandeja donde un ticket sin responsable espera a alguien.
 *
 * Las iniciales las calcula el llamador (`personInitials`): este componente
 * no sabe de formatos de nombre. El círculo es decorativo; el nombre escrito
 * es lo que se lee.
 */
export function PersonChip({ name, initials, emptyLabel }: { name: string | null; initials: string; emptyLabel: string }) {
  return (
    <span className={cn("flex items-center gap-2", !name && "text-ink-muted")}>
      <span
        aria-hidden="true"
        className={cn(
          "grid size-6.5 shrink-0 place-items-center rounded-pill text-2xs font-black text-heading",
          name ? "bg-avatar-surface" : "border border-dashed border-line-strong",
        )}
      >
        {name ? initials : null}
      </span>
      <span>{name ?? emptyLabel}</span>
    </span>
  );
}
