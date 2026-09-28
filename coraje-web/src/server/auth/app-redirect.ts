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
 * **Solo para route handlers.** El perímetro no puede usarla: ver
 * `redirectFromProxy`.
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

/**
 * Redirección que emite el perímetro (`src/proxy.ts`).
 *
 * **Por qué no sirve `redirectWithinApp` aquí.** Desde Next 16 el proxy corre
 * en el runtime de Node, y en ese runtime el adaptador de Next reinterpreta
 * todo `Location` que devuelve el proxy con `new NextURL(location)`, **sin
 * base** (`next/dist/server/web/adapter.js`). Una ruta relativa hace lanzar
 * `Invalid URL`, y quien llegaba sin cookie a una ruta privada recibía un
 * 500 en lugar del ingreso (visto en producción el 28-sep-2026). El
 * handler de ruta no pasa por ese adaptador, y por eso a él le basta la
 * relativa.
 *
 * **Por qué la URL absoluta no reabre el defecto de `306d286`.** Se construye
 * sobre `request.url`, el host interno del contenedor, y ese mismo adaptador
 * compara el host del `Location` con el de la petición: si coinciden —y aquí
 * coinciden siempre, por construcción— lo vuelve a escribir **relativo**
 * antes de responder. Lo que sale al navegador es el mismo `Location`
 * relativo de antes; `proxy-redirect.test.mts` lo comprueba con la función
 * de Next que hace esa conversión.
 *
 * **303 See Other**, porque convierte la petición en un GET: con 307 se
 * reenviaría el método original, y el POST de una Server Action llegaría a
 * una ruta que solo responde a GET —un 405 en lugar de la pantalla de
 * acceso—.
 */
export function redirectFromProxy(
  requestUrl: string,
  pathname: string,
  searchParams?: Record<string, string>,
): NextResponse {
  const location = new URL(buildAppPath(pathname, searchParams), requestUrl);
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location.toString() },
  });
}
