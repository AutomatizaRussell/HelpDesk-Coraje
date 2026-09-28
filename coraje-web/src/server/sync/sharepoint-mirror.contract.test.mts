import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato de la regla de precedencia con SharePoint (U9,
 * sincronizacion-sharepoint.md §4.3) en lo que se puede ver antes de
 * desplegar: la migración y las copias versionadas de los dos workflows.
 *
 * Límite honesto, el mismo de event-model.contract.test.mts: `n8n/` es la
 * copia exportada, no la instancia viva. Esta suite garantiza que el
 * repositorio no contradiga la regla; que la instancia corra esta versión se
 * confirma al importarla.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(THIS_DIR, "../../..");
const REPO_DIR = path.resolve(WEB_DIR, "..");
const MIGRATION = readFileSync(path.join(WEB_DIR, "prisma/migrations/20260928120000_espejo_sharepoint/migration.sql"), "utf8");

type N8nNode = { name: string; type: string; parameters?: Record<string, unknown> };
type Workflow = { nodes: N8nNode[]; connections: Record<string, { main: { node: string }[][] }>; settings: Record<string, unknown> };

function workflow(file: string): Workflow {
  return JSON.parse(readFileSync(path.join(REPO_DIR, "n8n", file), "utf8")) as Workflow;
}
const INGESTA = workflow("CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json");
const SALIDA = workflow("CORAJE - SALIDA - PostgreSQL to SharePoint.json");

function query(w: Workflow, name: string): string {
  const node = w.nodes.find((n) => n.name === name);
  assert.ok(node, `falta el nodo ${name}`);
  return String(node.parameters?.query ?? node.parameters?.jsCode ?? "").replace(/--[^\n]*/g, "");
}

function next(w: Workflow, name: string): string[] {
  return (w.connections[name]?.main ?? []).flat().map((link) => link.node);
}

test("el espejo nace apagado: encenderlo es un acto deliberado", () => {
  assert.match(MIGRATION, /VALUES \(TRUE, NULL, /);
  assert.match(query(SALIDA, "PG - Claim Next Pending"), /activo_desde IS NOT NULL/);
  assert.match(query(SALIDA, "PG - Claim Next Pending"), /o\.created_at >= espejo\.activo_desde/);
});

test("el trigger encola solo tickets cuyo dueño es HelpDesk y ya clasificados", () => {
  const fn = MIGRATION.match(/CREATE FUNCTION "helpdesk"\."encolar_espejo_sharepoint"[\s\S]*?\$function\$;/)?.[0] ?? "";
  assert.match(fn, /NEW\.origen_sistema NOT IN \('SISTEMA_INTERNO', 'PORTAL_CLIENTE'\)/);
  assert.match(fn, /NEW\.id_area_destino IS NULL OR NEW\.id_tipo_req IS NULL/);
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/);
  assert.match(MIGRATION, /AFTER INSERT OR UPDATE ON "helpdesk"\."fact_ticket"/);
});

test("la ingesta no reescribe tickets de HelpDesk ni decide su estado", () => {
  assert.match(query(INGESTA, "PG - Transform 06 Tickets Legacy"), /existente\.id_ticket IS NULL OR existente\.origen_sistema = 'SHAREPOINT_LEGACY'/);
  assert.match(query(INGESTA, "PG - Transform 07 Ticket Eventos"), /WHERE f\.origen_sistema = 'SHAREPOINT_LEGACY';/);
  // La regla de mapeo ya filtraba por origen antes de U9: que siga así.
  assert.match(query(INGESTA, "PG - Apply Legacy TipoReq Mapping Rules"), /f\.origen_sistema = 'SHAREPOINT_LEGACY'/);
});

