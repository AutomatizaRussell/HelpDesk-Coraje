import type { AreaThemeKey } from "@/design-system/patterns/area/area";

/**
 * Qué color de la firma toma cada área (U16, decisión del usuario del
 * 01-oct-2026). Puro: lo usan el shell (área de quien entra) y la bandeja y el
 * detalle (área del ticket).
 *
 * Se compara el nombre de `core.dim_area` normalizado (sin tildes ni
 * mayúsculas), porque la tabla no tiene un código estable para el área y su
 * nombre viene de SharePoint. Un área nueva o con otro nombre cae en
 * `general` hasta que se añada aquí: nunca se queda sin color.
 *
 * ADMINISTRACIÓN-RECEPCIÓN e IMPUESTOS van a `general` a propósito: la firma
 * tiene cinco colores y las áreas con color propio son las que el usuario
 * nombró.
 */
const BY_NAME: Record<string, AreaThemeKey> = {
  revisoria: "revisoria",
  contabilidad: "contabilidad",
  bpo: "bpo",
  legal: "legal",
};

export function normalizeAreaName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

export function areaThemeKey(nombreArea: string | null | undefined): AreaThemeKey {
  if (!nombreArea) return "general";
  return BY_NAME[normalizeAreaName(nombreArea)] ?? "general";
}
