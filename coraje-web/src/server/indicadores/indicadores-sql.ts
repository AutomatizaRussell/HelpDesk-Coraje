import { Prisma } from "@/generated/prisma/client";

import type { IndicadoresFiltros } from "./indicadores-filters";

/**
 * SQL del panel de indicadores (U39, specs/indicadores.md), separado de su
 * ejecución (`indicadores-queries.ts`) para poder correrlo tal cual contra un
 * PostgreSQL desechable: este módulo no abre conexiones ni consulta permisos.
 *
 * Todas las consultas leen `helpdesk.v_indicador_ticket`, que ya trae por
 * ticket la categoría y el peso de oportunidad del Power BI. Aquí solo se
 * agrega: la base agrupa y promedia, la aplicación recibe filas cortas
 * (CLAUDE.md, economía de recursos). Los valores de los filtros viajan siempre
 * como parámetros, nunca concatenados.
 *
 * Universo común (indicadores.md §4): tickets con área destino. El DAX solo
 * lo exigía para el total; aquí lo cumplen las tres cifras de la tarjeta,
 * para que respondidos más sin respuesta den el total.
 */

/**
 * Origen que lee el panel mientras PowerApps siga en uso: así es comparable
 * con el Power BI (indicadores.md §2). Al apagar PowerApps se cambia este
 * valor por el de los tickets de HelpDesk.
 */
export const ORIGEN_INDICADORES = "SHAREPOINT_LEGACY";

/** Cuántos tickets lista la vista de detalle: los más recientes. */
export const LIMITE_TICKETS = 200;

/**
 * Condiciones sobre `v` (la vista). U40 añadirá aquí la visibilidad por
 * nivel, y ninguna consulta de abajo tendrá que cambiar.
 */
export function universo(filtros: IndicadoresFiltros): Prisma.Sql {
  const conds: Prisma.Sql[] = [
    Prisma.sql`v.origen_sistema = ${ORIGEN_INDICADORES}`,
    Prisma.sql`v.id_area_destino IS NOT NULL`,
  ];
  if (filtros.anio !== null) conds.push(Prisma.sql`v.anio = ${filtros.anio}`);
  if (filtros.mes !== null) conds.push(Prisma.sql`v.mes = ${filtros.mes}`);
  if (filtros.areaDestino) conds.push(Prisma.sql`v.id_area_destino = ${filtros.areaDestino}::uuid`);
  if (filtros.areaRemite) conds.push(Prisma.sql`v.id_area_remite = ${filtros.areaRemite}::uuid`);
  if (filtros.estado) conds.push(Prisma.sql`v.id_estado = ${filtros.estado}::uuid`);
  if (filtros.tipoReq) conds.push(Prisma.sql`v.id_tipo_req = ${filtros.tipoReq}::uuid`);
  if (filtros.responsable) conds.push(Prisma.sql`v.id_asignado = ${filtros.responsable}::uuid`);
  return Prisma.join(conds, " AND ");
}

/** Conteo y promedios de toda agrupación, convertidos a tipos que JS lee sin `Decimal`. */
const MEDIDAS = Prisma.sql`
  count(*)::int AS total,
  avg(v.porcentaje_oportunidad)::float8 AS oportunidad,
  avg(v.calificacion)::float8 AS calidad`;

