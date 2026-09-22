import { NextResponse, type NextRequest } from "next/server";

import { redirectWithinApp } from "@/server/auth/app-redirect";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-cookie";
import { isPublicAssetPath } from "@/server/security/public-assets";
import { isPublicPath, normalizeAppPathname } from "@/server/security/public-paths";

/**
 * Perímetro de la aplicación (specs/acceso-empleados.md §8).
 *
 * Hasta esta unidad no había perímetro: cada página se protegía sola, y dos
 * de ellas no se protegían en absoluto. `/portal` listaba los clientes de la
 * firma con su identificación fiscal y aceptaba crear tickets reales sin
 * pedir nada, y `/redireccion` se abría con una clave compartida guardada en
 * una variable de entorno. Lo primero se retiró; lo segundo quedó detrás de
 * la identidad real de empleado. Este archivo es lo que impide que vuelva a
 * pasar: **toda ruta es privada salvo que figure en la lista pública**, y una
 * página añadida mañana queda protegida sin que su autor haga nada.
 *
 * **Dos capas, ninguna redundante.** El proxy no alcanza PostgreSQL, así que
 * comprueba que la cookie de sesión **está presente**, no que sea válida. Eso
 * corta el tráfico anónimo antes de que llegue a ninguna ruta privada.
 * `readEmployeeSession` —por donde pasa toda superficie privada— es quien
 * decide si esa cookie corresponde a una sesión viva de una persona que el
 * directorio sigue admitiendo. Quitar la primera capa vuelve alcanzable una
 * página a la que se le olvidó el guard; quitar la segunda hace que una
 * cookie inventada funcione.
 *
 * El proxy corre en el runtime del borde y no puede consultar la base: eso no
 * es una limitación que se esté sorteando, es la razón de que la segunda capa
 * exista. Tampoco se pone aquí ninguna consulta "barata" de verificación: una
 * lectura a PostgreSQL por cada petición, incluida cada imagen, es justo el
 * tipo de carga permanente que CLAUDE.md § Economía de recursos descarta.
 */

/**
 * Peticiones que deben disparar el ingreso sin que la persona haga clic.
 *
 * El caso ordinario de HelpDesk es alguien que llega desde el menú de Conecta
 * con una sesión de Microsoft ya viva en el navegador: mandarlo a `/login`
 * le pondría delante un botón que no hace falta pulsar
 * (specs/acceso-empleados.md §4). Mandarlo a `/api/auth/microsoft/start` lo
 * deja entrar sin ver ninguna pantalla, porque ese handler intenta primero el
 * modo silencioso y solo cae al explícito si el proveedor lo rechaza.
 *
 * Se exige que sea una **navegación de documento** —un GET que espera HTML y
 * no lleva la marca `RSC` de las peticiones internas de React— porque el
 * arranque del flujo OIDC tiene efectos: sella una cookie de estado nueva y
 * pisa la anterior. Un prefetch o una petición de datos que lo dispararan
 * podrían invalidar un ingreso en curso en otra pestaña.
 */
function isDocumentNavigation(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.get("rsc") !== null) return false;
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

export function proxy(request: NextRequest) {
  const pathname = normalizeAppPathname(request.nextUrl.pathname);

  // Imágenes corporativas de la lista exacta: no contienen dato alguno de
  // personas ni de clientes, y la pantalla de acceso las necesita sin sesión.
  if (isPublicAssetPath(pathname)) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  // Quien llama por API recibe un estado que puede interpretar; quien navega
  // recibe el ingreso. En ambos casos sin cuerpo que filtre nada sobre la
  // ruta que pidió: la respuesta no distingue "no autorizado" de "no existe".
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // El destino se preserva para que el ingreso no le cueste a nadie el lugar
  // al que iba. Se sanea en los dos extremos del flujo —al sellarlo en
  // `/start` y al leerlo en `/login`—, así que aquí se pasa tal cual.
  const destino = `${pathname}${request.nextUrl.search}`;
  const target = isDocumentNavigation(request)
    ? "/api/auth/microsoft/start"
    : "/login";

  // Redirección con `Location` relativo, no absoluto: detrás del proxy de
  // Coolify el host que ve el servidor de Next es el interno del contenedor,
  // y una URL construida a partir de él manda al navegador a una dirección
  // que no puede resolver. Es el defecto que corrigió `306d286`, y la razón
  // por la que aquí no se usa `NextResponse.redirect()` — que además de
  // exigir URL absoluta, es lo que empuja a cometerlo.
  return redirectWithinApp(target, { destino }, 303);
}

/**
 * Se excluyen los recursos internos de Next, que no son rutas de la
 * aplicación y no llevan datos de nadie. Todo lo demás entra por el proxy,
 * incluidas las rutas que aún no existen: denegar por defecto significa que
 * una ruta nueva está cubierta antes de escribirse.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
