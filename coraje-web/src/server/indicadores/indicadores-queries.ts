import { prisma } from "@/lib/prisma";
import { resolveGrant } from "@/server/authorization/authorizer";
import { INDICADORES_ACTIONS } from "@/server/authorization/catalog";

import type { IndicadoresFiltros } from "./indicadores-filters";
import { consultasOpciones, consultasPanel } from "./indicadores-sql";

export { LIMITE_TICKETS, ORIGEN_INDICADORES } from "./indicadores-sql";

/**
 * Ejecución de las consultas del panel de indicadores (U39). El SQL vive en
 * `indicadores-sql.ts`; aquí solo se exige el permiso y se corren las
 * consultas en paralelo: unas doce lecturas cortas sobre unos 3.100 tickets
 * por carga, sin caché ni proceso que la refresque.
 *
 * Autorización: `indicadores.ver`, con alcance TOTAL provisional (no se
 * filtra por persona). U40 cambiará el alcance y `universo()`, no esto.
 */

/** Categorías de oportunidad, en el orden de la escala del Power BI. */
export const CATEGORIAS_OPORTUNIDAD = ["Ticket abierto", "1.Excelente", "2.Sobresaliente", "3.Regular", "4.Deficiente"] as const;
export type CategoriaOportunidad = (typeof CATEGORIAS_OPORTUNIDAD)[number];

export interface Resumen {
  total: number;
  respondidos: number;
  sinRespuesta: number;
  /** Promedio de 0 a 1; null si ningún ticket entra en el promedio. */
  oportunidad: number | null;
  /** Promedio de la calificación (1 a 5); null sin calificaciones. */
  calidad: number | null;
}

export interface FilaAgrupada {
  id: string | null;
  nombre: string;
  total: number;
  oportunidad: number | null;
  calidad: number | null;
}

export interface FilaCategoria {
  area: string;
  categoria: CategoriaOportunidad;
  total: number;
}

export interface FilaMensual {
  anio: number;
  mes: number;
  total: number;
  oportunidad: number | null;
  calidad: number | null;
}

export interface FilaTicket {
  idTicket: string;
  codigo: string | null;
  idLegacy: string | null;
  /** Fechas de Bogotá como texto ISO (`2026-10-01`). */
  fechaSolicitud: string;
  fechaMaxRespuesta: string | null;
  fechaRespuesta: string | null;
  areaDestino: string;
  areaRemite: string | null;
  prioridad: string | null;
  responsable: string | null;
  categoria: CategoriaOportunidad;
  diasRespuesta: number | null;
  calificacion: number | null;
}

export interface Opcion {
  id: string;
  nombre: string;
}

export interface OpcionesFiltro {
  anios: number[];
  areas: Opcion[];
  estados: Opcion[];
  tipos: Opcion[];
  responsables: Opcion[];
}

export interface PanelIndicadores {
  resumen: Resumen;
  porAreaDestino: FilaAgrupada[];
  porAreaRemite: FilaAgrupada[];
  porResponsable: FilaAgrupada[];
  porSolicitante: FilaAgrupada[];
  categoriasPorArea: FilaCategoria[];
  mensual: FilaMensual[];
  tickets: FilaTicket[];
  opciones: OpcionesFiltro;
}

async function getOpciones(): Promise<OpcionesFiltro> {
  const q = consultasOpciones();
  const [anios, areas, estados, tipos, responsables] = await Promise.all([
    prisma.$queryRaw<{ anio: number }[]>(q.anios),
    prisma.$queryRaw<Opcion[]>(q.areas),
    prisma.$queryRaw<Opcion[]>(q.estados),
    prisma.$queryRaw<Opcion[]>(q.tipos),
    prisma.$queryRaw<Opcion[]>(q.responsables),
  ]);
  return { anios: anios.map((row) => row.anio), areas, estados, tipos, responsables };
}

/**
 * Todo el panel para quien consulta, o null si no tiene `indicadores.ver`:
 * la página responde entonces como si no existiera, igual que `/salud`.
 */
export async function getPanelIndicadores(idPersonal: string, filtros: IndicadoresFiltros): Promise<PanelIndicadores | null> {
  const grant = await resolveGrant(idPersonal, INDICADORES_ACTIONS.ver);
  if (!grant) return null;

  const q = consultasPanel(filtros);
  const [resumen, porAreaDestino, porAreaRemite, porResponsable, porSolicitante, categoriasPorArea, mensual, tickets, opciones] =
    await Promise.all([
      prisma.$queryRaw<Resumen[]>(q.resumen),
      prisma.$queryRaw<FilaAgrupada[]>(q.porAreaDestino),
      prisma.$queryRaw<FilaAgrupada[]>(q.porAreaRemite),
      prisma.$queryRaw<FilaAgrupada[]>(q.porResponsable),
      prisma.$queryRaw<FilaAgrupada[]>(q.porSolicitante),
      prisma.$queryRaw<FilaCategoria[]>(q.categoriasPorArea),
      prisma.$queryRaw<FilaMensual[]>(q.mensual),
      prisma.$queryRaw<FilaTicket[]>(q.tickets),
      getOpciones(),
    ]);

  return {
    resumen: resumen[0] ?? { total: 0, respondidos: 0, sinRespuesta: 0, oportunidad: null, calidad: null },
    porAreaDestino,
    porAreaRemite,
    porResponsable,
    porSolicitante,
    categoriasPorArea,
    mensual,
    tickets,
    opciones,
  };
}