function agrupado(where: Prisma.Sql, id: Prisma.Sql, nombre: Prisma.Sql, join: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    SELECT ${id}::text AS id, ${nombre} AS nombre, ${MEDIDAS}
    FROM helpdesk.v_indicador_ticket v
    ${join}
    WHERE ${where}
    GROUP BY 1, 2
    ORDER BY total DESC, nombre`;
}

/** Las consultas del panel para unos filtros, por nombre. */
export function consultasPanel(filtros: IndicadoresFiltros) {
  const where = universo(filtros);
  return {
    resumen: Prisma.sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE v.respondido)::int AS "respondidos",
             count(*) FILTER (WHERE NOT v.respondido)::int AS "sinRespuesta",
             avg(v.porcentaje_oportunidad)::float8 AS oportunidad,
             avg(v.calificacion)::float8 AS calidad
      FROM helpdesk.v_indicador_ticket v
      WHERE ${where}`,
    porAreaDestino: agrupado(where, Prisma.sql`v.id_area_destino`, Prisma.sql`ad.nombre_area`,
      Prisma.sql`JOIN core.dim_area ad ON ad.id_area = v.id_area_destino`),
    porAreaRemite: agrupado(where, Prisma.sql`v.id_area_remite`, Prisma.sql`COALESCE(ar.nombre_area, 'Sin área que remite')`,
      Prisma.sql`LEFT JOIN core.dim_area ar ON ar.id_area = v.id_area_remite`),
    porResponsable: agrupado(where, Prisma.sql`v.id_asignado`, Prisma.sql`COALESCE(pa.nombre_completo, 'Sin responsable')`,
      Prisma.sql`LEFT JOIN core.dim_personal pa ON pa.id_personal = v.id_asignado`),
    // Un ticket legacy de cliente no tiene solicitante (U21): se agrupa aparte,
    // nombrado, en vez de desaparecer del gráfico.
    porSolicitante: agrupado(where, Prisma.sql`v.id_solicitante`, Prisma.sql`COALESCE(ps.nombre_completo, 'Ticket de cliente')`,
      Prisma.sql`LEFT JOIN core.dim_personal ps ON ps.id_personal = v.id_solicitante`),
    categoriasPorArea: Prisma.sql`
      SELECT ad.nombre_area AS area, v.categoria_oportunidad AS categoria, count(*)::int AS total
      FROM helpdesk.v_indicador_ticket v
      JOIN core.dim_area ad ON ad.id_area = v.id_area_destino
      WHERE ${where}
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    mensual: Prisma.sql`
      SELECT v.anio, v.mes, ${MEDIDAS}
      FROM helpdesk.v_indicador_ticket v
      WHERE ${where}
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    // Fechas como texto ISO: un DATE no tiene zona y no debe ganarla en el driver.
    tickets: Prisma.sql`
      SELECT v.id_ticket::text AS "idTicket", v.codigo_ticket AS codigo, v.legacy_id_req AS "idLegacy",
             v.fecha_solicitud::text AS "fechaSolicitud", v.fecha_max_respuesta::text AS "fechaMaxRespuesta",
             v.fecha_respuesta::text AS "fechaRespuesta", ad.nombre_area AS "areaDestino",
             ar.nombre_area AS "areaRemite", v.nombre_prioridad AS prioridad,
             pa.nombre_completo AS responsable, v.categoria_oportunidad AS categoria,
             v.dias_respuesta AS "diasRespuesta", v.calificacion
      FROM helpdesk.v_indicador_ticket v
      JOIN core.dim_area ad ON ad.id_area = v.id_area_destino
      LEFT JOIN core.dim_area ar ON ar.id_area = v.id_area_remite
      LEFT JOIN core.dim_personal pa ON pa.id_personal = v.id_asignado
      WHERE ${where}
      ORDER BY v.fecha_solicitud DESC, v.codigo_ticket DESC
      LIMIT ${LIMITE_TICKETS}`,
  };
}

/**
 * Valores que ofrece cada filtro: solo los que aparecen en el origen leído,
 * para que ninguna opción lleve a un panel vacío por construcción. No
 * dependen de los demás filtros: elegir un área no esconde los meses.
 */
export function consultasOpciones() {
  const base = Prisma.sql`v.origen_sistema = ${ORIGEN_INDICADORES} AND v.id_area_destino IS NOT NULL`;
  return {
    anios: Prisma.sql`
      SELECT DISTINCT v.anio FROM helpdesk.v_indicador_ticket v WHERE ${base} ORDER BY 1 DESC`,
    areas: Prisma.sql`
      SELECT a.id_area::text AS id, a.nombre_area AS nombre
      FROM core.dim_area a
      WHERE EXISTS (SELECT 1 FROM helpdesk.v_indicador_ticket v
                    WHERE ${base} AND (v.id_area_destino = a.id_area OR v.id_area_remite = a.id_area))
      ORDER BY 2`,
    estados: Prisma.sql`
      SELECT DISTINCT v.id_estado::text AS id, v.nombre_estado AS nombre
      FROM helpdesk.v_indicador_ticket v WHERE ${base} ORDER BY 2`,
    tipos: Prisma.sql`
      SELECT DISTINCT t.id_tipo_req::text AS id,
             concat_ws(' · ', a.nombre_area, t.tipo_requerimiento, t.categoria_1, t.categoria_2) AS nombre
      FROM helpdesk.v_indicador_ticket v
      JOIN helpdesk.dim_tipo_requerimiento t ON t.id_tipo_req = v.id_tipo_req
      JOIN core.dim_area a ON a.id_area = t.id_area
      WHERE ${base} ORDER BY 2`,
    responsables: Prisma.sql`
      SELECT DISTINCT p.id_personal::text AS id, p.nombre_completo AS nombre
      FROM helpdesk.v_indicador_ticket v
      JOIN core.dim_personal p ON p.id_personal = v.id_asignado
      WHERE ${base} ORDER BY 2`,
  };
}
