import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { NO_RECEPCION, type ScopeRecepcion } from "./scope";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Qué recibe una persona según el enrutamiento (permisos.md §4.5): los tipos
 * cuyo responsable resuelto es ella y las áreas de las que es encargada de
 * recepción.
 *
 * **La regla es la de `helpdesk.resolver_responsable_tipo`** (migración
 * `20260928110000_acceso_clientes`): `COALESCE(regla.encargado_interno,
 * area.encargado_recepcion)`, normalizado con `LOWER(BTRIM(…))`. Si una de
 * las dos cambia y la otra no, quien recibe un ticket nuevo dejaría de verlo
 * en la bandeja. `recepcion.contract.test.mts` exige que las dos contengan la
 * misma expresión.
 *
 * Se lee de las tablas y no de un rol a propósito: cambiar el encargado de un
 * área mueve también lo que ve, sin que nadie tenga que acordarse de cambiar
 * un rol. Dos consultas pequeñas sobre catálogos de pocos cientos de filas;
 * solo se hacen cuando el alcance de la regla es `AREA` (authorizer.ts).
 */
export async function loadRecepcion(correo: string | null, db: Db = prisma): Promise<ScopeRecepcion> {
  const normalized = correo?.trim().toLowerCase();
  if (!normalized) return NO_RECEPCION;

  const [tipos, areas] = await Promise.all([
    db.$queryRaw<{ id_tipo_req: string }[]>`
      SELECT tipo.id_tipo_req::text AS id_tipo_req
      FROM helpdesk.dim_tipo_requerimiento AS tipo
      JOIN core.dim_area AS area ON area.id_area = tipo.id_area
      LEFT JOIN helpdesk.routing_rule AS regla
          ON regla.id_tipo_req = tipo.id_tipo_req
         AND regla.activo
      WHERE LOWER(BTRIM(COALESCE(regla.encargado_interno, area.encargado_recepcion))) = ${normalized}
    `,
    db.$queryRaw<{ id_area: string }[]>`
      SELECT area.id_area::text AS id_area
      FROM core.dim_area AS area
      WHERE LOWER(BTRIM(area.encargado_recepcion)) = ${normalized}
    `,
  ]);

  return { idTiposReq: tipos.map((row) => row.id_tipo_req), idAreas: areas.map((row) => row.id_area) };
}
