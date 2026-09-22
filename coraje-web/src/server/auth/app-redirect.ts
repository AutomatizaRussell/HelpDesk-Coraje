import { NextResponse } from "next/server";

import { buildAppPath } from "@/server/auth/base-path";

/**
 * Redirección interna de HelpDesk, siempre relativa al origen que pidió el
 * navegador.
 *
 * No usa `NextResponse.redirect()` a propósito: ese helper exige una URL
 * absoluta y lanza ante una ruta relativa, lo que empujaba a los handlers a
 * construir el origen a partir de `request.url` — el origen equivocado
 * detrás del proxy (ver `base-path.ts`). Emitir la respuesta a mano permite
 * poner un `Location` relativo y conservar igualmente la API de cookies de
 * `NextResponse`, que es lo único que los handlers necesitan encima.
 *
 * El 307 preserva método y cuerpo, que es lo que exige el cierre de sesión:
 * `/api/auth/logout` responde a un POST y un 302 lo degradaría a GET en
 * algunos agentes.
 */
export function redirectWithinApp(
  pathname: string,
  searchParams?: Record<string, string>,
): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: buildAppPath(pathname, searchParams) },
  });
}
