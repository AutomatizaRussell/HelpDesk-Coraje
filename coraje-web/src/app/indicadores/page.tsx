import { notFound } from "next/navigation";

import { TabLinks } from "@/design-system/components/TabLinks";
import type { AreaThemeKey } from "@/design-system/patterns/area/area";
import { AreaHero, type HeroStat } from "@/design-system/patterns/area-hero/AreaHero";
import { EmptyState } from "@/design-system/patterns/empty-state/EmptyState";
import { sectionTitle, surface } from "@/design-system/recipes/surface";
import { areaDisplayName, areaThemeKey } from "@/features/areas/area-theme";
import { BarrasHorizontales, CategoriasPorArea, SerieMensual, type BarraDato } from "@/features/indicadores/IndicadorCharts";
import { DetalleTickets, FiltrosIndicadores, TablaDatos, TarjetaGrafico, type ColumnaTabla } from "@/features/indicadores/IndicadoresPanel";
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
  type Resumen,
} from "@/server/indicadores/indicadores-queries";
import { getPersonAreaName } from "@/server/personal/person-area";

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
 * Color (design/sistema-helpdesk.md §5.9): la vista toma el color del área
 * destino filtrada o, sin ese filtro, el del área de quien entra, como el
 * resto de la aplicación. La cabecera es la de la bandeja (`AreaHero`), con
 * las cinco cifras del Power BI.
 *
 * Solo lee. Sin `indicadores.ver`, la ruta responde como si no existiera.
 */

const VISTAS: { vista: IndicadoresVista; label: string }[] = [
  { vista: "volumen", label: "Volumen" },
  { vista: "oportunidad", label: "Oportunidad" },
  { vista: "calidad", label: "Calidad" },
  { vista: "tickets", label: "Tickets" },
];

/** Personas o áreas que caben en un ranking: el resto está en su tabla. */
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

/** Las cinco cifras del Power BI, en la cabecera del área. */
function cifras(resumen: Resumen): HeroStat[] {
  return [
    { label: "Tickets", value: resumen.total, tone: "neutral" },
    { label: "Respondidos", value: resumen.respondidos, tone: "success" },
    { label: "Sin respuesta", value: resumen.sinRespuesta, tone: "warning" },
    { label: "Oportunidad", value: 0, display: formatPorcentaje(resumen.oportunidad), tone: "info" },
    { label: "Calidad", value: 0, display: formatCalificacion(resumen.calidad), tone: "info" },
  ];
}

/**
 * Una tarjeta de ranking: el gráfico de los primeros y la tabla de todos.
 * Si cada fila es un área (`porArea`), cada barra lleva el color de su área.
 */
function Ranking({
  id,
  title,
  filas,
  medida,
  tema,
  porArea = false,
}: {
  id: string;
  title: string;
  filas: readonly FilaAgrupada[];
  medida: "total" | "oportunidad";
  tema: AreaThemeKey;
  porArea?: boolean;
}) {
  const barras: BarraDato[] = filas.slice(0, TOPE_RANKING).map((fila) => ({
    nombre: porArea ? areaDisplayName(fila.nombre) : fila.nombre,
    valor: fila[medida],
    area: porArea ? areaThemeKey(fila.nombre) : undefined,
  }));
  return (
    <TarjetaGrafico
      id={id}
      title={title}
      note={nota(filas)}
      chart={<BarrasHorizontales label={title} filas={barras} formato={medida === "total" ? "entero" : "porcentaje"} tema={tema} />}
      table={<TablaDatos caption={title} rows={filas} columns={COLUMNAS_GRUPO} rowKey={(f) => f.id ?? f.nombre} />}
    />
  );
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const employee = await requireCurrentEmployee("/indicadores");
  const { vista, filtros } = parseIndicadoresParams(await searchParams);
  const panel = await getPanelIndicadores(employee.idPersonal, filtros);
  if (!panel) notFound();

  // El área del color: la destino filtrada o, sin filtro, la de quien entra.
  // `AppFrame` vuelve a leer la de quien entra para el marco; es una lectura
  // por clave primaria, y pasarla de vuelta acoplaría el marco a esta vista.
  const areaFiltrada = panel.opciones.areas.find((area) => area.id === filtros.areaDestino)?.nombre;
  const areaTema = areaFiltrada ?? (await getPersonAreaName(employee.idPersonal));
  const tema = areaThemeKey(areaTema);

  const { resumen, mensual } = panel;
  const tabs = VISTAS.map((item) => ({ label: item.label, href: indicadoresHref(item.vista, filtros), current: item.vista === vista }));

  return (
    <AppFrame
      employee={employee}
      title="Indicadores"
      themeAreaName={areaFiltrada}
      hero={({ areaName }) => (
        <AreaHero
          areaName={areaName ? areaDisplayName(areaName) : null}
          title="Indicadores"
          summary="Tickets radicados en PowerApps, por fecha de solicitud. La oportunidad sigue la escala del Power BI, en días calendario."
          stats={cifras(resumen)}
        />
      )}
    >
      <div className="space-y-4">
        <FiltrosIndicadores vista={vista} filtros={filtros} opciones={panel.opciones} />
        <TabLinks label="Vistas del panel" items={tabs} />

        {resumen.total === 0 ? (
          <EmptyState title="Sin tickets">Ningún ticket coincide con estos filtros.</EmptyState>
        ) : (
          <>
            {vista === "volumen" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <Ranking id="area-destino" title="Tickets por área destino" filas={panel.porAreaDestino} medida="total" tema={tema} porArea />
                <Ranking id="area-remite" title="Tickets por área que remite" filas={panel.porAreaRemite} medida="total" tema={tema} porArea />
                <Ranking id="responsable" title="Tickets por responsable" filas={panel.porResponsable} medida="total" tema={tema} />
                <Ranking id="solicitante" title="Tickets por solicitante" filas={panel.porSolicitante} medida="total" tema={tema} />
                <div className="xl:col-span-2">
                  <TarjetaGrafico
                    id="mes"
                    title="Tickets por mes"
                    chart={
                      <SerieMensual
                        label="Tickets por mes"
                        filas={mensual.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.total }))}
                        formato="entero"
                        tema={tema}
                      />
                    }
                    table={<TablaDatos caption="Tickets por mes" rows={mensual} columns={COLUMNAS_MES} rowKey={(f) => `${f.anio}-${f.mes}`} />}
                  />
                </div>
              </div>
            )}

            {vista === "oportunidad" && (
              <div className="grid gap-4 xl:grid-cols-2">
                <Ranking id="oportunidad-area" title="Oportunidad por área destino" filas={panel.porAreaDestino} medida="oportunidad" tema={tema} porArea />
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
                    chart={
                      <SerieMensual
                        label="Oportunidad por mes"
                        filas={mensual.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.oportunidad }))}
                        formato="porcentaje"
                        tema={tema}
                      />
                    }
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
                  chart={
                    <SerieMensual
                      label="Calidad por mes"
                      filas={mensual.map((f) => ({ anio: f.anio, mes: f.mes, valor: f.calidad }))}
                      formato="calificacion"
                      tema={tema}
                    />
                  }
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
