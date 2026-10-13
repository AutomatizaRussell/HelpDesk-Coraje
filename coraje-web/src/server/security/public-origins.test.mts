import { test } from "node:test";
import assert from "node:assert/strict";

import { signOutDestination } from "../auth/conecta-return";
import { CONECTA_ORIGIN, directPublicOrigin, directRedirectUri, isDirectEntry, requestHost } from "./public-origins";

const DIRECTO = "https://helpdesk.rbgct.cloud";
const CALLBACK_DIRECTO = `${DIRECTO}/helpdesk/api/auth/microsoft/callback`;

/** Ejecuta una comprobación con la variable fijada y la deja como estaba. */
function conOrigenDirecto(value: string | undefined, comprobar: () => void): void {
  const previo = process.env.HELPDESK_DIRECT_ORIGIN;
  if (value === undefined) delete process.env.HELPDESK_DIRECT_ORIGIN;
  else process.env.HELPDESK_DIRECT_ORIGIN = value;
  try {
    comprobar();
  } finally {
    if (previo === undefined) delete process.env.HELPDESK_DIRECT_ORIGIN;
    else process.env.HELPDESK_DIRECT_ORIGIN = previo;
  }
}

const desde = (host: string) => new Headers({ "x-forwarded-host": host, host: "0.0.0.0:3000" });

test("el host de la petición sale de X-Forwarded-Host o de Host, sin puerto", () => {
  assert.equal(requestHost(desde("HelpDesk.rbgct.cloud")), "helpdesk.rbgct.cloud");
  assert.equal(requestHost(new Headers({ host: "conecta.rbgct.cloud:443" })), "conecta.rbgct.cloud");
  assert.equal(requestHost(new Headers()), null);
});

test("el origen directo solo vale como https sin ruta; si no, se ignora", () => {
  for (const [value, expected] of [
    [undefined, null],
    ["", null],
    [DIRECTO, DIRECTO],
    [`${DIRECTO}/`, DIRECTO],
    ["http://helpdesk.rbgct.cloud", null],
    [`${DIRECTO}/helpdesk`, null],
    ["helpdesk.rbgct.cloud", null],
  ] as const) {
    conOrigenDirecto(value, () => assert.equal(directPublicOrigin(), expected, String(value)));
  }
});

test("sin origen directo configurado, todo es entrada por Conecta", () => {
  conOrigenDirecto(undefined, () => {
    assert.equal(isDirectEntry(desde("helpdesk.rbgct.cloud")), false);
    assert.equal(directRedirectUri(desde("helpdesk.rbgct.cloud")), null);
    assert.equal(signOutDestination(desde("helpdesk.rbgct.cloud")), `${CONECTA_ORIGIN}/app`);
  });
});

test("por el dominio directo, Entra vuelve allí y cerrar sesión lleva a su ingreso", () => {
  conOrigenDirecto(DIRECTO, () => {
    assert.equal(isDirectEntry(desde("helpdesk.rbgct.cloud")), true);
    assert.equal(directRedirectUri(desde("helpdesk.rbgct.cloud")), CALLBACK_DIRECTO);
    assert.equal(signOutDestination(desde("helpdesk.rbgct.cloud")), `${DIRECTO}/helpdesk/login`);
  });
});

test("por Conecta, o por un host que no es ninguno de los dos, todo sigue como antes", () => {
  conOrigenDirecto(DIRECTO, () => {
    for (const host of ["conecta.rbgct.cloud", "otro.ejemplo.com"]) {
      assert.equal(isDirectEntry(desde(host)), false, host);
      // `null` significa «la de ENTRA_REDIRECT_URI»: una cabecera no aporta direcciones.
      assert.equal(directRedirectUri(desde(host)), null, host);
      assert.equal(signOutDestination(desde(host)), `${CONECTA_ORIGIN}/app`, host);
    }
  });
});
