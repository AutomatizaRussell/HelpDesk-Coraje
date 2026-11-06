import { brandPrimitives, tint } from "../foundations/brand";
import { dataViz } from "../foundations/data-viz";
import { helpdeskTheme } from "./helpdesk";

/**
 * Tema de los gráficos de HelpDesk, generado desde las fuentes de los tokens
 * (U39; design/sistema-helpdesk.md §5.9). Concepto tomado de Impulsa
 * (`themes/impulsa-chart.ts`), con la paleta de HelpDesk.
 *
 * ECharts no lee `var(--…)`: calcula los colores en atributos SVG. Por eso el
 * tema se construye desde las mismas fuentes TypeScript con que se generan
 * las variables CSS (`foundations/brand.ts`, `themes/helpdesk.ts`), nunca
 * desde el CSS y nunca escribiendo un valor en un gráfico.
 *
 * PAPELES DE COLOR (validados con el validador de paletas, 06-nov-2026):
 *   - `serie`: una sola magnitud (tickets por área, % por mes). Navy, el
 *     único color de marca con 3:1 sobre blanco; Sky Blue no llega.
 *   - `escala`: una escala ordenada de mejor a peor (la oportunidad de
 *     respuesta). Rampa secuencial de un solo tono, de navy a su tinta de
 *     40 %, con la claridad creciendo pareja (L 0,28 → 0,72). La tinta clara
 *     queda bajo 3:1: cada gráfico lleva su tabla de datos al lado.
 *   - `aparte`: lo que no es un punto de la escala (un ticket abierto no es
 *     ni bueno ni malo). Sky Blue, siempre junto al navy y nunca junto a la
 *     tinta clara: junto a navy separa con ΔE 38,6 bajo daltonismo; junto a
 *     la tinta de 40 %, 1,6.
 * Los colores de estado (`danger`, `warning`, `success`) no pintan series:
 * conservan su significado.
 */
export const helpdeskChart = {
  color: {
    serie: brandPrimitives.navy,
    escala: [brandPrimitives.navy, tint("navy", 80), tint("navy", 60), tint("navy", 40)],
    aparte: brandPrimitives.skyBlue,
    texto: helpdeskTheme.color.ink,
    textoSuave: helpdeskTheme.color.inkMuted,
    eje: helpdeskTheme.color.lineStrong,
    rejilla: helpdeskTheme.color.line,
    superficie: helpdeskTheme.color.surface,
  },
  size: dataViz,
} as const;

/**
 * El objeto de tema de ECharts. Lo registra `Chart` una vez, con la familia
 * tipográfica ya resuelta en el navegador. Lo que un gráfico no fija cae en
 * estos valores, y eso es lo que mantiene iguales todos los gráficos.
 */
export function buildEchartsTheme(fontFamily: string) {
  const c = helpdeskChart.color;
  const axis = {
    axisLine: { show: true, lineStyle: { color: c.eje, width: dataViz.stroke.axis } },
    axisTick: { show: false },
    axisLabel: { color: c.textoSuave, fontSize: dataViz.fontSize.axis, fontFamily },
    splitLine: { show: true, lineStyle: { color: c.rejilla, width: dataViz.stroke.axis } },
  };
  return {
    color: [c.serie],
    backgroundColor: "transparent",
    textStyle: { fontFamily, fontSize: dataViz.fontSize.label, color: c.texto },
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: { ...axis, axisLine: { show: false } },
    line: { symbolSize: dataViz.symbol.point, lineStyle: { width: dataViz.stroke.line } },
    tooltip: {
      backgroundColor: c.superficie,
      borderColor: c.eje,
      borderWidth: dataViz.stroke.axis,
      textStyle: { color: c.texto, fontSize: dataViz.fontSize.tooltip, fontFamily },
    },
    legend: { textStyle: { color: c.textoSuave, fontSize: dataViz.fontSize.label, fontFamily } },
  };
}
