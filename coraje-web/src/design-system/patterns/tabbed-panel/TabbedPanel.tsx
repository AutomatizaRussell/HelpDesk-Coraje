"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { colorTransition, focusRingInset } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * Pestañas que alternan paneles en el mismo sitio: el cuadro de respuesta del
 * ticket («Responder al solicitante» / «Nota interna»).
 *
 * **Todos los paneles quedan montados**, ocultos con `hidden`: cambiar de
 * pestaña no borra lo que se escribió en la otra.
 *
 * Patrón ARIA de pestañas: `tablist`, flechas izquierda y derecha para
 * moverse, y solo la pestaña activa en el orden de tabulación. Con una sola
 * pestaña no se dibuja la fila: no hay nada que elegir.
 */
export type TabbedPanelItem = {
  id: string;
  label: string;
  content: ReactNode;
};

export function TabbedPanel({ label, items }: { label: string; items: readonly TabbedPanelItem[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (items.length === 0) return null;
  if (items.length === 1) return <div>{items[0].content}</div>;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length;
    setActive(items[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
        {items.map((item, index) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              // Mismo tratamiento que ModuleNav: la pestaña activa se marca con
              // el acento y el peso, no solo con color.
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-base",
                colorTransition,
                focusRingInset,
                selected ? "border-accent font-bold text-heading" : "border-transparent text-ink-muted hover:text-heading",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          className="pt-4"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
