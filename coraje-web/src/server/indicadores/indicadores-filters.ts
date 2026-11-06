import { z } from "zod";

/**
 * Filtros y vista del panel de indicadores, leídos de la URL (U39,
 * specs/indicadores.md §1).
 *
 * Los filtros viajan en la URL y no en estado del navegador: un panel
 * filtrado se puede compartir, recargar y volver atrás sin perder nada, y la
 * página es un Server Component que los recibe en `searchParams`.
 *
 * Un valor inválido se descarta en silencio, no es un error: una URL vieja o
 * editada a mano muestra el panel sin ese filtro en vez de una página rota.
 * Lo que nunca pasa es que un valor sin validar llegue a SQL: los
 * identificadores tienen que ser UUID y los números, enteros en su rango.
 */

/** Pestañas del panel. Cubren las seis páginas del Power BI. */
export const INDICADORES_VISTAS = ["volumen", "oportunidad", "calidad", "tickets"] as const;
export type IndicadoresVista = (typeof INDICADORES_VISTAS)[number];

export interface IndicadoresFiltros {
  anio: number | null;
  mes: number | null;
  areaDestino: string | null;
  areaRemite: string | null;
  estado: string | null;
  tipoReq: string | null;
  responsable: string | null;
}

/** Nombre de cada filtro en la URL. */
export const FILTRO_PARAM = {
  anio: "anio",
  mes: "mes",
  areaDestino: "area_destino",
  areaRemite: "area_remite",
  estado: "estado",
  tipoReq: "tipo",
  responsable: "responsable",
} as const satisfies Record<keyof IndicadoresFiltros, string>;

export const SIN_FILTROS: IndicadoresFiltros = {
  anio: null,
  mes: null,
  areaDestino: null,
  areaRemite: null,
  estado: null,
  tipoReq: null,
  responsable: null,
};

const anioSchema = z.coerce.number().int().min(2000).max(2100);
const mesSchema = z.coerce.number().int().min(1).max(12);
const uuidSchema = z.uuid();
const vistaSchema = z.enum(INDICADORES_VISTAS);

type RawParams = Record<string, string | string[] | undefined>;

/** El primer valor de un parámetro; una URL puede repetirlo. */
function first(params: RawParams, name: string): string | undefined {
  const value = params[name];
  return Array.isArray(value) ? value[0] : value;
}

function parsed<T>(schema: z.ZodType<T>, value: string | undefined): T | null {
  if (value === undefined || value === "") return null;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseIndicadoresParams(params: RawParams): { vista: IndicadoresVista; filtros: IndicadoresFiltros } {
  return {
    vista: parsed(vistaSchema, first(params, "vista")) ?? "volumen",
    filtros: {
      anio: parsed(anioSchema, first(params, FILTRO_PARAM.anio)),
      mes: parsed(mesSchema, first(params, FILTRO_PARAM.mes)),
      areaDestino: parsed(uuidSchema, first(params, FILTRO_PARAM.areaDestino)),
      areaRemite: parsed(uuidSchema, first(params, FILTRO_PARAM.areaRemite)),
      estado: parsed(uuidSchema, first(params, FILTRO_PARAM.estado)),
      tipoReq: parsed(uuidSchema, first(params, FILTRO_PARAM.tipoReq)),
      responsable: parsed(uuidSchema, first(params, FILTRO_PARAM.responsable)),
    },
  };
}

/**
 * La URL de una vista con unos filtros. Las pestañas la usan para cambiar de
 * vista sin perder los filtros; solo escribe los que tienen valor.
 */
export function indicadoresHref(vista: IndicadoresVista, filtros: IndicadoresFiltros): string {
  const search = new URLSearchParams();
  if (vista !== "volumen") search.set("vista", vista);
  for (const key of Object.keys(FILTRO_PARAM) as (keyof IndicadoresFiltros)[]) {
    const value = filtros[key];
    if (value !== null) search.set(FILTRO_PARAM[key], String(value));
  }
  const query = search.toString();
  return query ? `/indicadores?${query}` : "/indicadores";
}

/** Cuántos filtros están aplicados: el botón «Limpiar» solo aparece si hay alguno. */
export function activeFilterCount(filtros: IndicadoresFiltros): number {
  return Object.values(filtros).filter((value) => value !== null).length;
}
