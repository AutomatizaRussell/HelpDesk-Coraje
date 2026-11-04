import Image from "next/image";
import type { ReactNode } from "react";

import isotype from "../../../../public/rb-isotype-white.png";
import { helpdeskTheme } from "../../themes/helpdesk";

/**
 * Estado vacío de una lista (U30): el globo blanco dentro de un disco del
 * color del área, rodeado de su tinta, flotando despacio; debajo, qué falta y
 * cuándo aparecerá.
 *
 * Es el mismo motivo que la cabecera del área a escala de tarjeta, así que
 * una lista vacía no se siente rota sino tranquila. El globo es motivo
 * decorativo, como lo admite el manual de marca (§4.1): blanco, sin girar ni
 * deformar. El texto lleva toda la información; el dibujo es `aria-hidden`.
 */
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  const size = Number.parseFloat(helpdeskTheme.size.emptyIsotype);
  return (
    <div className="px-6 py-14 text-center">
      <span aria-hidden="true" className="mx-auto grid size-empty-mark animate-float place-items-center rounded-pill bg-accent-surface">
        <span className="grid size-empty-mark-inner place-items-center rounded-pill bg-accent">
          <Image src={isotype} alt="" width={size} height={size} className="size-empty-isotype" />
        </span>
      </span>
      <h2 className="mt-4 text-md font-black text-heading">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-base text-ink-muted">{children}</p>
    </div>
  );
}
