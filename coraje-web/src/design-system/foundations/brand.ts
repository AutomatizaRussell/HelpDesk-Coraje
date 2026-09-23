/**
 * Primitivas de marca de Russell Bedford, tal como las fija el Manual de Marca
 * Corporativa (§3.1 color institucional, §3.2 complementarios).
 *
 * Son **nombres de la paleta, no significados de interfaz**. Una vista nunca
 * las consume: consume el tema (`themes/helpdesk.ts`), que decide qué papel
 * cumple cada color. Si una vista necesitara «el magenta», la pregunta correcta
 * es qué significa ese magenta, y la respuesta se escribe en el tema.
 *
 * Cada color identifica además un área de la firma (naranja → Revisoría,
 * teal → BPO, magenta → Contaduría…). HelpDesk es de toda la firma y puede
 * usarlos todos, con contención; el uso semántico por área exige confirmar el
 * mapeo con el usuario antes de materializarlo (design/sistema-helpdesk.md §2).
 *
 * Sky Blue se toma por su hexadecimal: el RGB impreso en el manual (152, 29,
 * 206) es un error de copia; hex y CMYK coinciden en `#00a9ce`.
 */
export const brandPrimitives = {
  navy: "#001871", // PAN 2748 RBI Space Blue — color principal
  seaGreen: "#00bfb3", // PAN 3262 RBI Sea Green
  earthOrange: "#ed8b00", // PAN 144 RBI Earth Orange
  skyBlue: "#00a9ce", // PAN 312 RBI Sky Blue
  mindMagenta: "#981d97", // PAN 254 RBI Mind Magenta
  white: "#ffffff",
} as const;

export type BrandColorName = Exclude<keyof typeof brandPrimitives, "white">;

/** Intensidades de tinta que el manual aprueba para los cinco colores. */
export const TINT_STRENGTHS = [80, 60, 40, 20] as const;
export type TintStrength = (typeof TINT_STRENGTHS)[number];

/**
 * Tinta aprobada: el color puesto sobre blanco a esa intensidad, canal a canal
 * `c + (255 − c) · (1 − intensidad)`.
 *
 * Se **calcula** en vez de copiarse como literal: así ningún hexadecimal de
 * tinta está escrito a mano en TypeScript, y el validador del contrato compara
 * el literal de `globals.css` contra esta misma función. Son opacas a
 * propósito: una superficie teñida debe verse igual sea cual sea lo que haya
 * detrás, cosa que un color translúcido no puede prometer.
 */
export function brandTint(hex: string, strength: TintStrength): string {
  const factor = 1 - strength / 100;
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  return `#${channels
    .map((channel) => Math.round(channel + (255 - channel) * factor).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Atajo tipado: `tint("skyBlue", 20)`. */
export function tint(color: BrandColorName, strength: TintStrength): string {
  return brandTint(brandPrimitives[color], strength);
}
