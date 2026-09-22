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
 *
 * El perímetro necesita lo contrario y por eso el estado es un parámetro: al
 * mandar a alguien sin sesión hacia el ingreso, lo correcto es **303 See
 * Other**, que convierte la petición en un GET. Con 307 se reenviaría el
 * método original, y el POST de una Server Action llegaría a una ruta que
 * solo responde a GET —un 405 en lugar de la pantalla de acceso—.
 */
export function redirectWithinApp(
  pathname: string,
  searchParams?: Record<string, string>,
  status: 303 | 307 = 307,
): NextResponse {
  return new NextResponse(null, {
    status,
    headers: { Location: buildAppPath(pathname, searchParams) },
  });
}
