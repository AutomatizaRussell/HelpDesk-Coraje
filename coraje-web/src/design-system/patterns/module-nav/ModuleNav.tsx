"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { colorTransition, focusRingInset, modeTransition } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Navegación propia de HelpDesk: una fila de pestañas bajo la barra superior,
 * igual en los dos modos de entrada (design/sistema-helpdesk.md §2).
 *
 * Horizontal y no un segundo sidebar a propósito: la vista principal será una
 * bandeja que necesita ancho para escanear columnas, y dos columnas verticales
 * le quitarían entre 250 y 300 px.
 *
 * La pestaña activa se marca con el **acento** del área como subrayado, que
 * es exactamente el uso que el tema le reserva: marca, nunca texto. No es el
 * único indicador —también cambia el peso y lleva `aria-current`—, porque el
 * acento sobre blanco no alcanza el contraste de un indicador por sí solo.
 *
 * Al final de la fila va `trailing`: el interruptor de modo (U17), que no es
 * una sección más sino la forma de cambiar de qué tickets tratan todas. En
 * modo Coraje la fila es navy: `data-shell-band` le redefine los tokens que
 * usa (`globals.css`), así que este componente no sabe en qué modo está.
 *
 * `<Link>` y no `<a>`: son rutas de HelpDesk, y Link antepone el basePath.
 */
export type ModuleNavItem = {
  label: string;
  href: string;
  /**
   * Rutas en las que la pestaña está activa, si no basta con su `href`: la
   * bandeja de Coraje es `/tickets?modo=coraje`, y una ruta no lleva la
   * consulta.
   */
  activePaths?: readonly string[];
};

export function ModuleNav({ items, trailing }: { items: readonly ModuleNavItem[]; trailing?: ReactNode }) {
  const pathname = usePathname();

  return (
    <nav aria-label="HelpDesk" data-shell-band className={cn("flex items-center gap-4 border-b border-line bg-surface pr-4 lg:pr-8", modeTransition)}>
      <ul className="flex h-11 min-w-0 flex-1 items-stretch gap-6 overflow-x-auto px-4 lg:px-8">
        {items.map((item) => {
          const paths = item.activePaths ?? [item.href];
          const current = paths.some((path) => (path === "/" ? pathname === "/" : pathname.startsWith(path)));
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center whitespace-nowrap border-b-2 px-1 text-base",
                  colorTransition,
                  focusRingInset,
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
      {trailing}
    </nav>
  );
}
