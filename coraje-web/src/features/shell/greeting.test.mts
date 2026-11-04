import { test } from "node:test";
import assert from "node:assert/strict";

import { greetingFor, greetingName, longDateLabel } from "./greeting";

// Horas en UTC: Bogotá es UTC−5 todo el año (sin horario de verano).
const bogota = (isoLocal: string) => new Date(`${isoLocal}-05:00`);

test("el saludo sigue la hora de Bogotá, no la del servidor", () => {
  assert.equal(greetingFor(bogota("2026-11-04T08:00:00")), "Buenos días");
  assert.equal(greetingFor(bogota("2026-11-04T11:59:00")), "Buenos días");
  assert.equal(greetingFor(bogota("2026-11-04T12:00:00")), "Buenas tardes");
  // 19:00 en Bogotá es medianoche en UTC: el servidor diría «días».
  assert.equal(greetingFor(bogota("2026-11-04T18:59:00")), "Buenas tardes");
  assert.equal(greetingFor(bogota("2026-11-04T19:00:00")), "Buenas noches");
  assert.equal(greetingFor(bogota("2026-11-04T23:30:00")), "Buenas noches");
});

test("el nombre del saludo es el primero, sin gritar", () => {
  assert.equal(greetingName("Andrés Ríos"), "Andrés");
  assert.equal(greetingName("DANIEL FELIPE LOPERA ESTRADA"), "Daniel");
  assert.equal(greetingName("  maría josé  "), "María");
});

test("la fecha larga es la del día en Bogotá, con mayúscula inicial", () => {
  assert.equal(longDateLabel(bogota("2026-11-03T15:00:00")), "Martes 3 de noviembre");
  // 22:00 del martes en Bogotá ya es miércoles en UTC.
  assert.equal(longDateLabel(bogota("2026-11-03T22:00:00")), "Martes 3 de noviembre");
});
