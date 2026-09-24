"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { colorTransition, focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Navegación propia de HelpDesk: una fila de pestañas bajo la barra superior,
 * igual en los dos modos de entrada (design/sistema-helpdesk.md §2).
 *
 * Horizontal y no un segundo sidebar a propósito: la vista principal será una
 * bandeja que necesita ancho para escanear columnas, y dos columnas verticales
 * le quitarían entre 250 y 300 px.
 *
 * La pestaña activa se marca con el **acento** (Sky Blue) como subrayado, que
 * es exactamente el uso que el tema le reserva: marca, nunca texto. No es el
 * único indicador —también cambia el peso y lleva `aria-current`—, porque el
 * acento sobre blanco no alcanza el contraste de un indicador por sí solo.
 *
 * `<Link>` y no `<a>`: son rutas de HelpDesk, y Link antepone el basePath.
 */
export type ModuleNavItem = { label: string; href: string };

export function ModuleNav({ items }: { items: readonly ModuleNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="HelpDesk" className="border-b border-line bg-surface">
      <ul className="flex h-11 items-stretch gap-6 overflow-x-auto px-4 lg:px-8">
        {items.map((item) => {
          const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center whitespace-nowrap border-b-2 px-1 text-base",
                  colorTransition,
                  focusRing,
                  current
                    ? "border-accent font-bold text-heading"
                    : "border-transparent text-ink-muted hover:text-heading",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
