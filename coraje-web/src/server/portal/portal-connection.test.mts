import { test } from "node:test";
import assert from "node:assert/strict";

import { isClientPortalConnected, isClientPortalSurface } from "./portal-connection";

test("el portal solo se conecta con `true` exacto; el resto lo deja desconectado", () => {
  const previo = process.env.PORTAL_CLIENTES_CONECTADO;
  try {
    for (const [value, expected] of [
      [undefined, false],
      ["", false],
      ["false", false],
      ["1", false],
      ["TRUE", false],
      ["true", true],
      [" true ", true],
    ] as const) {
      if (value === undefined) delete process.env.PORTAL_CLIENTES_CONECTADO;
      else process.env.PORTAL_CLIENTES_CONECTADO = value;
      assert.equal(isClientPortalConnected(), expected, String(value));
    }
  } finally {
    if (previo === undefined) delete process.env.PORTAL_CLIENTES_CONECTADO;
    else process.env.PORTAL_CLIENTES_CONECTADO = previo;
  }
});

test("las rutas del portal, de los accesos y de la redirección son superficie del portal", () => {
  for (const ruta of ["/portal", "/portal/ingreso", "/accesos", "/accesos/x", "/redirigir", "/redirigir/x"]) {
    assert.equal(isClientPortalSurface(ruta), true, ruta);
  }
  for (const ruta of ["/", "/tickets", "/tickets/x", "/avisos", "/salud", "/accesosfalso", "/redirigirx", "/login"]) {
    assert.equal(isClientPortalSurface(ruta), false, ruta);
  }
});
