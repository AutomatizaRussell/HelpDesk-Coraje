import type { helpdeskTheme } from "../../themes/helpdesk";

/**
 * Temas de color por área (U16). La clave dice qué color de la firma toma un
 * área; qué área es cuál lo decide el dominio (`features/areas/area-theme.ts`),
 * no este patrón.
 *
 * Las clases van escritas enteras, sin componer: Tailwind solo genera las
 * clases que encuentra literales en el código.
 */
export type AreaThemeKey = keyof typeof helpdeskTheme.area;

export const AREA_THEME_KEYS = ["revisoria", "contabilidad", "bpo", "legal", "general"] as const satisfies readonly AreaThemeKey[];

/** El punto pleno del color del área, junto a su nombre. */
export const AREA_DOT_CLASS: Record<AreaThemeKey, string> = {
  revisoria: "bg-area-revisoria",
  contabilidad: "bg-area-contabilidad",
  bpo: "bg-area-bpo",
  legal: "bg-area-legal",
  general: "bg-area-general",
};
