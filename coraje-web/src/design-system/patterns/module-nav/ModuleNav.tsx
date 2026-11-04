"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { colorTransition, focusRingTopbar } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Secciones de HelpDesk, **dentro de la barra superior** de los dos modos de
 * entrada (design/sistema-helpdesk.md §2).
 *
 * U32 (04-nov-2026): antes eran una fila propia bajo la barra, y la mayoría de
 * las personas solo tiene una sección —Tickets—, así que la fila ocupaba 44 px
 * para un único enlace que ya era la página abierta. Ahora van en la barra, y
 * con una sola sección no se pinta nada: no hay a dónde más ir.
 *
 * Horizontal y no un segundo sidebar a propósito: la bandeja necesita ancho
 * para escanear columnas.
 *
 * La sección activa se marca con el **acento** del área como subrayado al pie
 * de la barra, que es el uso que el tema le reserva: marca, nunca texto. No es
 * el único indicador —también cambia el peso y lleva `aria-current`—, porque
 * el acento sobre blanco no alcanza el contraste de un indicador por sí solo.
 * Los colores son los de la barra (`shell-topbar-*`), que el modo Externo
 * redefine en navy: este componente no sabe en qué modo está.
 *
 * `<Link>` y no `<a>`: son rutas de HelpDesk, y Link antepone el basePath.
 */
export type ModuleNavItem = {
  label: string;
  href: string;
  /**
   * Rutas en las que la sección está activa, si no basta con su `href`: la
   * bandeja de Externo es `/tickets?modo=externo`, y una ruta no lleva la
   * consulta.
   */
  activePaths?: readonly string[];
};

export function ModuleNav({ items, className }: { items: readonly ModuleNavItem[]; className?: string }) {
  const pathname = usePathname();
  if (items.length < 2) return null;

  return (
    <nav aria-label="HelpDesk" className={cn("flex min-w-0 self-stretch", className)}>
      <ul className="flex min-w-0 items-stretch gap-5">
        {items.map((item) => {
          const paths = item.activePaths ?? [item.href];
          const current = paths.some((path) => (path === "/" ? pathname === "/" : pathname.startsWith(path)));
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center whitespace-nowrap border-y-2 border-t-transparent px-0.5 text-base",
                  colorTransition,
                  focusRingTopbar,
                  current
                    ? "border-b-accent font-bold text-shell-topbar-ink"
                    : "border-b-transparent text-shell-topbar-muted hover:text-shell-topbar-ink",
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
