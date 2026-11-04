"use client";

import { useLayoutEffect, useRef, useState } from "react";

import { focusRing } from "../../recipes/interaction";
import { cn } from "../../utilities/cn";

/**
 * La descripción del ticket en su cabecera (U32), recortada a tres líneas con
 * un botón para verla entera.
 *
 * Antes la cabecera llevaba solo la primera línea y la descripción completa
 * se repetía en una tarjeta debajo: en un ticket corto, el mismo texto dos
 * veces. Ahora hay un solo lugar. El recorte evita que una descripción larga
 * empuje la historia varias pantallas abajo, y el botón aparece solo si el
 * texto de verdad no cabe: se mide tras pintar (`scrollHeight` contra
 * `clientHeight`), porque cuántas líneas ocupa depende del ancho de la
 * ventana, no del número de caracteres. Sin JavaScript se ven las tres líneas.
 */
export function HeroDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || expanded) return;
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded]);

  return (
    <div className="mt-1">
      <p ref={ref} className={cn("whitespace-pre-wrap break-words text-lg text-heading", !expanded && "line-clamp-3")}>
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className={cn("mt-1 rounded-control text-sm font-bold text-heading underline underline-offset-3", focusRing)}
        >
          {expanded ? "Ver menos" : "Ver la descripción completa"}
        </button>
      )}
    </div>
  );
}
