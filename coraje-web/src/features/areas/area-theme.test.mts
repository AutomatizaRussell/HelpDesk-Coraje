import { test } from "node:test";
import assert from "node:assert/strict";

import { areaThemeKey } from "./area-theme";

test("cada área con color propio toma el suyo, con o sin tildes y mayúsculas", () => {
  assert.equal(areaThemeKey("REVISORÍA"), "revisoria");
  assert.equal(areaThemeKey("Revisoria"), "revisoria");
  assert.equal(areaThemeKey("CONTABILIDAD"), "contabilidad");
  assert.equal(areaThemeKey("BPO"), "bpo");
  assert.equal(areaThemeKey(" legal "), "legal");
});

test("Administración, su recepción, Impuestos, un área nueva y sin área van al color general", () => {
  for (const area of ["ADMINISTRACIÓN", "ADMINISTRACIÓN-RECEPCIÓN", "IMPUESTOS", "ÁREA NUEVA", "", null, undefined]) {
    assert.equal(areaThemeKey(area), "general", String(area));
  }
});
