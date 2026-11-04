import { test } from "node:test";
import assert from "node:assert/strict";

import { plazoFraction, slaStatus } from "./sla";

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

test("la fracción del plazo es días hábiles consumidos sobre el total, entre 0 y 1", () => {
  assert.equal(plazoFraction({ consumidos: 2, total: 5, vencido: false }), 0.4);
  assert.equal(plazoFraction({ consumidos: 7, total: 5, vencido: false }), 1);
  assert.equal(plazoFraction({ consumidos: 0, total: 0, vencido: false }), 0);
});

test("un ticket vencido cierra el anillo aunque el conteo de días no llegue", () => {
  assert.equal(plazoFraction({ consumidos: 2, total: 3, vencido: true }), 1);
});
