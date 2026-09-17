import { cookies } from "next/headers";

import { APP_BASE_PATH } from "@/server/auth/base-path";
import { prisma } from "@/lib/prisma";
import {
  createOpaqueCredential,
  hashOpaqueCredential,
} from "@/server/security/opaque-credential";

import {
  buildVerifiedIdentity,
  evaluateDirectoryAdmission,
  reevaluateAdmissionByPersonalId,
  type EmployeeAdmissionRejection,
} from "./employee-admission";
import type { EntraIdTokenClaims } from "./entra-oidc";

/**
 * Sesión propia opaca (specs/acceso-empleados.md §6): el navegador guarda
 * una credencial aleatoria y nada más. PostgreSQL guarda su hash, a quién
 * pertenece, qué proveedor afirmó la identidad y cuándo muere.
 */

export const SESSION_COOKIE_NAME = "helpdesk_employee_session";

// Vida absoluta de una jornada, sin renovación deslizante — una sesión que
// se renueva sola no vence nunca.
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

// Renderizar una página no debe costar una escritura en cada petición.
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type IssueSessionResult =
  | { admitted: true; token: string }
  | { admitted: false; reason: EmployeeAdmissionRejection };

/**
 * Única función que crea filas de sesión. La transacción admite primero —si
 * rechaza, no toca la base— y enlaza el sujeto inmutable solo si la fila
 * todavía no tiene ninguno.
 */
export async function issueEmployeeSession(params: {
  claims: EntraIdTokenClaims;
  userAgent?: string;
}): Promise<IssueSessionResult> {
  const identity = buildVerifiedIdentity(params.claims);
  const admission = await evaluateDirectoryAdmission(identity);

  if (!admission.allowed) {
    return { admitted: false, reason: admission.reason };
  }

  const token = createOpaqueCredential();
  const tokenHash = hashOpaqueCredential(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.$transaction(async (tx) => {
    // El enlace del sujeto inmutable se escribe solo si la fila no tiene
    // ninguno todavía: nunca se sobrescribe uno existente desde una
    // petición (specs/acceso-empleados.md §7, V4) — es lo que impide que una
    // cuenta renombrada o recreada en el tenant capture en silencio el
    // historial de otra persona.
    await tx.dimPersonal.updateMany({
      where: { idPersonal: admission.employee.idPersonal, entraObjectId: null },
      data: { entraObjectId: identity.subject },
    });

    await tx.employeeSession.create({
      data: {
        idPersonal: admission.employee.idPersonal,
        tokenHash,
        identitySubject: identity.subject,
        identityTenantId: params.claims.tid,
        expiresAt,
        // Recortado al límite de la columna (VARCHAR(400)): un user-agent
        // más largo no debe tumbar la emisión de sesión.
        userAgent: params.userAgent?.slice(0, 400),
      },
    });
  });

  return { admitted: true, token };
}

export interface EmployeeSessionContext {
  idPersonal: string;
  nombreCompleto: string;
  rolAplicacion: string;
}

/**
 * Lee la sesión de la cookie actual. Relee el directorio y reevalúa las
 * mismas reglas de admisión que se aplicaron al entrar (INVARIANTE, §6): una
 * sesión no puede sobrevivir a las condiciones que la justificaron.
 */
export async function readEmployeeSession(): Promise<EmployeeSessionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashOpaqueCredential(token);
  const session = await prisma.employeeSession.findUnique({
    where: { tokenHash },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  const admission = await reevaluateAdmissionByPersonalId(session.idPersonal);
  if (!admission.allowed) {
    return null;
  }

  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.employeeSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(now) },
    });
  }

  return {
    idPersonal: admission.employee.idPersonal,
    nombreCompleto: admission.employee.nombreCompleto,
    rolAplicacion: admission.employee.rolAplicacion,
  };
}

/**
 * Revoca la sesión actual: una fila se mata en servidor, ya, sin esperar a
 * que caduque nada en el navegador.
 */
export async function revokeCurrentEmployeeSession(
  reason: string,
): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const tokenHash = hashOpaqueCredential(token);
    await prisma.employeeSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  cookieStore.delete({ name: SESSION_COOKIE_NAME, path: APP_BASE_PATH });
}
