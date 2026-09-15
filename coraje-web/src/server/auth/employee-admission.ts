import { prisma } from "@/lib/prisma";
import type { RolAplicacion } from "@/generated/prisma/client";
import type { EntraIdTokenClaims } from "./entra-oidc";

/**
 * Admisión contra el directorio interno (specs/acceso-empleados.md §7): la
 * puerta que importa. Superar la autenticación contra el tenant prueba que
 * la persona trabaja en el grupo, no que trabaja en la mesa de ayuda — el
 * directorio (`core.dim_personal`) es la lista de admitidos, y no hay rama
 * que admita por defecto.
 */

export interface VerifiedEmployeeIdentity {
  subject: string;
  email: string;
}

function resolveExpectedTenantId(): string {
  const tenantId = process.env.ENTRA_TENANT_ID;
  if (!tenantId) {
    throw new Error("ENTRA_TENANT_ID no configurada.");
  }
  return tenantId;
}

/**
 * Deliberadamente separado de `validateIdToken` (entra-oidc.ts): el chequeo
 * de tenant vive junto a la construcción de identidad para que no se pueda
 * saltar llamando directo a la validación de firma.
 */
export function buildVerifiedIdentity(
  claims: EntraIdTokenClaims,
): VerifiedEmployeeIdentity {
  if (claims.tid !== resolveExpectedTenantId()) {
    throw new Error("El id_token no pertenece al tenant corporativo esperado.");
  }

  const subject = claims.oid ?? claims.sub;
  const email = (claims.preferred_username ?? claims.email ?? "")
    .trim()
    .toLowerCase();

  return { subject, email };
}

export type EmployeeAdmissionRejection =
  | "EMAIL_INVALID"
  | "NOT_REGISTERED"
  | "INACTIVE"
  | "UNKNOWN_ROLE";

export interface AdmittedEmployee {
  idPersonal: string;
  nombreCompleto: string;
  rolAplicacion: RolAplicacion;
}

export type EmployeeAdmission =
  | { allowed: true; employee: AdmittedEmployee }
  | { allowed: false; reason: EmployeeAdmissionRejection };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DirectoryAdmissionRow {
  idPersonal: string;
  nombreCompleto: string;
  estadoActivo: boolean;
  rolAplicacion: RolAplicacion | null;
}

/**
 * Reglas puras de admisión sobre una fila ya localizada. Reutilizada tanto
 * por el login (búsqueda por sujeto/correo) como por la relectura de sesión
 * en cada petición (búsqueda directa por id_personal) — una sola definición
 * de "quién puede entrar", nunca dos que puedan divergir. Exportada (sin
 * I/O) para poder probar las cuatro causas de rechazo sin una base de datos
 * real.
 */
export function evaluateAdmissionRules(
  row: DirectoryAdmissionRow | null,
): EmployeeAdmission {
  if (!row) {
    return { allowed: false, reason: "NOT_REGISTERED" };
  }

  // La ausencia de estado no admite: la regla es positiva, el directorio
  // tiene que afirmar que la persona está activa.
  if (row.estadoActivo !== true) {
    return { allowed: false, reason: "INACTIVE" };
  }

  if (!row.rolAplicacion) {
    return { allowed: false, reason: "UNKNOWN_ROLE" };
  }

  return {
    allowed: true,
    employee: {
      idPersonal: row.idPersonal,
      nombreCompleto: row.nombreCompleto,
      rolAplicacion: row.rolAplicacion,
    },
  };
}

async function findDirectoryRow(identity: VerifiedEmployeeIdentity) {
  const bySubject = await prisma.dimPersonal.findUnique({
    where: { entraObjectId: identity.subject },
  });
  if (bySubject) return bySubject;

  if (!identity.email) return null;

  // El correo es solo el arranque del primer ingreso federado: una vez que
  // la fila tiene sujeto enlazado, se busca exclusivamente por sujeto. El
  // índice único parcial `ux_dim_personal_correo_activo` garantiza que esta
  // búsqueda no sea ambigua entre filas activas.
  return prisma.dimPersonal.findFirst({
    where: {
      correoCorporativo: identity.email,
      entraObjectId: null,
      estadoActivo: true,
    },
  });
}

export async function evaluateDirectoryAdmission(
  identity: VerifiedEmployeeIdentity,
): Promise<EmployeeAdmission> {
  if (!identity.email || !EMAIL_PATTERN.test(identity.email)) {
    return { allowed: false, reason: "EMAIL_INVALID" };
  }

  const row = await findDirectoryRow(identity);
  return evaluateAdmissionRules(row);
}

/**
 * Relee el directorio por clave primaria: usada en cada lectura de sesión
 * (specs/acceso-empleados.md §6, INVARIANTE) para que desactivar a una
 * persona o quitarle el rol surta efecto en su siguiente navegación, no en
 * su siguiente ingreso.
 */
export async function reevaluateAdmissionByPersonalId(
  idPersonal: string,
): Promise<EmployeeAdmission> {
  const row = await prisma.dimPersonal.findUnique({ where: { idPersonal } });
  return evaluateAdmissionRules(row);
}
