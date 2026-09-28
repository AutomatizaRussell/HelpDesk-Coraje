import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HEALTH_CHECKS } from "./health-checks";

/**
 * Contrato de la observabilidad (U10, observabilidad.md) en lo que se puede
 * ver antes de desplegar: el inventario del plan, la migración y la copia
 * versionada del workflow.
 *
 * Límite honesto, el mismo de sharepoint-mirror.contract.test.mts: `n8n/`
 * es la copia exportada, no la instancia viva, y que los chequeos encuentren
 * lo que deben solo se sabe contra la base desplegada (guion de cierre).
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(THIS_DIR, "../../..");
const REPO_DIR = path.resolve(WEB_DIR, "..");
const MIGRATION = readFileSync(path.join(WEB_DIR, "prisma/migrations/20260928130000_observabilidad/migration.sql"), "utf8");
const PLAN = readFileSync(path.join(REPO_DIR, "docs/estado/plan-ejecucion.md"), "utf8");

type N8nNode = { name: string; type: string; parameters?: Record<string, unknown> };
type Workflow = { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }>; settings: Record<string, unknown> };
const SALUD = JSON.parse(readFileSync(path.join(REPO_DIR, "n8n/HELPDESK - Salud diaria V1.json"), "utf8")) as Workflow;

/** Señales fuera de U10 por decisión (O5: los plazos vencidos son producto). */
const OUT_OF_SCOPE = new Set(["S10"]);

function fn(name: string): string {
  const match = MIGRATION.match(new RegExp(`CREATE FUNCTION "helpdesk"\\."${name}"[\\s\\S]*?\\$function\\$;`));
  assert.ok(match, `falta la función ${name}`);
  return match[0];
}

/** Chequeos que la migración declara, con su señal y su severidad. */
function declaredChecks(): Map<string, { senal: string; severidad: string }> {
  const out = new Map<string, { senal: string; severidad: string }>();
  // En salud_hallazgos: SELECT 'S1', 'espejo_detenido', 'CRITICO', …
  for (const m of fn("salud_hallazgos").matchAll(/SELECT '([A-Z0-9]+)', '([a-z_]+)', '(CRITICO|ATENCION|AVISO)'/g)) {
    out.set(m[2], { senal: m[1], severidad: m[3] });
  }
  // En registrar_revision_salud: jsonb_build_object('senal', 'S9', 'chequeo', '…', 'severidad', '…'
  for (const m of fn("registrar_revision_salud").matchAll(/'senal', '([A-Z0-9]+)', 'chequeo', '([a-z_]+)', 'severidad', '(CRITICO|ATENCION|AVISO)'/g)) {
    out.set(m[2], { senal: m[1], severidad: m[3] });
  }
  return out;
}

test("cada señal del inventario del plan tiene al menos un chequeo, salvo las declaradas fuera", () => {
  const inventory = [...PLAN.matchAll(/^\| (S\d+) \|/gm)].map((m) => m[1]);
  assert.ok(inventory.length >= 9, "no se encontró el inventario S1-S10 en plan-ejecucion.md");
  const covered = new Set<string>(Object.values(HEALTH_CHECKS).map((check) => check.senal));
  const missing = inventory.filter((senal) => !OUT_OF_SCOPE.has(senal) && !covered.has(senal));
  assert.deepEqual(missing, [], "Señales del inventario sin chequeo");
});

test("la base y la aplicación conocen los mismos chequeos, con la misma señal y severidad", () => {
  const declared = declaredChecks();
  const expected = new Map(Object.entries(HEALTH_CHECKS).map(([code, check]) => [code, { senal: check.senal, severidad: check.severidad }]));
  assert.deepEqual(Object.fromEntries(declared), Object.fromEntries(expected));
});

test("solo lo crítico, nuevo o peor que la revisión anterior, se avisa", () => {
  const registrar = fn("registrar_revision_salud");
  assert.match(registrar, /WHERE h\.valor->>'severidad' = 'CRITICO'\s+AND \(h\.valor->>'cantidad'\)::INTEGER > COALESCE\(/);
  assert.match(registrar, /jsonb_array_length\(v_nuevos\) > 0/);
});

test("la reconciliación tolera lo que la ingesta aún no pudo traer", () => {
  assert.match(fn("registrar_revision_salud"), /WHERE sp\.creado < v_cursor/);
  assert.match(fn("registrar_revision_salud"), /c\.sync_key = 'helpdesk_bd'/);
});

test("el espejo solo se vigila encendido y con lo encolado desde entonces", () => {
  const salud = fn("salud_hallazgos");
  assert.match(salud, /WHERE activo_desde IS NOT NULL/);
  assert.match(salud, /o\.created_at >= espejo\.activo_desde/);
});

test("permisos: la vista lee, la revisión escribe, y la divergencia no se edita por fuera", () => {
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION "helpdesk"\."salud_hallazgos"\(\) TO "coraje_runtime", "coraje_etl";/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION "helpdesk"\."registrar_revision_salud"\(JSONB, TEXT\) FROM PUBLIC, "coraje_runtime";/);
  assert.match(MIGRATION, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "helpdesk"\."sync_divergencia" FROM "coraje_runtime";/);
  assert.match(fn("salud_hallazgos"), /SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/);
  // Invoker: toca staging, que solo coraje_etl ve.
  assert.doesNotMatch(fn("registrar_revision_salud"), /SECURITY DEFINER/);
});

test("el workflow corre a las 7:00 de Bogotá, llama a la base y solo se detiene con críticos nuevos", () => {
  const schedule = SALUD.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
  assert.match(JSON.stringify(schedule?.parameters), /"expression":"0 7 \* \* \*"/);
  assert.equal(SALUD.settings.timezone, "America/Bogota");
  // El aviso reutiliza el workflow de error, igual que la transformación 08.
  assert.equal(SALUD.settings.errorWorkflow, "A10yl90Zh5otaSlJ");

  const pg = SALUD.nodes.find((n) => n.name === "PG - Registrar Revision");
  assert.match(String(pg?.parameters?.query), /helpdesk\.registrar_revision_salud\(/);
  assert.deepEqual(
    (SALUD.connections["IF - Criticos Nuevos"]?.main ?? []).map((branch) => branch.map((link) => link.node)),
    [["Stop - Avisar Criticos"], []],
  );
  // n8n transporta: ningún nodo propio escribe a Teams ni compara conteos.
  assert.ok(!SALUD.nodes.some((n) => n.type === "n8n-nodes-base.httpRequest" && /powerautomate|teams/i.test(JSON.stringify(n.parameters))));
});
