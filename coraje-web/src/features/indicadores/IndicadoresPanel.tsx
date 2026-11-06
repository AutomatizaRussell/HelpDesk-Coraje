import Link from "next/link";
import type { ReactNode } from "react";

import { buttonRecipe } from "@/design-system/recipes/button";
import { fieldControl, fieldLabel } from "@/design-system/recipes/field";
import { focusRing } from "@/design-system/recipes/interaction";
import { sectionTitle, surface } from "@/design-system/recipes/surface";
import { cn } from "@/design-system/utilities/cn";
import {
  FILTRO_PARAM,
  SIN_FILTROS,
  activeFilterCount,
  indicadoresHref,
  type IndicadoresFiltros,
  type IndicadoresVista,
} from "@/server/indicadores/indicadores-filters";
import type { FilaTicket, OpcionesFiltro } from "@/server/indicadores/indicadores-queries";

import { etiquetaCategoria, formatEntero, formatFechaDia, nombreMes, SIN_DATO } from "./format";

/**
 * Piezas de servidor del panel de indicadores (U39): filtros, tarjetas de gráfico con su tabla y el detalle de tickets. Los gráficos
 * son de cliente (`IndicadorCharts.tsx`); todo lo demás se renderiza en el
 * servidor y funciona sin JavaScript.
 */

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/**
 * Formulario GET: aplicar es navegar a la URL con los filtros, así que el
 * panel filtrado se puede compartir y recargar. La vista viaja oculta para
 * que filtrar no cambie de pestaña. Un solo botón primario por contexto.
 */
export function FiltrosIndicadores({
  vista,
  filtros,
  opciones,
}: {
  vista: IndicadoresVista;
  filtros: IndicadoresFiltros;
  opciones: OpcionesFiltro;
}) {
  const select = (name: string, label: string, value: string | number | null, items: { id: string; nombre: string }[]) => (
    <div className="min-w-0">
      <label htmlFor={`filtro-${name}`} className={fieldLabel}>
        {label}
      </label>
      <select id={`filtro-${name}`} name={name} defaultValue={value === null ? "" : String(value)} className={fieldControl()}>
        <option value="">Todos</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nombre}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form method="get" action="/indicadores" className={surface()} aria-label="Filtros del panel">
      {vista !== "volumen" && <input type="hidden" name="vista" value={vista} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {select(FILTRO_PARAM.anio, "Año", filtros.anio, opciones.anios.map((anio) => ({ id: String(anio), nombre: String(anio) })))}
        {select(FILTRO_PARAM.mes, "Mes", filtros.mes, Array.from({ length: 12 }, (_, i) => ({ id: String(i + 1), nombre: nombreMes(i + 1) })))}
        {select(FILTRO_PARAM.areaDestino, "Área destino", filtros.areaDestino, opciones.areas)}
        {select(FILTRO_PARAM.areaRemite, "Área que remite", filtros.areaRemite, opciones.areas)}
        {select(FILTRO_PARAM.estado, "Estado", filtros.estado, opciones.estados)}
        {select(FILTRO_PARAM.tipoReq, "Tipo de requerimiento", filtros.tipoReq, opciones.tipos)}
        {select(FILTRO_PARAM.responsable, "Responsable", filtros.responsable, opciones.responsables)}
        <div className="flex items-end gap-3">
          <button type="submit" className={buttonRecipe()}>
            Aplicar
          </button>
          {activeFilterCount(filtros) > 0 && (
            <Link href={indicadoresHref(vista, SIN_FILTROS)} className={buttonRecipe({ variant: "secondary" })}>
              Quitar filtros
            </Link>
          )}
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de gráfico con su tabla
// ---------------------------------------------------------------------------

export interface ColumnaTabla<T> {
  label: string;
  value: (row: T) => string;
  numeric?: boolean;
}

/** Tabla de datos simple: la versión en texto de un gráfico o el detalle de tickets. */
export function TablaDatos<T>({ caption, rows, columns, rowKey }: { caption: string; rows: readonly T[]; columns: readonly ColumnaTabla<T>[]; rowKey: (row: T) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th key={column.label} scope="col" className={cn("py-2 pr-4 font-bold text-ink-muted", column.numeric ? "text-right" : "text-left")}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line last:border-b-0">
              {columns.map((column) => (
                <td key={column.label} className={cn("py-1.5 pr-4 text-ink", column.numeric && "text-right tabular-nums")}>
                  {column.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Un gráfico con su título, una nota opcional y sus datos en texto debajo,
 * plegados: quien solo mira el dibujo no los ve, quien los necesita (lector
 * de pantalla, contraste bajo de la tinta clara, copiar un número) sí.
 */
export function TarjetaGrafico({ id, title, note, chart, table }: { id: string; title: string; note?: string; chart: ReactNode; table: ReactNode }) {
  return (
    <section className={surface()} aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className={sectionTitle}>
        {title}
      </h2>
      {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
      <div className="mt-3">{chart}</div>
      <details className="mt-3">
        <summary className={cn("w-fit cursor-pointer rounded-control text-sm text-ink-muted hover:text-heading", focusRing)}>Ver datos</summary>
        <div className="mt-2">{table}</div>
      </details>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Detalle de tickets
// ---------------------------------------------------------------------------

const COLUMNAS_TICKET: ColumnaTabla<FilaTicket>[] = [
  { label: "Código", value: (t) => t.codigo ?? SIN_DATO },
  { label: "Id PowerApps", value: (t) => t.idLegacy ?? SIN_DATO },
  { label: "Solicitud", value: (t) => formatFechaDia(t.fechaSolicitud), numeric: true },
  { label: "Límite", value: (t) => formatFechaDia(t.fechaMaxRespuesta), numeric: true },
  { label: "Respuesta", value: (t) => formatFechaDia(t.fechaRespuesta), numeric: true },
  { label: "Área destino", value: (t) => t.areaDestino },
  { label: "Área que remite", value: (t) => t.areaRemite ?? SIN_DATO },
  { label: "Prioridad", value: (t) => t.prioridad ?? SIN_DATO },
  { label: "Responsable", value: (t) => t.responsable ?? SIN_DATO },
  { label: "Oportunidad", value: (t) => etiquetaCategoria(t.categoria) },
  { label: "Días vs. límite", value: (t) => (t.diasRespuesta === null ? SIN_DATO : String(t.diasRespuesta)), numeric: true },
  { label: "Calificación", value: (t) => (t.calificacion === null ? SIN_DATO : String(t.calificacion)), numeric: true },
];

export function DetalleTickets({ tickets, total, limite }: { tickets: readonly FilaTicket[]; total: number; limite: number }) {
  return (
    <section className={surface()} aria-labelledby="detalle-titulo">
      <h2 id="detalle-titulo" className={sectionTitle}>
        Tickets
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {total > limite
          ? `Los ${formatEntero(limite)} más recientes de ${formatEntero(total)}. Filtra para acotar.`
          : `${formatEntero(total)} ${total === 1 ? "ticket" : "tickets"}, del más reciente al más antiguo.`}{" "}
        «Días vs. límite» negativo es una respuesta antes del límite.
      </p>
      <div className="mt-3">
        <TablaDatos caption="Detalle de tickets" rows={tickets} columns={COLUMNAS_TICKET} rowKey={(t) => t.idTicket} />
      </div>
    </section>
  );
}
