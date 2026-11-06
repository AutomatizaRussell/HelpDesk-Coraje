import { notFound } from "next/navigation";

import { TabLinks } from "@/design-system/components/TabLinks";
import { EmptyState } from "@/design-system/patterns/empty-state/EmptyState";
import { sectionTitle, surface } from "@/design-system/recipes/surface";
import {
  BarrasHorizontales,
  CategoriasPorArea,
  SerieMensual,
  type BarraDato,
} from "@/features/indicadores/IndicadorCharts";
import {
  CifrasIndicadores,
  DetalleTickets,
  FiltrosIndicadores,
  TablaDatos,
  TarjetaGrafico,
  type ColumnaTabla,
} from "@/features/indicadores/IndicadoresPanel";
import { etiquetaCategoria, formatCalificacion, formatEntero, formatMesCorto, formatPorcentaje } from "@/features/indicadores/format";
import { AppFrame } from "@/features/shell/AppFrame";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { indicadoresHref, parseIndicadoresParams, type IndicadoresVista } from "@/server/indicadores/indicadores-filters";
import {
  CATEGORIAS_OPORTUNIDAD,
  LIMITE_TICKETS,
  getPanelIndicadores,
  type FilaAgrupada,
  type FilaMensual,
} from "@/server/indicadores/indicadores-queries";

/**
 * Panel de indicadores (U39, specs/indicadores.md): el Power BI «IND
 * HELPDESK» con su lógica y diseño propio. Cuatro vistas cubren sus seis
 * páginas:
 *   - Volumen: tickets por área destino, por área que remite, por responsable,
 *     por solicitante y por mes (páginas «Tickets recibidos» y «creados»);
 *   - Oportunidad: % por área, escala por área y % por mes;
 *   - Calidad: calificación por mes y por responsable;
 *   - Tickets: el detalle (las dos páginas «Detalle»).
 *
 * Solo lee. Sin `indicadores.ver`, la ruta responde como si no existiera.
 */

const VISTAS: { vista: IndicadoresVista; label: string }[] = [
  { vista: "volumen", label: "Volumen" },
  { vista: "oportunidad", label: "Oportunidad" },
  { vista: "calidad", label: "Calidad" },
  { vista: "tickets", label: "Tickets" },
];

/** Personas que caben en un ranking: el resto está en su tabla. */
const TOPE_RANKING = 12;

const nota = (filas: readonly FilaAgrupada[]) =>
  filas.length > TOPE_RANKING ? `Las ${TOPE_RANKING} con más tickets; las ${filas.length} están en «Ver datos».` : undefined;

const COLUMNAS_GRUPO: ColumnaTabla<FilaAgrupada>[] = [
  { label: "Nombre", value: (f) => f.nombre },
  { label: "Tickets", value: (f) => formatEntero(f.total), numeric: true },
  { label: "Oportunidad", value: (f) => formatPorcentaje(f.oportunidad), numeric: true },
  { label: "Calidad", value: (f) => formatCalificacion(f.calidad), numeric: true },
];

const COLUMNAS_MES: ColumnaTabla<FilaMensual>[] = [
  { label: "Mes", value: (f) => formatMesCorto(f.anio, f.mes) },
  { label: "Tickets", value: (f) => formatEntero(f.total), numeric: true },
  { label: "Oportunidad", value: (f) => formatPorcentaje(f.oportunidad), numeric: true },
  { label: "Calidad", value: (f) => formatCalificacion(f.calidad), numeric: true },
];

const barras = (filas: readonly FilaAgrupada[], medida: "total" | "oportunidad" | "calidad"): BarraDato[] =>
  filas.slice(0, TOPE_RANKING).map((fila) => ({ nombre: fila.nombre, valor: fila[medida] }));

