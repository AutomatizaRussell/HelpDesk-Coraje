import { test } from "node:test";
import assert from "node:assert/strict";

import { portalHostDecision, portalPublicOrigin, requestHost } from "./portal-host";

const SOPORTE = "https://soporte.rbgct.cloud";
const decide = (host: string, pathname: string, method = "GET", portalOrigin: string | null = SOPORTE) =>
  portalHostDecision({ host, pathname, search: "?x=1", method, portalOrigin });

test("sin dominio propio del portal, cada dominio sirve todo como antes", () => {
  for (const pathname of ["/tickets", "/portal", "/portal/activar/abc", "/login"]) {
    assert.deepEqual(decide("conecta.rbgct.cloud", pathname, "GET", null), { kind: "PASS" });
  }
});

test("en el dominio del portal solo existe el portal", () => {
  for (const pathname of ["/portal", "/portal/ingreso", "/portal/activar/abc", "/portal/tickets/nuevo", "/rb-logo.png"]) {
    assert.deepEqual(decide("soporte.rbgct.cloud", pathname), { kind: "PASS" }, pathname);
  }
  for (const pathname of ["/", "/tickets", "/login", "/ingreso", "/accesos", "/api/auth/microsoft/start", "/api/interno/avisos/escalar", "/portalfalso"]) {
    assert.deepEqual(decide("soporte.rbgct.cloud", pathname), { kind: "NOT_FOUND" }, pathname);
  }
});

test("en Conecta, una navegación al portal va a su dominio con la misma ruta", () => {
  assert.deepEqual(decide("conecta.rbgct.cloud", "/portal/activar/abc"), {
    kind: "REDIRECT",
    location: "https://soporte.rbgct.cloud/helpdesk/portal/activar/abc?x=1",
  });
  assert.deepEqual(decide("conecta.rbgct.cloud", "/portal/ingreso", "POST"), { kind: "PASS" });
  // Lo de empleados no se toca.
  assert.deepEqual(decide("conecta.rbgct.cloud", "/tickets"), { kind: "PASS" });
});

test("el host de la petición sale de X-Forwarded-Host o de Host, sin puerto", () => {
  assert.equal(requestHost(new Headers({ "x-forwarded-host": "Soporte.rbgct.cloud", host: "0.0.0.0:3000" })), "soporte.rbgct.cloud");
  assert.equal(requestHost(new Headers({ host: "conecta.rbgct.cloud:443" })), "conecta.rbgct.cloud");
  assert.equal(requestHost(new Headers()), null);
});

test("el origen del portal solo vale como https sin ruta; si no, se ignora", () => {
  const previous = process.env.PORTAL_PUBLIC_ORIGIN;
  try {
    for (const [value, expected] of [
      [undefined, null],
      ["", null],
      [SOPORTE, SOPORTE],
      [`${SOPORTE}/`, SOPORTE],
      ["http://soporte.rbgct.cloud", null],
      [`${SOPORTE}/helpdesk`, null],
      ["soporte.rbgct.cloud", null],
    ] as const) {
      if (value === undefined) delete process.env.PORTAL_PUBLIC_ORIGIN;
      else process.env.PORTAL_PUBLIC_ORIGIN = value;
      assert.equal(portalPublicOrigin(), expected, String(value));
    }
  } finally {
    if (previous === undefined) delete process.env.PORTAL_PUBLIC_ORIGIN;
    else process.env.PORTAL_PUBLIC_ORIGIN = previous;
  }
});
