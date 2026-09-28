import { prisma } from "@/lib/prisma";
import { AuthorizationDeniedError, requireGrant } from "@/server/authorization/authorizer";
import { SALUD_ACTIONS } from "@/server/authorization/catalog";
import { logEvent } from "@/server/observability/log";

/**
 * Acciones de la vista `/salud` (U10). Hoy, una: marcar revisada una
 * divergencia rechazada con PowerApps. Es el «clasificada» del cierre de U10:
 * deja de contar en S4 y queda quién la atendió, cuándo y por qué.
 */

export class HealthActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthActionError";
  }
}

export function isHealthActionError(error: unknown): error is HealthActionError {
  return error instanceof HealthActionError;
}

/**
 * Exige `salud.divergencia.revisar` y delega en
 * `helpdesk.marcar_divergencia_revisada`, que garantiza lo que no depende del
 * rol: solo rechazadas, una sola vez, con motivo, por una persona activa.
 * `coraje_runtime` no tiene `UPDATE` sobre la tabla: no hay otro camino.
 */
export async function markDivergenceReviewed(params: { idPersonal: string; idDivergencia: string; motivo: string }): Promise<void> {
  try {
    await requireGrant(params.idPersonal, SALUD_ACTIONS.revisarDivergencia);
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) {
      logEvent("warn", "salud.revision_denegada", { idPersonal: params.idPersonal, motivo: error.reason });
      throw new HealthActionError("No tienes permiso para revisar divergencias.");
    }
    throw error;
  }

  const rows = await prisma.$queryRaw<{ marcada: boolean }[]>`
    SELECT helpdesk.marcar_divergencia_revisada(
        ${params.idDivergencia}::uuid,
        ${params.idPersonal}::uuid,
        ${params.motivo}
    ) AS marcada
  `;
  if (!rows[0]?.marcada) {
    throw new HealthActionError("Esta divergencia ya estaba revisada o ya no está pendiente. Recarga la página.");
  }
  logEvent("info", "salud.divergencia_revisada", { idPersonal: params.idPersonal, idDivergencia: params.idDivergencia });
}
