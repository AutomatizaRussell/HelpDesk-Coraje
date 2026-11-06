import { test } from "node:test";
import assert from "node:assert/strict";

import { etiquetaCategoria, formatCalificacion, formatEntero, formatFechaDia, formatMesCorto, formatPorcentaje, nombreMes, SIN_DATO } from "./format";

/** Los espacios de Intl (no separables) se normalizan para comparar texto. */
const plain = (text: string) => text.replace(/\s/g, " ");

test("el porcentaje lleva un decimal con coma y, en es-CO, sin espacio", () => {
  assert.equal(plain(formatPorcentaje(0.7313)), "73,1%");
  assert.equal(plain(formatPorcentaje(1)), "100,0%");
});

test("un promedio sin tickets es «sin dato», no cero", () => {
  assert.equal(formatPorcentaje(null), SIN_DATO);
  assert.equal(formatCalificacion(null), SIN_DATO);
});

test("la calificación lleva dos decimales y los miles van con punto", () => {
  assert.equal(formatCalificacion(4.8825), "4,88");
  assert.equal(formatEntero(3090), "3.090");
});

test("una fecha ISO se escribe día/mes/año sin pasar por ninguna zona horaria", () => {
  assert.equal(formatFechaDia("2026-10-01"), "01/10/2026");
  assert.equal(formatFechaDia(null), SIN_DATO);
});

test("meses y categorías se leen en español y sin el prefijo de orden", () => {
  assert.equal(formatMesCorto(2026, 3), "mar 2026");
  assert.equal(nombreMes(9), "Septiembre");
  assert.equal(etiquetaCategoria("1.Excelente"), "Excelente");
  assert.equal(etiquetaCategoria("Ticket abierto"), "Ticket abierto");
});
