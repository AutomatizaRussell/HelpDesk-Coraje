import Link from "next/link";

import { colorTransition, focusRing } from "../recipes/interaction";
import { cn } from "../utilities/cn";

/**
 * Grupo de enlaces que eligen una vista de la misma lista (las vistas de la
 * bandeja). Son enlaces y no botones: cada vista tiene su URL, se puede
 * compartir y el botón «atrás» vuelve a la anterior.
 *
 * La opción actual se marca con fondo, peso y `aria-current`, no solo con
 * color.
 */
export type SegmentedLinkItem = { label: string; href: string; current: boolean };

export function SegmentedLinks({ label, items }: { label: string; items: readonly SegmentedLinkItem[] }) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-1 rounded-control border border-line bg-surface p-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-control px-3 text-sm",
                colorTransition,
                focusRing,
                item.current ? "bg-accent-surface font-bold text-heading" : "text-ink-muted hover:bg-surface-sunken hover:text-heading",
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
