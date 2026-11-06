import { test } from "node:test";
import assert from "node:assert/strict";

import { SIN_FILTROS, activeFilterCount, indicadoresHref, parseIndicadoresParams } from "./indicadores-filters";

const AREA = "6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f";

test("sin parámetros: vista de volumen y ningún filtro", () => {
  assert.deepEqual(parseIndicadoresParams({}), { vista: "volumen", filtros: SIN_FILTROS });
});

test("los valores válidos se leen con su tipo", () => {
  const { vista, filtros } = parseIndicadoresParams({ vista: "calidad", anio: "2026", mes: "3", area_destino: AREA });
  assert.equal(vista, "calidad");
  assert.equal(filtros.anio, 2026);
  assert.equal(filtros.mes, 3);
  assert.equal(filtros.areaDestino, AREA);
});

test("un valor inválido se descarta: nunca llega a SQL", () => {
  const { vista, filtros } = parseIndicadoresParams({
    vista: "otra",
    anio: "2026; DROP TABLE x",
    mes: "13",
    area_destino: "' OR 1=1 --",
    responsable: "no-es-uuid",
  });
  assert.equal(vista, "volumen");
  assert.deepEqual(filtros, SIN_FILTROS);
});

test("un parámetro repetido usa su primer valor", () => {
  assert.equal(parseIndicadoresParams({ mes: ["4", "5"] }).filtros.mes, 4);
});

test("la URL de una pestaña conserva los filtros y omite lo que está por defecto", () => {
  const { filtros } = parseIndicadoresParams({ anio: "2025", area_remite: AREA });
  assert.equal(indicadoresHref("volumen", SIN_FILTROS), "/indicadores");
  assert.equal(indicadoresHref("tickets", filtros), `/indicadores?vista=tickets&anio=2025&area_remite=${AREA}`);
  assert.equal(activeFilterCount(filtros), 2);
});
