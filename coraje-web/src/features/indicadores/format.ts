/**
 * Formato de las cifras del panel de indicadores (U39). Una sola fuente para
 * tarjetas, ejes, tooltips y tablas: el mismo número se escribe igual en todos
 * los sitios donde aparece.
 *
 * Locale `es-CO`: miles con punto y decimales con coma, como en el resto de
 * la firma. La zona horaria no entra: las fechas del panel son fechas de
 * Bogotá ya calculadas por la base (`v_indicador_ticket`).
 */

const ENTERO = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const PORCENTAJE = new Intl.NumberFormat("es-CO", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const CALIFICACION = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ausencia de dato: un promedio sin tickets no es 0 %, es «sin dato». */
export const SIN_DATO = "—";

export function formatEntero(value: number): string {
  return ENTERO.format(value);
}

/** Proporción de 0 a 1 como porcentaje con un decimal: 0.7313 → «73,1 %». */
export function formatPorcentaje(value: number | null): string {
  return value === null ? SIN_DATO : PORCENTAJE.format(value);
}

/** Calificación promedio de 1 a 5 con dos decimales: 4.8825 → «4,88». */
export function formatCalificacion(value: number | null): string {
  return value === null ? SIN_DATO : CALIFICACION.format(value);
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

/** Etiqueta corta de un mes para un eje: (2026, 3) → «mar 2026». */
export function formatMesCorto(anio: number, mes: number): string {
  return `${MESES[mes - 1]} ${anio}`;
}

/** Nombre del mes para un selector: 3 → «Marzo». */
export function nombreMes(mes: number): string {
  const nombre = MESES_LARGOS[mes - 1];
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

/**
 * Fecha de la vista como día/mes/año: «2026-10-01» → «01/10/2026». La
 * consulta la pide como texto ISO a propósito: el driver convierte un DATE en
 * medianoche de la zona del proceso, y según dónde corra la fecha se correría
 * un día. Un texto no tiene zona.
 */
export function formatFechaDia(value: string | null): string {
  if (!value) return SIN_DATO;
  const [anio, mes, dia] = value.split("-");
  return `${dia}/${mes}/${anio}`;
}

/**
 * Las etiquetas del Power BI llevan su orden pegado («1.Excelente»). Para
 * leerlas se quita el prefijo; el orden lo da `CATEGORIAS_OPORTUNIDAD`.
 */
export function etiquetaCategoria(categoria: string): string {
  return categoria.replace(/^\d\./, "");
}
