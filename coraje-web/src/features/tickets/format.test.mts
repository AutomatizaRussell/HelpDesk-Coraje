import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDueDay, formatShortDate, formatShortDateTime, personDisplayName, personInitials } from "./format";

test("el día de vencimiento se lee corto y no se corre de día", () => {
  assert.equal(formatDueDay("2026-11-09"), "lun 9 de nov");
  assert.equal(formatDueDay("2026-12-02"), "mié 2 de dic");
  // Medianoche UTC del 1 de enero: en Bogotá todavía sería 31 de diciembre.
  assert.equal(formatDueDay("2027-01-01"), "vie 1 de ene");
});

test("las iniciales son las de las dos primeras palabras", () => {
  assert.equal(personInitials("Andrés Ríos"), "AR");
  assert.equal(personInitials("DANIEL FELIPE LOPERA"), "DF");
  assert.equal(personInitials("  mateo  "), "M");
});

test("la fecha corta va en hora de Bogotá, sin punto en el mes y en 24 horas", () => {
  // 17:08 UTC = 12:08 en Bogotá.
  assert.equal(formatShortDate(new Date("2024-01-12T17:08:00Z")), "12 ene 2024");
  assert.equal(formatShortDateTime(new Date("2024-01-12T17:08:00Z")), "12 ene 2024 · 12:08");
  assert.equal(formatShortDateTime(new Date("2024-01-13T00:00:00Z")), "12 ene 2024 · 19:00");
});

test("los nombres del directorio se muestran en tipo oración, con las partículas en minúscula", () => {
  assert.equal(personDisplayName("MARY JULIETH RIVERA GUEVARA"), "Mary Julieth Rivera Guevara");
  assert.equal(personDisplayName("  ANA MARÍA DE LA CRUZ "), "Ana María de la Cruz");
  assert.equal(personDisplayName("DE LOS RÍOS"), "De los Ríos");
});
