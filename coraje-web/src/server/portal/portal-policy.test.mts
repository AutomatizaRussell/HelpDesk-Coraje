import { test } from "node:test";
import assert from "node:assert/strict";

import { DEVICE_IDLE_DAYS, evaluatePortalAccess, isDeviceIdle, normalizeEmail, type PortalAccessFacts } from "./portal-policy";

/**
 * Reglas del acceso de clientes que no necesitan base (acceso-clientes.md §6,
 * §7, §10). Lo que exige datos reales —que la consulta devuelva los hechos
 * correctos— se ejercita contra la base desplegada.
 */

const NOW = new Date("2026-09-28T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function facts(overrides: Partial<PortalAccessFacts> = {}): PortalAccessFacts {
  return {
    dispositivo: { estado: "ACTIVO", ultimoUsoAt: new Date(NOW.getTime() - DAY) },
    autorizacion: { estado: "ACTIVA", activadaAt: new Date(NOW.getTime() - 30 * DAY) },
    contactoActivo: true,
    clienteActivo: true,
    ...overrides,
  };
}

test("un navegador vivo de un acceso activado, de un contacto y cliente activos, entra", () => {
  assert.equal(evaluatePortalAccess(facts(), NOW), null);
});

test("B2 cerrada: un dispositivo válido no basta si la autorización nunca se activó", () => {
  // Es la brecha que Impulsa cerró el 03-sep-2026: un navegador recordado
  // alcanzaba una autorización que nunca había activado.
  assert.equal(
    evaluatePortalAccess(facts({ autorizacion: { estado: "ACTIVA", activadaAt: null } }), NOW),
    "AUTORIZACION_SIN_ACTIVAR",
  );
});

test("revocar, desactivar el contacto o el cliente deniega aunque el navegador siga vivo", () => {
  assert.equal(evaluatePortalAccess(facts({ autorizacion: { estado: "REVOCADA", activadaAt: NOW } }), NOW), "AUTORIZACION_REVOCADA");
  assert.equal(evaluatePortalAccess(facts({ contactoActivo: false }), NOW), "CONTACTO_INACTIVO");
  assert.equal(evaluatePortalAccess(facts({ clienteActivo: false }), NOW), "CLIENTE_INACTIVO");
  assert.equal(
    evaluatePortalAccess(facts({ dispositivo: { estado: "REVOCADO", ultimoUsoAt: NOW } }), NOW),
    "DISPOSITIVO_REVOCADO",
  );
});

test("sin dispositivo no hay acceso", () => {
  assert.equal(evaluatePortalAccess(facts({ dispositivo: null }), NOW), "SIN_DISPOSITIVO");
});

test("D3: 180 días sin uso cierran el navegador; 180 justos todavía no", () => {
  assert.equal(DEVICE_IDLE_DAYS, 180);
  const limite = new Date(NOW.getTime() - 180 * DAY);
  const pasado = new Date(NOW.getTime() - 180 * DAY - 1);
  assert.equal(isDeviceIdle(limite, NOW), false);
  assert.equal(isDeviceIdle(pasado, NOW), true);
  assert.equal(
    evaluatePortalAccess(facts({ dispositivo: { estado: "ACTIVO", ultimoUsoAt: pasado } }), NOW),
    "DISPOSITIVO_INACTIVO",
  );
});

test("el acceso no vence por antigüedad: solo la inactividad cierra un navegador", () => {
  // Autorización de hace tres años, navegador usado ayer: entra (D3).
  assert.equal(
    evaluatePortalAccess(facts({ autorizacion: { estado: "ACTIVA", activadaAt: new Date(NOW.getTime() - 3 * 365 * DAY) } }), NOW),
    null,
  );
});

test("normalizeEmail deja la forma que exige la base", () => {
  assert.equal(normalizeEmail("  Ana.Perez@Cliente.COM "), "ana.perez@cliente.com");
});
