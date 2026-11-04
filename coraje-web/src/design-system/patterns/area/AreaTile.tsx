import { cn } from "../../utilities/cn";
import { AREA_TILE_CLASS, type AreaThemeKey } from "./area";

/**
 * El área de un ticket en la bandeja (U30): un recuadro en la tinta del área
 * con su código de tres letras, y al lado el nombre y, debajo, el tipo.
 *
 * Reemplaza en la bandeja al punto de `AreaName`: con muchas filas, un bloque
 * de color con letras se encuentra al recorrer la columna con la vista, y un
 * punto de 10 px no. El nombre sigue escrito, así que el color nunca es lo
 * único que dice de qué área es.
 */
export function AreaTile({
  area,
  code,
  name,
  detail,
}: {
  area: AreaThemeKey;
  /** Código corto del área (`areaShortCode`), solo de apoyo visual. */
  code: string;
  name: string;
  /** Segunda línea, más tenue: el tipo de ticket. */
  detail?: string | null;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-control text-2xs font-black tracking-wide text-heading",
          AREA_TILE_CLASS[area],
        )}
      >
        {code}
      </span>
      <span className="min-w-0">
        <span className="block font-bold">{name}</span>
        {detail && <span className="block text-sm text-ink-muted">{detail}</span>}
      </span>
    </span>
  );
}
