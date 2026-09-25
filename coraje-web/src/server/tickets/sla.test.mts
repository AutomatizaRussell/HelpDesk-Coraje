import { test } from "node:test";
import assert from "node:assert/strict";

import { slaStatus } from "./sla";

const now = new Date("2026-09-25T15:00:00Z");
const hours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000);

test("un ticket abierto con el plazo pasado está vencido", () => {
  assert.equal(slaStatus({ state: "ASIGNADO", fechaLimite: hours(-1), now }), "VENCIDO");
});

test("menos de un día para el límite es «por vencer»; más, en plazo", () => {
  assert.equal(slaStatus({ state: "ASIGNADO", fechaLimite: hours(23), now }), "POR_VENCER");
  assert.equal(slaStatus({ state: "ABIERTO", fechaLimite: hours(25), now }), "EN_PLAZO");
});

test("un ticket terminado no tiene plazo que señalar, aunque se cerrara tarde", () => {
  assert.equal(slaStatus({ state: "CERRADO", fechaLimite: hours(-100), now }), null);
  assert.equal(slaStatus({ state: "RECHAZADO", fechaLimite: hours(-100), now }), null);
});

test("sin fecha límite no se inventa un estado de plazo", () => {
  assert.equal(slaStatus({ state: "ASIGNADO", fechaLimite: null, now }), null);
});
