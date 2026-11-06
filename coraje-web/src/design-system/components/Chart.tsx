"use client";

import { useEffect, useRef } from "react";
import { BarChart, LineChart } from "echarts/charts";
import type { BarSeriesOption, LineSeriesOption } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from "echarts/components";
import * as echarts from "echarts/core";
import type { ComposeOption } from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

import { buildEchartsTheme } from "../themes/helpdesk-chart";
import { cn } from "../utilities/cn";

/**
 * La única forma en que HelpDesk dibuja un gráfico (U39). Apache ECharts,
 * fijado en 6.0.0 como en Impulsa, detrás de este componente.
 *
 * PESO. ECharts se importa por módulos desde `echarts/core`, y solo llegan
 * al navegador los tipos registrados abajo: barras, líneas, rejilla, tooltip
 * y leyenda. Un gráfico que necesite otro tipo lo añade aquí, a propósito,
 * en vez de importar el paquete entero en otra parte. Se dibuja en SVG: los
 * gráficos son pequeños, se ven nítidos con cualquier zoom, se imprimen, y el
 * texto sigue siendo texto. Todo el dibujo ocurre en el navegador: la VPS
 * solo entrega los números.
 *
 * TEMA. Se registra una vez, construido desde los tokens
 * (`themes/helpdesk-chart.ts`). La familia tipográfica se lee ya resuelta del
 * `body`, porque `next/font` publica Lato con un nombre generado. Una opción
 * de gráfico fija datos y papeles, nunca colores ni tamaños propios.
 *
 * TAMAÑO. El ancho es el del contenedor y lo sigue con un `ResizeObserver`
 * (teléfono, barra lateral que se pliega); el alto es un token del tema, para
 * que la página no salte mientras los gráficos montan.
 *
 * ACCESIBILIDAD. El dibujo es una imagen con una etiqueta que dice qué
 * muestra; los números siempre están también en texto (la tabla de datos que
 * acompaña a cada gráfico), porque un lector de pantalla no lee un SVG. Con
 * movimiento reducido no hay animación: la preferencia se lee al aplicar la
 * opción, sin una suscripción por gráfico.
 */

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);

/** La opción que un gráfico puede declarar: solo los tipos registrados compilan. */
export type ChartOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption
>;

const THEME = "helpdesk";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
let themeRegistered = false;

function registerTheme(): void {
  if (themeRegistered) return;
  echarts.registerTheme(THEME, buildEchartsTheme(getComputedStyle(document.body).fontFamily));
  themeRegistered = true;
}

/** Alto del área de dibujo: clases que consumen `size.chart` y `size.chartTall`. */
const HEIGHT = { regular: "h-chart", tall: "h-chart-tall" } as const;

export type ChartHeight = keyof typeof HEIGHT;

export type ChartProps = {
  option: ChartOption;
  height: ChartHeight;
  /** Qué muestra el gráfico, para tecnología de asistencia: «Tickets por área destino». */
  label: string;
  className?: string;
};

export function Chart({ option, height, label, className }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // Montaje y desmontaje: una instancia por elemento, que sigue el tamaño de
  // su contenedor.
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    registerTheme();
    const chart = echarts.init(element, THEME, { renderer: "svg" });
    chartRef.current = chart;
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Cada cambio de opción reemplaza la anterior (`notMerge`): un gráfico es
  // función de sus datos, y una mezcla conservaría series que el filtro nuevo
  // ya no tiene.
  useEffect(() => {
    const reduced = window.matchMedia(REDUCED_MOTION).matches;
    chartRef.current?.setOption({ ...option, animation: !reduced }, { notMerge: true });
  }, [option]);

  return <div ref={ref} role="img" aria-label={label} className={cn("w-full min-w-0", HEIGHT[height], className)} />;
}
