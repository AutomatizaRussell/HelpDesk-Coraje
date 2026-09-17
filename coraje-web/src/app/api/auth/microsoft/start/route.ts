import { NextRequest, NextResponse } from "next/server";

import { APP_BASE_PATH } from "@/server/auth/base-path";
import { createAuthorizationRequest } from "@/server/auth/entra-oidc";
import { STATE_COOKIE_NAME, type SealedOidcState } from "@/server/auth/oidc-state";
import { sanitizeDestination } from "@/server/auth/sanitize-destination";
import { sealSecret } from "@/server/security/secret-box";

/**
 * Inicio del ingreso OIDC (specs/acceso-empleados.md §5, pasos 1-2). Soporta
 * dos modos: silencioso (`prompt=none`, para el caso ordinario de "ningún
 * clic" cuando ya hay sesión de Entra ID viva) y explícito (fallback, tras
 * un intento silencioso rechazado).
 */

const SILENT_ATTEMPT_COOKIE_NAME = "helpdesk_oidc_silent_attempted";
const STATE_TTL_SECONDS = 10 * 60;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destino = sanitizeDestination(url.searchParams.get("destino"));

  const alreadyAttemptedSilent =
    request.cookies.get(SILENT_ATTEMPT_COOKIE_NAME)?.value === "1";
  const forceExplicit = url.searchParams.get("silent") === "0";
  const silent = !forceExplicit && !alreadyAttemptedSilent;

  const authorizationRequest = createAuthorizationRequest({ silent });

  const sealedState: SealedOidcState = {
    state: authorizationRequest.state,
    nonce: authorizationRequest.nonce,
    codeVerifier: authorizationRequest.codeVerifier,
    destino,
    silent,
  };

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.redirect(authorizationRequest.url);

  // Acotada a APP_BASE_PATH, no a "/": HelpDesk comparte dominio con Conecta
  // (D7), y esta cookie no debe viajar en peticiones a rutas que no son suyas.
  response.cookies.set(STATE_COOKIE_NAME, sealSecret(JSON.stringify(sealedState)), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: APP_BASE_PATH,
    maxAge: STATE_TTL_SECONDS,
  });

  if (silent) {
    // Marca de un solo uso: sin ella, un proveedor que responda
    // login_required de forma persistente produce un bucle de redirección
    // infinito (specs/acceso-empleados.md §4, INVARIANTE).
    response.cookies.set(SILENT_ATTEMPT_COOKIE_NAME, "1", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: APP_BASE_PATH,
      maxAge: STATE_TTL_SECONDS,
    });
  } else {
    // El path debe coincidir con el usado al crearla, o el navegador la trata
    // como una cookie distinta y nunca borra la original.
    response.cookies.delete({ name: SILENT_ATTEMPT_COOKIE_NAME, path: APP_BASE_PATH });
  }

  return response;
}
