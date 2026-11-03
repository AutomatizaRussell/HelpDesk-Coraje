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
 * Límite honesto: `n8n/` es la copia exportada, no la instancia viva, y que
 * los chequeos encuentren lo que deben solo se sabe contra la base
 * desplegada (guion de cierre).
 *
 * `salud_hallazgos` se lee de la última migración que la define: U24
 * (`20261103110000_retirar_espejo_sharepoint`) la reescribió sin S1-S4.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(THIS_DIR, "../../..");
const REPO_DIR = path.resolve(WEB_DIR, "..");
const MIGRATION = readFileSync(path.join(WEB_DIR, "prisma/migrations/20260928130000_observabilidad/migration.sql"), "utf8");
const RETIRO_ESPEJO = readFileSync(
  path.join(WEB_DIR, "prisma/migrations/20261103110000_retirar_espejo_sharepoint/migration.sql"),
  "utf8",
);
const PLAN = readFileSync(path.join(REPO_DIR, "docs/estado/plan-ejecucion.md"), "utf8");

type N8nNode = { name: string; type: string; parameters?: Record<string, unknown> };
type Workflow = { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }>; settings: Record<string, unknown> };
const SALUD = JSON.parse(readFileSync(path.join(REPO_DIR, "n8n/HELPDESK - Salud diaria V1.json"), "utf8")) as Workflow;

/**
 * Señales sin chequeo por decisión. S10: los plazos vencidos son producto
 * (O5). S1-S4: vigilaban el espejo en PowerApps, retirado en U24.
 */
const OUT_OF_SCOPE = new Set(["S1", "S2", "S3", "S4", "S10"]);

/** Definición vigente: la de la migración más reciente que la (re)crea. */
function fn(name: string): string {
  for (const sql of [RETIRO_ESPEJO, MIGRATION]) {
    const match = sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION "helpdesk"\\."${name}"[\\s\\S]*?\\$function\\$;`));
    if (match) return match[0];
  }
  assert.fail(`falta la función ${name}`);
}

/** Chequeos que la migración declara, con su señal y su severidad. */
function declaredChecks(): Map<string, { senal: string; severidad: string }> {
  const out = new Map<string, { senal: string; severidad: string }>();
  // En salud_hallazgos: SELECT 'S5', 'correo_fallido', 'ATENCION', …
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

test("la salud ya no lee nada del espejo retirado (U24)", () => {
  assert.doesNotMatch(fn("salud_hallazgos"), /espejo_sharepoint|ticket_sync_outbox|sync_divergencia/);
});

test("permisos: la vista lee y la revisión escribe", () => {
  assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION "helpdesk"\."salud_hallazgos"\(\) TO "coraje_runtime", "coraje_etl";/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION "helpdesk"\."registrar_revision_salud"\(JSONB, TEXT\) FROM PUBLIC, "coraje_runtime";/);
  // CREATE OR REPLACE conserva los permisos: U24 no los suelta ni los amplía.
  assert.doesNotMatch(RETIRO_ESPEJO, /^\s*(GRANT|REVOKE)[^;]*"salud_hallazgos"/m);
  assert.match(fn("salud_hallazgos"), /SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/);
  // Invoker: toca staging, que solo coraje_etl ve.
  assert.doesNotMatch(fn("registrar_revision_salud"), /SECURITY DEFINER/);
});

test("el workflow corre a las 7:00 de Bogotá, llama a la base y solo se detiene con críticos nuevos", () => {
  const schedule = SALUD.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
  assert.match(JSON.stringify(schedule?.parameters), /"expression":"0 7 \* \* \*"/);
  assert.equal(SALUD.settings.timezone, "America/Bogota");
  // El aviso reutiliza el workflow de error de la ingesta.
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
