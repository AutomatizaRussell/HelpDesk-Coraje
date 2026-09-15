import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  exchangeAuthorizationCode,
  validateIdToken,
} from "@/server/auth/entra-oidc";
import {
  issueEmployeeSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from "@/server/auth/employee-session";
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

function redirectToLogin(request: NextRequest, error: string) {
  const target = new URL("/login", request.url);
  target.searchParams.set("error", error);
  const response = NextResponse.redirect(target);
  response.cookies.delete(STATE_COOKIE_NAME);
  return response;
}

function redirectToSilentRetry(request: NextRequest, destino: string) {
  const target = new URL("/api/auth/microsoft/start", request.url);
  target.searchParams.set("destino", destino);
  target.searchParams.set("silent", "0");
  const response = NextResponse.redirect(target);
  response.cookies.delete(STATE_COOKIE_NAME);
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");

  const sealedStateCookie = request.cookies.get(STATE_COOKIE_NAME)?.value;
  if (!sealedStateCookie) {
    return redirectToLogin(request, "STATE_MISSING");
  }

  let state: SealedOidcState;
  try {
    state = JSON.parse(openSecret(sealedStateCookie)) as SealedOidcState;
  } catch {
    return redirectToLogin(request, "STATE_INVALID");
  }

  // Intento silencioso que Entra rechazó (login_required/interaction_required):
  // reintentar una sola vez en modo explícito, nunca en bucle — la marca de
  // un solo uso ya la puso /start.
  if (providerError && state.silent) {
    return redirectToSilentRetry(request, state.destino);
  }

  if (providerError || !code || !returnedState) {
    return redirectToLogin(request, "PROVIDER_ERROR");
  }

  if (!constantTimeEquals(returnedState, state.state)) {
    return redirectToLogin(request, "STATE_MISMATCH");
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
      return redirectToLogin(request, result.reason);
    }

    // Se sanea de nuevo aquí, no solo al sellar en /start: el sellado prueba
    // que este servidor escribió el valor, no que era seguro cuando lo hizo
    // (specs/acceso-empleados.md §5, paso 2 — defensa en profundidad, no
    // redundancia decorativa).
    const successResponse = NextResponse.redirect(
      new URL(sanitizeDestination(state.destino), request.url),
    );
    successResponse.cookies.delete(STATE_COOKIE_NAME);
    successResponse.cookies.set(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    return successResponse;
  } catch (error) {
    // Fallo de red o de validación contra Entra ID: nunca se expone el
    // detalle interno en la URL (specs/acceso-empleados.md §8) — solo un
    // código de un enum cerrado que /login interpreta. El detalle real sí
    // queda en los logs del servidor para poder diagnosticarlo.
    console.error("Fallo al validar el ingreso con Microsoft:", error);
    return redirectToLogin(request, "VALIDATION_FAILED");
  }
}
