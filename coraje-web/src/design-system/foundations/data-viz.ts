/**
 * Primitivas de visualización de datos: los tamaños con que se dibuja un
 * gráfico (U39, indicadores; design/sistema-helpdesk.md §5.9).
 *
 * Por qué números y no variables CSS: ECharts dibuja en atributos SVG que
 * calcula él mismo y necesita valores resueltos (`11`, no `var(--…)`). El
 * contrato de gráficos guarda su escala aquí, en la capa de fundamentos, y
 * el tema (`themes/helpdesk-chart.ts`) la junta con los colores. Ninguna
 * vista escribe un valor de gráfico.
 *
 * Los tamaños de texto replican la escala tipográfica (`foundations/
 * typography.ts`) en píxeles: ejes y etiquetas son `xs` (11 px, el papel de
 * metadato) y el tooltip es `base` (14 px, el cuerpo), para que un eje se lea
 * como los metadatos que lo rodean.
 *
 * La altura del área de dibujo NO está aquí: es un token del tema
 * (`size.chart`, `size.chartTall`) que el componente consume como clase.
 */
export const dataViz = {
  /** Tamaños de texto en px. */
  fontSize: { axis: 11, label: 11, tooltip: 14 },
  /** Grosores en px. Las líneas de datos van a 2 px; ejes y rejilla, a 1. */
  stroke: { line: 2, axis: 1 },
  /** Marcador de un punto de línea, en px (mínimo 8 para poder apuntarlo). */
  symbol: { point: 8 },
  /** Ancho máximo de una barra en px y radio de su extremo de datos. */
  bar: { maxWidth: 28, radius: 4 },
  /** Separación en px entre segmentos apilados (2 px del color de la superficie). */
  gap: 2,
  /** Margen en px entre el área de dibujo y el borde del contenedor. */
  inset: 8,
  /** Espacio en px reservado arriba para la leyenda de varias series. */
  legend: 32,
  /** Ancho máximo en px de una etiqueta de categoría antes de cortarse. */
  categoryLabelWidth: 168,
} as const;
