import { cn } from "../../utilities/cn";
import { AREA_DOT_CLASS, type AreaThemeKey } from "./area";

/**
 * El nombre de un área con un punto de su color (U16): en la columna «Área y
 * tipo» de la bandeja y en el detalle del ticket.
 *
 * El color va en el punto y no en el texto: naranja, Sea Green y Sky Blue no
 * llegan a 4,5:1 sobre blanco. El nombre sigue escrito, así que el color
 * nunca es lo único que dice de qué área es el ticket.
 */
export function AreaName({ area, name, className }: { area: AreaThemeKey; name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-pill", AREA_DOT_CLASS[area])} />
      <span>{name}</span>
    </span>
  );
}
