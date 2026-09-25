import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import type { TicketAction } from "./catalog";
import { isTicketWithinScope, type Alcance, type ScopeActor, type ScopeTicket } from "./scope";

/**
 * Autorizador ejecutable (specs/permisos.md §1, §2, §4).
 *
 * Responde dos preguntas por separado, porque la segunda es la que se olvida:
 * 1. ¿Tiene la persona la acción? → la regla de su rol en `app.permiso_regla`.
 * 2. ¿Sobre este ticket? → el alcance de esa regla, evaluado en `scope.ts`.
 *
 * El rol se usa **solo** para elegir la fila de regla. Ningún otro código lo
 * compara: si una vista necesita saber si puede mostrar un botón, pregunta
 * aquí por la acción, igual que el servicio que ejecuta la acción.
 *
 * Diferencia con Impulsa, a propósito: su autorizador siembra el catálogo en
 * tiempo de ejecución (`ensurePermissionCatalogSynced`, un upsert por proceso)
 * y otorga a ADMIN el acceso a cualquier cliente comparando el rol dentro del
 * propio autorizador. Aquí el catálogo lo siembra la migración, así que no hay
 * escritura en la primera petición, y el alcance total es una regla
 * (`TOTAL`), no una comparación de rol.
 */

/** Cliente de base: el global o el de una transacción en curso. */
type Db = Prisma.TransactionClient | typeof prisma;

export interface ActorGrant {
  actor: ScopeActor;
  alcance: Alcance;
}

/**
 * Motivos cerrados de denegación. No se muestran tal cual a la persona: la
 * vista traduce, y el registro del servidor conserva el motivo exacto.
 * `SIN_REGLA` cubre también a quien no tiene rol o está inactivo: para la
 * acción es lo mismo, no hay regla que la conceda.
 */
export type DenialReason = "SIN_REGLA" | "FUERA_DE_ALCANCE";

export class AuthorizationDeniedError extends Error {
  readonly action: TicketAction;
  readonly reason: DenialReason;

  constructor(action: TicketAction, reason: DenialReason) {
    super(`No autorizado: ${action} (${reason}).`);
    this.name = "AuthorizationDeniedError";
    this.action = action;
    this.reason = reason;
  }
}

/**
 * La regla vigente de la persona para una acción, o `null` si no la tiene.
 *
 * Relee el directorio en cada llamada: quitarle el rol a alguien surte efecto
 * en su siguiente acción, igual que en la relectura de sesión
 * (specs/acceso-empleados.md §6). Una acción desactivada en el catálogo
 * (`activo = false`) deniega a todos los roles.
 */
export async function resolveGrant(idPersonal: string, action: TicketAction, db: Db = prisma): Promise<ActorGrant | null> {
  const persona = await db.dimPersonal.findUnique({
    where: { idPersonal },
    select: { idArea: true, rolAplicacion: true, estadoActivo: true },
  });
  if (!persona || !persona.estadoActivo || !persona.rolAplicacion) return null;

  const regla = await db.permisoRegla.findUnique({
    where: { rol_codigoAccion: { rol: persona.rolAplicacion, codigoAccion: action } },
    select: { alcance: true, accion: { select: { activo: true } } },
  });
  if (!regla || !regla.accion.activo) return null;

  return { actor: { idPersonal, idArea: persona.idArea }, alcance: regla.alcance };
}

/**
 * Varias acciones de una vez, en dos consultas en vez de dos por acción. Es
 * lo que usa una vista que decide qué botones ofrecer. Devuelve solo las
 * acciones concedidas.
 */
export async function resolveGrants(
  idPersonal: string,
  actions: readonly TicketAction[],
  db: Db = prisma,
): Promise<Map<TicketAction, ActorGrant>> {
  const granted = new Map<TicketAction, ActorGrant>();
  const persona = await db.dimPersonal.findUnique({
    where: { idPersonal },
    select: { idArea: true, rolAplicacion: true, estadoActivo: true },
  });
  if (!persona || !persona.estadoActivo || !persona.rolAplicacion) return granted;

  const reglas = await db.permisoRegla.findMany({
    where: { rol: persona.rolAplicacion, codigoAccion: { in: [...actions] }, accion: { activo: true } },
    select: { codigoAccion: true, alcance: true },
  });
  const actor: ScopeActor = { idPersonal, idArea: persona.idArea };
  for (const regla of reglas) {
    granted.set(regla.codigoAccion as TicketAction, { actor, alcance: regla.alcance });
  }
  return granted;
}

/** Exige la acción sin mirar ningún ticket (crear). */
export async function requireGrant(idPersonal: string, action: TicketAction, db: Db = prisma): Promise<ActorGrant> {
  const grant = await resolveGrant(idPersonal, action, db);
  if (!grant) throw new AuthorizationDeniedError(action, "SIN_REGLA");
  return grant;
}

/**
 * Exige la acción sobre un ticket. Los servicios lo llaman **dentro** de su
 * transacción, con la fila del ticket ya bloqueada: así nadie cambia el
 * responsable entre la comprobación y la escritura.
 */
export async function requireTicketAction(params: {
  idPersonal: string;
  action: TicketAction;
  ticket: ScopeTicket;
  db?: Db;
}): Promise<ActorGrant> {
  const grant = await resolveGrant(params.idPersonal, params.action, params.db);
  if (!grant) throw new AuthorizationDeniedError(params.action, "SIN_REGLA");
  const allowed = isTicketWithinScope({
    alcance: grant.alcance,
    action: params.action,
    actor: grant.actor,
    ticket: params.ticket,
  });
  if (!allowed) throw new AuthorizationDeniedError(params.action, "FUERA_DE_ALCANCE");
  return grant;
}
