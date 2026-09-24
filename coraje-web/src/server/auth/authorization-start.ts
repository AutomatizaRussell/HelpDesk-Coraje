import { NextResponse } from "next/server";

import { APP_BASE_PATH } from "./base-path";
import { createAuthorizationRequest, type AuthorizationMode } from "./entra-oidc";
import type { ConectaProfile } from "./entry-context";
import { STATE_COOKIE_NAME, type SealedOidcState } from "./oidc-state";
import { sealSecret } from "@/server/security/secret-box";

/**
 * Arranque del flujo OIDC hacia Entra ID (specs/acceso-empleados.md §5,
 * pasos 1-2), compartido por las tres puertas que lo disparan:
 *
 * - `POST /api/auth/microsoft/start` desde `/ingreso`, con sesión de Conecta:
 *   modo `silent` con la cuenta de Conecta como pista.
 * - `GET /api/auth/microsoft/start?silent=0` desde el botón de `/login`:
 *   modo `select`.
 * - El callback, cuando Entra rechaza un silencioso: modo `hinted`, que
 *   conserva la pista y el perfil de Conecta sin volver a pasar por el
 *   navegador.
 *
 * Una sola función para que el sellado del estado, las cookies y la marca
 * anti-bucle no se puedan escribir de tres maneras distintas.
 */

export const SILENT_ATTEMPT_COOKIE_NAME = "helpdesk_oidc_silent_attempted";
const STATE_TTL_SECONDS = 10 * 60;

export function beginAuthorization(options: {
  destino: string;
  mode: AuthorizationMode;
  via: "conecta" | "directo";
  loginHint?: string | null;
  conectaProfile?: ConectaProfile | null;
}): NextResponse {
  const authorizationRequest = createAuthorizationRequest({
    mode: options.mode,
    loginHint: options.loginHint,
  });

  const sealedState: SealedOidcState = {
    state: authorizationRequest.state,
    nonce: authorizationRequest.nonce,
    codeVerifier: authorizationRequest.codeVerifier,
    destino: options.destino,
    silent: options.mode === "silent",
    via: options.via,
    conectaProfile: options.conectaProfile ?? null,
  };

  // 303 y no 307: la puerta de `/ingreso` es un POST, y un 307 le pediría al
  // navegador repetir ese POST —con el perfil en el cuerpo— contra Microsoft.
  // 303 lo convierte en un GET limpio, que es lo que espera /authorize.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: authorizationRequest.url },
  });

  const isProduction = process.env.NODE_ENV === "production";

  // Acotada a APP_BASE_PATH, no a "/": HelpDesk comparte dominio con Conecta
  // (D7), y esta cookie no debe viajar en peticiones a rutas que no son suyas.
  response.cookies.set(STATE_COOKIE_NAME, sealSecret(JSON.stringify(sealedState)), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: APP_BASE_PATH,
    maxAge: STATE_TTL_SECONDS,
  });

  if (options.mode === "silent") {
    // Marca de un solo uso: sin ella, un proveedor que responda
    // login_required de forma persistente podría producir un bucle de
    // redirección (specs/acceso-empleados.md §4, INVARIANTE).
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
