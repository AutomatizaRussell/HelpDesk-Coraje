import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { proxy } from "./proxy";
import { SESSION_COOKIE_NAME } from "./server/auth/session-cookie";

/**
 * Comportamiento del perímetro.
 *
 * La prueba hermana (`server/security/perimeter.test.mts`) verifica que la
 * clasificación **cubra** todas las rutas; esta verifica qué hace el proxy
 * con cada caso. Se pueden ejercitar de verdad porque `NextRequest` es una
 * clase corriente sobre `Request`: no hace falta levantar un servidor para
 * saber qué responde.
 *
 * Lo que sigue **sin** cubrirse aquí, y no se declara verificado: que el
 * `basePath` llegue descontado del pathname en el despliegue real. Por eso
 * `normalizeAppPathname` acepta las dos formas — y por eso cada caso de
 * abajo se ejercita con el prefijo puesto, que es como el navegador lo pide.
 */

const ORIGEN = "https://conecta.rbgct.cloud";

function peticion(
  ruta: string,
  opciones: { conSesion?: boolean; navegacion?: boolean; metodo?: string } = {},
): NextRequest {
  const { conSesion = false, navegacion = true, metodo = "GET" } = opciones;
  const headers = new Headers();
  if (navegacion) headers.set("accept", "text/html,application/xhtml+xml");
  if (conSesion) headers.set("cookie", `${SESSION_COOKIE_NAME}=token-cualquiera`);
  return new NextRequest(new URL(`${ORIGEN}${ruta}`), { method: metodo, headers });
}

/** `NextResponse.next()` se reconoce por este encabezado interno de Next. */
function dejaPasar(respuesta: Response): boolean {
  return respuesta.headers.get("x-middleware-next") === "1";
}

test("una navegación sin sesión a ruta privada va a la detección de la entrada", () => {
  const respuesta = proxy(peticion("/helpdesk/tickets"));

  assert.equal(respuesta.status, 303);
  const location = respuesta.headers.get("location") ?? "";
  assert.ok(
    location.startsWith("/helpdesk/ingreso"),
    `Esperaba /ingreso, no ${location}`,
  );
  // Relativo, nunca absoluto: detrás del proxy de Coolify una URL absoluta
  // se construiría con el host interno del contenedor (defecto de `306d286`).
  assert.ok(!location.includes("://"), `Location absoluto: ${location}`);
  assert.ok(
    location.includes(encodeURIComponent("/tickets")),
    "El destino pretendido debe sobrevivir al ingreso",
  );
});

test("la petición interna de React no dispara el flujo OIDC", () => {
  // Un prefetch que arrancara el ingreso sellaría una cookie de estado nueva
  // y pisaría un login en curso en otra pestaña.
  const request = peticion("/helpdesk/tickets");
  request.headers.set("rsc", "1");

  const location = proxy(request).headers.get("location") ?? "";
  assert.ok(location.startsWith("/helpdesk/login"), location);
});

test("una llamada de API sin sesión recibe 401, no una redirección", () => {
  const respuesta = proxy(peticion("/helpdesk/api/auth/logout", { navegacion: false, metodo: "POST" }));

  assert.equal(respuesta.status, 401);
  assert.equal(respuesta.headers.get("cache-control"), "no-store");
});

test("con cookie de sesión presente el perímetro deja pasar", () => {
  // Presencia, no validez: quien decide si la sesión vive es la lectura de
  // sesión contra PostgreSQL, que el proxy no puede alcanzar.
  assert.ok(dejaPasar(proxy(peticion("/helpdesk/tickets", { conSesion: true }))));
});

test("las rutas públicas pasan sin sesión", () => {
  assert.ok(dejaPasar(proxy(peticion("/helpdesk/login"))));
  assert.ok(dejaPasar(proxy(peticion("/helpdesk/ingreso"))));
  assert.ok(dejaPasar(proxy(peticion("/helpdesk/api/auth/microsoft/start"))));
  assert.ok(dejaPasar(proxy(peticion("/helpdesk/api/auth/microsoft/callback"))));
});

test("el logotipo de la lista exacta pasa sin sesión, y nada más de public/", () => {
  // El optimizador de imágenes lo descarga con una petición interna que no
  // lleva cookies; si se bloqueara, la imagen fallaría sin error visible.
  assert.ok(dejaPasar(proxy(peticion("/helpdesk/rb-logo.png"))));
  assert.equal(proxy(peticion("/helpdesk/otro-archivo.png")).status, 303);
});

test("la raíz sin sesión también pasa por la detección de la entrada", () => {
  const location = proxy(peticion("/helpdesk")).headers.get("location") ?? "";
  assert.ok(location.startsWith("/helpdesk/ingreso"), location);
});

test("una ruta que no existe tampoco se filtra: deniega por defecto", () => {
  // Denegar por defecto significa que una ruta futura está cubierta antes de
  // escribirse, y que una inexistente no revela si existe o no.
  assert.equal(proxy(peticion("/helpdesk/tickets/42")).status, 303);
  assert.equal(proxy(peticion("/helpdesk/portal")).status, 303);
});
