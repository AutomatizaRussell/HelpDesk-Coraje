import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret } from "@/server/security/secret-box";

import { isRevokedGrantError, redeemRefreshToken } from "./entra-oidc";

/**
 * Custodia de la autorización delegada de Microsoft Graph de cada empleado
 * (D6, specs/acceso-empleados.md §9). Adaptada de `graph-grant.ts` de Impulsa.
 *
 * Existe por una sola razón: el correo de una acción del ticket sale **como la
 * persona que la hizo**, desde su buzón. Para eso hace falta un token suyo, y
 * el refresh_token del ingreso es lo que permite obtenerlo sin pedirle que
 * vuelva a entrar.
 *
 * El costo es real y se acepta a sabiendas: el envío depende de la
 * autorización de cada persona. Un cambio de contraseña o una revocación de
 * sesiones la mata, y solo un nuevo ingreso la revive. `GraphGrantUnavailableError`
 * lo dice con esas palabras, para que el correo fallido muestre qué hacer.
 */
export class GraphGrantUnavailableError extends Error {
  readonly cause_: "MISSING" | "REVOKED";

  constructor(cause: "MISSING" | "REVOKED", message: string) {
    super(message);
    this.name = "GraphGrantUnavailableError";
    this.cause_ = cause;
  }
}

/**
 * Registra la autorización obtenida al ingresar, sustituyendo la anterior.
 *
 * Un ingreso sin refresh_token (si Entra no concedió `offline_access`) deja
 * la autorización existente intacta: perder una que funciona por un ingreso
 * configurado de otra manera sería una regresión silenciosa. Tampoco se
 * guarda si Entra no concedió `Mail.Send`: sería un token que no sirve para lo
 * único que se usa.
 */
export async function recordGraphGrant(params: {
  idPersonal: string;
  refreshToken: string | null;
  grantedScope: string;
  tenantId: string;
  subject: string;
}): Promise<{ recorded: boolean }> {
  if (!params.refreshToken || !/\bMail\.Send\b/i.test(params.grantedScope)) return { recorded: false };

  const sealed = sealSecret(params.refreshToken);
  const data = {
    refreshTokenSealed: sealed,
    grantedScope: params.grantedScope.slice(0, 1000),
    identityTenantId: params.tenantId,
    identitySubject: params.subject,
    obtainedAt: new Date(),
  };
  await prisma.employeeGraphGrant.upsert({
    where: { idPersonal: params.idPersonal },
    create: { idPersonal: params.idPersonal, ...data },
    // Un ingreso nuevo borra la revocación anterior: es justo la recuperación
    // que ese estado esperaba.
    update: { ...data, lastRefreshedAt: null, revokedAt: null, revokedReason: null },
  });
  return { recorded: true };
}

/**
 * Un access_token de Graph vivo para enviar correo como esta persona.
 *
 * Entra rota los refresh_token: cada canje puede devolver uno nuevo y el
 * anterior deja de valer. Guardar el nuevo antes de devolver no es limpieza:
 * sin eso, el **siguiente** envío fallaría.
 */
export async function getGraphAccessTokenForEmployee(idPersonal: string): Promise<string> {
  const grant = await prisma.employeeGraphGrant.findUnique({
    where: { idPersonal },
    select: { id: true, refreshTokenSealed: true, revokedAt: true },
  });
  if (!grant) {
    throw new GraphGrantUnavailableError(
      "MISSING",
      "El remitente todavía no autorizó el envío de correo. Debe cerrar sesión en HelpDesk y volver a entrar.",
    );
  }
  if (grant.revokedAt) {
    throw new GraphGrantUnavailableError(
      "REVOKED",
      "La autorización de correo del remitente dejó de ser válida. Debe cerrar sesión en HelpDesk y volver a entrar.",
    );
  }

  try {
    const tokens = await redeemRefreshToken(openSecret(grant.refreshTokenSealed));
    await prisma.employeeGraphGrant.update({
      where: { id: grant.id },
      data: {
        ...(tokens.refreshToken ? { refreshTokenSealed: sealSecret(tokens.refreshToken) } : {}),
        ...(tokens.scope ? { grantedScope: tokens.scope.slice(0, 1000) } : {}),
        lastRefreshedAt: new Date(),
      },
    });
    return tokens.accessToken;
  } catch (error) {
    if (isRevokedGrantError(error)) {
      // Se marca muerta para que el próximo intento falle en el acto, sin
      // pagar otra ida a Entra para oír lo mismo.
      await prisma.employeeGraphGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date(), revokedReason: error instanceof Error ? error.message.slice(0, 300) : null },
      });
      throw new GraphGrantUnavailableError(
        "REVOKED",
        "Microsoft revocó la autorización de correo del remitente. Debe cerrar sesión en HelpDesk y volver a entrar.",
      );
    }
    throw error;
  }
}