/** Una tarjeta de ranking: el gráfico de las primeras y la tabla de todas. */
function Ranking({ id, title, filas, medida }: { id: string; title: string; filas: readonly FilaAgrupada[]; medida: "total" | "oportunidad" }) {
  return (
    <TarjetaGrafico
      id={id}
      title={title}
      note={nota(filas)}
      chart={<BarrasHorizontales label={title} filas={barras(filas, medida)} formato={medida === "total" ? "entero" : "porcentaje"} />}
      table={<TablaDatos caption={title} rows={filas} columns={COLUMNAS_GRUPO} rowKey={(f) => f.id ?? f.nombre} />}
    />
  );
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const employee = await requireCurrentEmployee("/indicadores");
  const { vista, filtros } = parseIndicadoresParams(await searchParams);
  const panel = await getPanelIndicadores(employee.idPersonal, filtros);
  if (!panel) notFound();

  const { resumen, mensual } = panel;
  const tabs = VISTAS.map((item) => ({ label: item.label, href: indicadoresHref(item.vista, filtros), current: item.vista === vista }));

  return (
    <AppFrame employee={employee} title="Indicadores">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Tickets radicados en PowerApps, por fecha de solicitud. La oportunidad sigue la escala del Power BI, en días calendario.
        </p>
        <FiltrosIndicadores vista={vista} filtros={filtros} opciones={panel.opciones} />
        <TabLinks label="Vistas del panel" items={tabs} />

        {resumen.total === 0 ? (
          <EmptyState title="Sin tickets">Ningún ticket coincide con estos filtros.</EmptyState>
        ) : (
          <>
            <CifrasIndicadores resumen={resumen} />

            {vista === "volumen" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <Ranking id="area-destino" title="Tickets por área destino" filas={panel.porAreaDestino} medida="total" />
                <Ranking id="area-remite" title="Tickets por área que remite" filas={panel.porAreaRemite} medida="total" />
                <Ranking id="responsable" title="Tickets por responsable" filas={panel.porResponsable} medida="total" />
                <Ranking id="solicitante" title="Tickets por solicitante" filas={panel.porSolicitante} medida="total" />
                <div className="xl:col-span-2">
                  <TarjetaGrafico
                    id="mes"
                    title="Tickets por mes"
                    chart={<SerieMensual label="Tickets por mes" filas={mensual.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.total }))} formato="entero" />}
                    table={<TablaDatos caption="Tickets por mes" rows={mensual} columns={COLUMNAS_MES} rowKey={(f) => `${f.anio}-${f.mes}`} />}
                  />
                </div>
              </div>
            )}

            {vista === "oportunidad" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <Ranking id="oportunidad-area" title="Oportunidad por área destino" filas={panel.porAreaDestino} medida="oportunidad" />
                <TarjetaGrafico
                  id="escala-area"
                  title="Escala de oportunidad por área destino"
                  note="Tickets en cada punto de la escala. Un ticket abierto vencido cuenta 0 en el promedio; uno en plazo no cuenta."
                  chart={<CategoriasPorArea label="Escala de oportunidad por área destino" filas={panel.categoriasPorArea} categorias={CATEGORIAS_OPORTUNIDAD} />}
                  table={
                    <TablaDatos
                      caption="Escala de oportunidad por área destino"
                      rows={panel.categoriasPorArea}
                      columns={[
                        { label: "Área", value: (f) => f.area },
                        { label: "Escala", value: (f) => etiquetaCategoria(f.categoria) },
                        { label: "Tickets", value: (f) => formatEntero(f.total), numeric: true },
                      ]}
                      rowKey={(f) => `${f.area}-${f.categoria}`}
                    />
                  }
                />
                <div className="xl:col-span-2">
                  <TarjetaGrafico
                    id="oportunidad-mes"
                    title="Oportunidad por mes"
                    chart={<SerieMensual label="Oportunidad por mes" filas={mensual.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.oportunidad }))} formato="porcentaje" />}
                    table={<TablaDatos caption="Oportunidad por mes" rows={mensual} columns={COLUMNAS_MES} rowKey={(f) => `${f.anio}-${f.mes}`} />}
                  />
                </div>
              </div>
            )}

            {vista === "calidad" && (
              <div className="grid gap-4">
                <TarjetaGrafico
                  id="calidad-mes"
                  title="Calidad por mes"
                  note="Promedio de la calificación de quien radicó, de 1 a 5."
                  chart={<SerieMensual label="Calidad por mes" filas={mensual.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.calidad }))} formato="calificacion" />}
                  table={<TablaDatos caption="Calidad por mes" rows={mensual} columns={COLUMNAS_MES} rowKey={(f) => `${f.anio}-${f.mes}`} />}
                />
                <section className={surface()} aria-labelledby="calidad-responsable-titulo">
                  <h2 id="calidad-responsable-titulo" className={sectionTitle}>
                    Calidad por responsable
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">Ordenado por número de tickets.</p>
                  <div className="mt-3">
                    <TablaDatos caption="Calidad por responsable" rows={panel.porResponsable} columns={COLUMNAS_GRUPO} rowKey={(f) => f.id ?? f.nombre} />
                  </div>
                </section>
              </div>
            )}

            {vista === "tickets" && <DetalleTickets tickets={panel.tickets} total={resumen.total} limite={LIMITE_TICKETS} />}
          </>
        )}
      </div>
    </AppFrame>
  );
}
