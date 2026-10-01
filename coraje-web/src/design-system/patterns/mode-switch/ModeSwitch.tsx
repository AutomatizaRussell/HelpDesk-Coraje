import Link from "next/link";

import { colorTransition, focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Modo de color de la aplicación (U17). `coraje` es el modo navy del trabajo
 * con clientes; el shell lo pone en `data-mode` y `globals.css` redefine el
 * tema. Qué tickets pertenecen a cada modo lo decide el dominio, no el
 * sistema de diseño.
 */
export type ColorMode = "helpdesk" | "coraje";

/**
 * Interruptor entre los dos modos, al final de la fila de pestañas. Dos
 * enlaces y no un botón: cada modo es una URL de la bandeja, se puede
 * compartir y «atrás» vuelve al anterior.
 *
 * El modo que no está activo lleva el número de lo que espera allí: cambiar
 * de modo no puede esconder trabajo. La opción actual se marca con fondo,
 * peso y `aria-current`, como las vistas de la bandeja.
 */
export type ModeSwitchItem = { label: string; href: string; current: boolean; pending: number };

/** Más de dos cifras no caben, igual que en la campana. */
const MAX_BADGE = 99;

export function ModeSwitch({ items }: { items: readonly ModeSwitchItem[] }) {
  return (
    <div role="group" aria-label="Modo">
      <ul className="flex items-center gap-1 rounded-pill border border-line bg-surface p-0.5">
        {items.map((item) => {
          const showCount = !item.current && item.pending > 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.current ? "page" : undefined}
                aria-label={showCount ? `${item.label}, ${item.pending} por atender` : undefined}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-pill px-3 text-sm",
                  colorTransition,
                  focusRing,
                  item.current ? "bg-accent-surface font-bold text-heading" : "text-ink-muted hover:bg-surface-sunken hover:text-heading",
                )}
              >
                {item.label}
                {showCount && (
                  <span
                    aria-hidden="true"
                    className="flex h-4.5 min-w-4.5 items-center justify-center rounded-pill bg-accent px-1 text-2xs font-bold tabular-nums text-on-accent"
                  >
                    {item.pending > MAX_BADGE ? `${MAX_BADGE}+` : item.pending}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
