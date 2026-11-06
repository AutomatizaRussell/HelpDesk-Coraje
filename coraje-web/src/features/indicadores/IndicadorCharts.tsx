"use client";

import { useMemo } from "react";

import { Chart, type ChartOption } from "@/design-system/components/Chart";
import { helpdeskChart } from "@/design-system/themes/helpdesk-chart";

import { etiquetaCategoria, formatCalificacion, formatEntero, formatMesCorto, formatPorcentaje } from "./format";

/**
 * Gráficos del panel de indicadores (U39). Reciben filas ya agregadas por la
 * base y solo deciden la forma; colores y tamaños salen del tema
 * (`themes/helpdesk-chart.ts`), nunca de aquí.
 *
 * Forma elegida por tarea (guía de visualización):
 *   - ranking de una magnitud (tickets por área o por persona): barras
 *     horizontales, la mayor arriba, porque los nombres son largos;
 *   - composición por una escala ordenada (oportunidad por área): barras
 *     apiladas con la rampa de navy y «Ticket abierto» aparte;
 *   - evolución mensual: una línea para el porcentaje y columnas para el
 *     volumen, en dos gráficos. El Power BI los junta con dos ejes, que
 *     hace parecer relacionadas dos escalas que no lo están.
 * Los números de cada gráfico están también en texto, en su tabla (la página
 * la pone al lado): un lector de pantalla no lee el SVG.
 */

type Formato = "entero" | "porcentaje" | "calificacion";

function formatear(formato: Formato, value: number | null): string {
  if (formato === "porcentaje") return formatPorcentaje(value);
  if (formato === "calificacion") return formatCalificacion(value);
  return value === null ? "—" : formatEntero(value);
}

const c = helpdeskChart.color;
const s = helpdeskChart.size;

/** Rejilla común: deja sitio a las etiquetas de categoría sin cortar el dibujo. */
const grid = (legend: boolean) => ({
  left: s.inset,
  right: s.inset * 3,
  top: legend ? s.legend : s.inset,
  bottom: s.inset,
  containLabel: true,
});

/** Eje de valores en porcentaje: la base cero siempre visible y el 100 % como techo. */
const ejePorcentaje = {
  type: "value" as const,
  min: 0,
  max: 1,
  axisLabel: { formatter: (value: number) => formatPorcentaje(value).replace(",0", "") },
};

export interface BarraDato {
  nombre: string;
  valor: number | null;
}

/** Ranking en barras horizontales. Hasta doce filas caben en `tall`; la página recorta antes. */
export function BarrasHorizontales({ label, filas, formato }: { label: string; filas: readonly BarraDato[]; formato: Formato }) {
  const option = useMemo<ChartOption>(() => {
    // ECharts dibuja la primera categoría abajo: se invierte para que la mayor quede arriba.
    const ordenadas = [...filas].reverse();
    return {
      grid: grid(false),
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number | null };
          return `${p.name}<br/><strong>${formatear(formato, p.value)}</strong>`;
        },
      },
      xAxis: formato === "porcentaje" ? ejePorcentaje : { type: "value", minInterval: 1 },
      yAxis: {
        type: "category",
        data: ordenadas.map((fila) => fila.nombre),
        axisLabel: { width: s.categoryLabelWidth, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: ordenadas.map((fila) => fila.valor),
          barMaxWidth: s.bar.maxWidth,
          // Extremo de datos redondeado; la base queda recta contra el eje.
          itemStyle: { color: c.serie, borderRadius: [0, s.bar.radius, s.bar.radius, 0] },
        },
      ],
    };
  }, [filas, formato]);

  return <Chart option={option} height={filas.length > 6 ? "tall" : "regular"} label={label} />;
}

export interface CategoriaDato {
  area: string;
  categoria: string;
  total: number;
}

/**
 * Oportunidad de respuesta por área: una barra apilada por área con las cinco
 * categorías en el orden de la escala. «Ticket abierto» va primero, junto al
 * navy: es la única posición donde su Sky Blue se distingue bajo daltonismo.
 */
export function CategoriasPorArea({ label, filas, categorias }: { label: string; filas: readonly CategoriaDato[]; categorias: readonly string[] }) {
  const option = useMemo<ChartOption>(() => {
    const areas = [...new Set(filas.map((fila) => fila.area))].reverse();
    const colores = [c.aparte, ...c.escala];
    return {
      grid: grid(true),
      legend: { top: 0, left: 0, itemWidth: s.fontSize.label, itemHeight: s.fontSize.label },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: { type: "value", minInterval: 1 },
      yAxis: { type: "category", data: areas, axisLabel: { width: s.categoryLabelWidth, overflow: "truncate" } },
      series: categorias.map((categoria, index) => ({
        type: "bar" as const,
        name: etiquetaCategoria(categoria),
        stack: "total",
        barMaxWidth: s.bar.maxWidth,
        // 2 px del color de la superficie entre segmentos: separa tonos vecinos de la rampa.
        itemStyle: { color: colores[index], borderColor: c.superficie, borderWidth: s.gap },
        data: areas.map((area) => filas.find((fila) => fila.area === area && fila.categoria === categoria)?.total ?? 0),
      })),
    };
  }, [filas, categorias]);

  return <Chart option={option} height={new Set(filas.map((f) => f.area)).size > 6 ? "tall" : "regular"} label={label} />;
}

export interface MesDato {
  anio: number;
  mes: number;
  valor: number | null;
}

/** Eje de la calificación (1 a 5). Solo para líneas: una barra siempre parte de cero. */
const ejeCalificacion = { type: "value" as const, min: 1, max: 5, interval: 1 };

/**
 * Evolución mensual: columnas para un volumen; línea para un porcentaje o una
 * calificación, que son promedios y no cantidades que se acumulan.
 */
export function SerieMensual({ label, filas, formato }: { label: string; filas: readonly MesDato[]; formato: Formato }) {
  const option = useMemo<ChartOption>(() => {
    const meses = filas.map((fila) => formatMesCorto(fila.anio, fila.mes));
    const valores = filas.map((fila) => fila.valor);
    return {
      grid: grid(false),
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const [p] = params as { name: string; value: number | null }[];
          return `${p.name}<br/><strong>${formatear(formato, p.value)}</strong>`;
        },
      },
      xAxis: { type: "category", data: meses },
      yAxis: formato === "porcentaje" ? ejePorcentaje : formato === "calificacion" ? ejeCalificacion : { type: "value", minInterval: 1 },
      series: [
        formato !== "entero"
          ? { type: "line", data: valores, connectNulls: false, itemStyle: { color: c.serie }, lineStyle: { color: c.serie } }
          : {
              type: "bar",
              data: valores,
              barMaxWidth: s.bar.maxWidth,
              itemStyle: { color: c.serie, borderRadius: [s.bar.radius, s.bar.radius, 0, 0] },
            },
      ],
    };
  }, [filas, formato]);

  return <Chart option={option} height="regular" label={label} />;
}
