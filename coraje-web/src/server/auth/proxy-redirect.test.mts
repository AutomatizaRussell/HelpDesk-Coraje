import assert from "node:assert/strict";
import { test } from "node:test";

// La misma función que usa el adaptador de Next para volver relativo el
// `Location` del proxy cuando el host coincide con el de la petición.
import { getRelativeURL } from "next/dist/shared/lib/router/utils/relativize-url.js";

import { redirectFromProxy } from "./app-redirect";

const INTERNAL_URL = "http://0.0.0.0:3000/helpdesk/tickets?vista=mios";

test("el Location del perímetro es absoluto: el adaptador de Next puede leerlo sin base", () => {
  const response = redirectFromProxy(INTERNAL_URL, "/ingreso", { destino: "/tickets?vista=mios" });
  const location = response.headers.get("Location");
  assert.ok(location);
  // Es exactamente lo que hace `new NextURL(location)` en `adapter.js`; con
  // la ruta relativa de antes, esto lanzaba y la respuesta era un 500.
  assert.doesNotThrow(() => new URL(location));
  assert.equal(response.status, 303);
});

test("lo que llega al navegador vuelve a ser relativo, sin el host interno", () => {
  const response = redirectFromProxy(INTERNAL_URL, "/ingreso", { destino: "/tickets?vista=mios" });
  const relative = getRelativeURL(response.headers.get("Location")!, INTERNAL_URL);
  assert.equal(relative, "/helpdesk/ingreso?destino=%2Ftickets%3Fvista%3Dmios");
});
