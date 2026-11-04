import Link from "next/link";

import { colorTransition, focusRingInset } from "../recipes/interaction";
import { cn } from "../utilities/cn";

/**
 * Pestañas subrayadas que eligen una vista de la misma lista (las vistas de
 * la bandeja, U30). Mismo contrato que `SegmentedLinks` —enlaces con su URL,
 * `aria-current`, la actual marcada por peso y no solo por color— con otra
 * forma: aquí encabezan una tarjeta, y un grupo de botones encajonado
 * competiría con la cabecera del área.
 *
 * El subrayado es el acento del área, que es marca y no texto (Sky Blue no
 * llega a 3:1 sobre blanco): por eso la pestaña actual cambia además a Black
 * y a navy. El foco va hacia dentro porque la fila se desplaza en móvil y un
 * anillo hacia fuera quedaría recortado.
 */
export type TabLinkItem = { label: string; href: string; current: boolean };

export function TabLinks({ label, items }: { label: string; items: readonly TabLinkItem[] }) {
  return (
    <nav aria-label={label} className="min-w-0 overflow-x-auto">
      <ul className="flex gap-7">
        {items.map((item) => (
          <li key={item.href} className="flex">
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "whitespace-nowrap border-b-3 pt-4.5 pb-3.5 text-md",
                colorTransition,
                focusRingInset,
                item.current ? "border-accent font-black text-heading" : "border-transparent font-bold text-ink-muted hover:text-heading",
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
