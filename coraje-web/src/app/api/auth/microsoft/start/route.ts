import type { NextRequest } from "next/server";

import { redirectWithinApp } from "@/server/auth/app-redirect";
import { beginAuthorization, SILENT_ATTEMPT_COOKIE_NAME } from "@/server/auth/authorization-start";
import { parseConectaProfile } from "@/server/auth/entry-context";
import { sanitizeDestination } from "@/server/auth/sanitize-destination";

/**
 * Inicio del ingreso OIDC (specs/acceso-empleados.md §5, pasos 1-2;
 * specs/integracion-conecta.md §2). Dos puertas:
 *
 * - **POST** desde `/ingreso`, que envía en el cuerpo el perfil que Conecta
 *   dejó en el navegador. Con perfil válido: ingreso silencioso con esa
 *   cuenta como pista, modo `conecta`. Sin perfil: a `/login`, modo `directo`.
 *   Va en el cuerpo y no en la URL para que el correo y el nombre no queden en
 *   los registros del proxy ni en el historial del navegador.
 * - **GET** desde el botón de `/login` (`?silent=0`): selector de cuenta
 *   obligatorio, modo `directo`. Cualquier otro GET —un enlace antiguo, un
 *   marcador— se manda a `/ingreso` para que pase por la detección.
 */

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const destino = sanitizeDestination(asText(form.get("destino")));
  const profile = parseConectaProfile(asText(form.get("conecta")));

  if (!profile) {
    return redirectWithinApp("/login", { destino }, 303);
  }

  // Si ya se intentó un silencioso en esta ventana de estado, no se repite:
  // se pasa a interactivo con la misma pista (anti-bucle, §4).
  const alreadyAttemptedSilent = request.cookies.get(SILENT_ATTEMPT_COOKIE_NAME)?.value === "1";

  return beginAuthorization({
    destino,
    mode: alreadyAttemptedSilent ? "hinted" : "silent",
    via: "conecta",
    loginHint: profile.email,
    conectaProfile: profile,
  });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const destino = sanitizeDestination(url.searchParams.get("destino"));

  if (url.searchParams.get("silent") !== "0") {
    return redirectWithinApp("/ingreso", { destino }, 303);
  }

  return beginAuthorization({ destino, mode: "select", via: "directo" });
}

function asText(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}
