import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDueDay, personInitials } from "./format";

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
