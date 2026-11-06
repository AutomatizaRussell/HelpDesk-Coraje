import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato de helpdesk.v_indicador_ticket (U39, docs/specs/indicadores.md).
 *
 * La vista copia la lógica del Power BI «IND HELPDESK». Lo que esta suite
 * fija antes del despliegue: que las categorías sean literalmente las del
 * DAX, porque el panel las muestra y la conciliación las compara texto a
 * texto; que la versión vigente cuente días calendario hasta que la
 * conciliación cierre (indicadores.md §4); y que la aplicación pueda leerla.
 *
 * Límite: el comportamiento de cada rama se probó contra PGlite con valores
 * calculados a mano (indicadores.md §6), no aquí: esta suite no tiene base.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(THIS_DIR, "../../../prisma/migrations");

/** Última definición de la vista, sin comentarios. */
const viewSql = (() => {
  const definitions = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8").replace(/--[^\n]*/g, ""))
    .flatMap((sql) => [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+"helpdesk"\."v_indicador_ticket"[\s\S]*?;\s*(?=\n|$)/gi)].map((m) => m[0]));
  assert.ok(definitions.length > 0, "debe existir helpdesk.v_indicador_ticket");
  return definitions[definitions.length - 1];
})();

const DAX_CATEGORIES = ["Ticket abierto", "1.Excelente", "2.Sobresaliente", "3.Regular", "4.Deficiente"];

test("las categorías de oportunidad son literalmente las del Power BI", () => {
  const found = new Set([...viewSql.matchAll(/'(Ticket abierto|\d\.[A-Za-z]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...found].sort(), [...DAX_CATEGORIES].sort());
});

test("los pesos de la oportunidad son los del Power BI", () => {
  for (const [category, weight] of [["1.Excelente", "1"], ["2.Sobresaliente", "0.75"], ["3.Regular", "0.5"], ["4.Deficiente", "0.25"]]) {
    assert.match(viewSql, new RegExp(String.raw`categoria_oportunidad\s*=\s*'${category.replace(".", String.raw`\.`)}'\s+THEN\s+${weight.replace(".", String.raw`\.`)}\b`));
  }
});

test("la versión vigente cuenta días calendario, sin el calendario hábil", () => {
  // Pasar a días hábiles es un cambio decidido, pero después de conciliar
  // (indicadores.md §4). Esta prueba se actualiza en esa unidad, no antes.
  assert.doesNotMatch(viewSql, /add_colombia_business_days/);
});

test("la aplicación puede leer la vista", () => {
  const all = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readFileSync(path.join(MIGRATIONS_DIR, entry.name, "migration.sql"), "utf8"))
    .join("\n");
  assert.match(all, /GRANT\s+SELECT\s+ON\s+"helpdesk"\."v_indicador_ticket"\s+TO\s+[^;]*"coraje_runtime"/i);
});