test("los cambios de PowerApps sobre tickets de HelpDesk se concilian después de la 07, y los rechazados avisan", () => {
  assert.deepEqual(next(INGESTA, "PG - Transform 07 Ticket Eventos"), ["PG - Transform 08 Espejo HelpDesk"]);
  assert.deepEqual(next(INGESTA, "PG - Transform 08 Espejo HelpDesk"), ["IF - Divergencias Rechazadas"]);
  assert.deepEqual(next(INGESTA, "IF - Divergencias Rechazadas"), ["Stop - Avisar Divergencias"]);
  const t08 = query(INGESTA, "PG - Transform 08 Espejo HelpDesk");
  // Solo lo modificado después de la última lectura base: el eco no cuenta.
  assert.match(t08, /> \(ref\.espejo_conciliado->>'Modified'\)::TIMESTAMPTZ/);
  // Todo cambio de estado pasa por el escritor único.
  assert.doesNotMatch(t08, /INSERT\s+INTO\s+helpdesk\.fact_ticket_evento/i);
  assert.match(t08, /helpdesk\.registrar_evento_ticket/);
  assert.match(t08, /EXCEPTION WHEN OTHERS THEN/);
});

test("la salida cubre crear y actualizar, sin marcador de prueba ni texto pegado sin escapar", () => {
  assert.match(query(SALIDA, "PG - Claim Next Pending"), /o\.operation = 'UPDATE_TICKET' AND r\.sp_id IS NOT NULL/);
  assert.ok(SALIDA.nodes.some((n) => n.name === "HTTP - Update HelpDeskBd Item"));
  assert.ok(!JSON.stringify(SALIDA).includes("PRUEBA CORAJE"), "el marcador de prueba no puede llegar a producción");
  // El error se guarda entre comillas de dólar, no entre comillas simples.
  assert.match(query(SALIDA, "PG - Mark FAILED"), /\$espejo_error\$/);
  assert.doesNotMatch(query(SALIDA, "PG - Mark FAILED"), /'\{\{ \$json\.error/);
  // El ítem lo arma la base.
  assert.match(query(SALIDA, "PG - Build Payload"), /helpdesk\.item_espejo_sharepoint\(o\.id_ticket, o\.operation\)/);
});

test("una actualización no pisa un cambio de PowerApps que la ingesta todavía no vio", () => {
  // Sin esto, reasignar en HelpDesk sobrescribiría un cierre hecho en
  // PowerApps antes de que la ingesta lo conciliara, sin dejar rastro.
  assert.deepEqual(next(SALIDA, "IF - Operation Create"), ["HTTP - Create HelpDeskBd Item", "HTTP - Read Current HelpDeskBd Item"]);
  assert.deepEqual(next(SALIDA, "HTTP - Read Current HelpDeskBd Item"), ["Code - Check PowerApps Changes"]);
  assert.deepEqual(next(SALIDA, "IF - Safe To Write"), ["HTTP - Update HelpDeskBd Item", "PG - Mark FAILED"]);
  assert.match(query(SALIDA, "Code - Check PowerApps Changes"), /CONFLICTO_POWERAPPS/);
  const update = SALIDA.nodes.find((n) => n.name === "HTTP - Update HelpDeskBd Item");
  assert.match(JSON.stringify(update?.parameters), /"IF-MATCH","value":"=\{\{ \$json\.etag \}\}"/);
  // El conflicto se reintenta solo después de conciliar.
  assert.match(query(SALIDA, "PG - Requeue Stale Processing"), /o\.last_error LIKE 'CONFLICTO_POWERAPPS%' AND r\.espejo_conciliado_at > o\.updated_at/);
});

test("la lectura base del espejo es lo que SharePoint devolvió, normalizado en la base", () => {
  assert.deepEqual(next(SALIDA, "IF - SharePoint Written")[0], "HTTP - Get HelpDeskBd Item");
  assert.match(query(SALIDA, "PG - Mark SENT"), /helpdesk\.espejo_campos\(d\.item\)/);
  assert.deepEqual(next(SALIDA, "PG - Mark SENT"), ["PG - Requeue If Changed"]);
});

test("rechazar se traduce a Cerrado con el motivo: la única traducción con pérdida, nombrada", () => {
  const fn = MIGRATION.match(/CREATE FUNCTION "helpdesk"\."item_espejo_sharepoint"[\s\S]*?\$function\$;/)?.[0] ?? "";
  assert.match(fn, /WHEN 'RECHAZADO' THEN 'Cerrado'/);
  assert.match(fn, /'RECHAZADO: ' \|\| COALESCE\(t\.motivo_rechazo/);
});
