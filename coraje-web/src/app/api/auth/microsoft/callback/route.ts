import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { redirectWithinApp } from "@/server/auth/app-redirect";
import { beginAuthorization } from "@/server/auth/authorization-start";
import { APP_BASE_PATH } from "@/server/auth/base-path";
import {
  exchangeAuthorizationCode,
  validateIdToken,
} from "@/server/auth/entra-oidc";
import {
  issueEmployeeSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/server/auth/employee-session";
import { bindProfileToIdentity, type EntryContext } from "@/server/auth/entry-context";
import { ENTRY_COOKIE_NAME, sealEntryContext } from "@/server/auth/entry-cookie";
import { sanitizeLoginHint } from "@/server/auth/login-hint";
import { STATE_COOKIE_NAME, type SealedOidcState } from "@/server/auth/oidc-state";
import { sanitizeDestination } from "@/server/auth/sanitize-destination";
import { openSecret } from "@/server/security/secret-box";

/**
 * Retorno del proveedor (specs/acceso-empleados.md §5, pasos 3-7). Cada paso
 * es una puerta de la que depende el siguiente: state → intercambio →
 * validación del id_token → admisión → sesión.
 */

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function redirectToLogin(error: string) {
  const response = redirectWithinApp("/login", { error });
  response.cookies.delete({ name: STATE_COOKIE_NAME, path: APP_BASE_PATH });
  return response;
}

/**
 * Reintento tras un silencioso rechazado, sin volver a pasar por el navegador:
 * quien entró desde Conecta conserva su cuenta como pista (modo `hinted`), y
 * quien no, elige cuenta (`select`). `beginAuthorization` reemplaza la cookie
 * de estado por una nueva.
 */
function retryInteractively(state: SealedOidcState) {
  const via = state.via ?? "directo";
  const profile = via === "conecta" ? (state.conectaProfile ?? null) : null;
  return beginAuthorization({
    destino: state.destino,
    mode: profile ? "hinted" : "select",
    via,
    loginHint: profile?.email,
    conectaProfile: profile,
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const sealedStateCookie = request.cookies.get(STATE_COOKIE_NAME)?.value;
  if (!sealedStateCookie) {
    return redirectToLogin("STATE_MISSING");
  }

  let state: SealedOidcState;
  try {
    state = JSON.parse(openSecret(sealedStateCookie)) as SealedOidcState;
  } catch {
    return redirectToLogin("STATE_INVALID");
  }

  // Intento silencioso que Entra rechazó (login_required/interaction_required):
  // reintentar una sola vez en modo interactivo, nunca en bucle — el reintento
  // ya no es silencioso, así que no puede volver a caer aquí.
  if (providerError && state.silent) {
    return retryInteractively(state);
  }

  if (providerError || !code || !returnedState) {
    return redirectToLogin("PROVIDER_ERROR");
  }

  if (!constantTimeEquals(returnedState, state.state)) {
    return redirectToLogin("STATE_MISMATCH");
  }

  try {
    const tokenSet = await exchangeAuthorizationCode({
      code,
      codeVerifier: state.codeVerifier,
    });
    const claims = await validateIdToken({
      idToken: tokenSet.idToken,
      expectedNonce: state.nonce,
    });
    const result = await issueEmployeeSession({
      claims,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    if (!result.admitted) {
      return redirectToLogin(result.reason);
    }

    // Se sanea de nuevo aquí, no solo al sellar en /start: el sellado prueba
    // que este servidor escribió el valor, no que era seguro cuando lo hizo
    // (specs/acceso-empleados.md §5, paso 2 — defensa en profundidad, no
    // redundancia decorativa).
    const successResponse = redirectWithinApp(sanitizeDestination(state.destino));
    successResponse.cookies.delete({ name: STATE_COOKIE_NAME, path: APP_BASE_PATH });
    successResponse.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: APP_BASE_PATH,
      maxAge: SESSION_TTL_SECONDS,
    });

    // Contexto de entrada (entry-context.ts): fija el shell de la sesión. El
    // perfil de Conecta solo se conserva si es de la persona recién admitida
    // —mismo claim con el que la admisión la buscó en el directorio—; en un
    // navegador compartido, el de otra persona se descarta (regla 2).
    const admittedEmail = sanitizeLoginHint(claims.preferred_username ?? claims.email);
    const entry: EntryContext =
      state.via === "conecta"
        ? { via: "conecta", profile: bindProfileToIdentity(state.conectaProfile, admittedEmail) }
        : { via: "directo" };
    successResponse.cookies.set(ENTRY_COOKIE_NAME, sealEntryContext(entry), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: APP_BASE_PATH,
      maxAge: SESSION_TTL_SECONDS,
    });
    return successResponse;
  } catch (error) {
    // Fallo de red o de validación contra Entra ID: nunca se expone el
    // detalle interno en la URL (specs/acceso-empleados.md §8) — solo un
    // código de un enum cerrado que /login interpreta. El detalle real sí
    // queda en los logs del servidor para poder diagnosticarlo.
    console.error("Fallo al validar el ingreso con Microsoft:", error);
    return redirectToLogin("VALIDATION_FAILED");
  }
}
