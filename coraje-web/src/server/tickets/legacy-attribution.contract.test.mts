import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato de la atribución de tickets legacy (docs/specs/directorio-personal.md
 * §4.3).
 *
 * El defecto que esto impide, observado el 05-nov-2026: la Transform 06
 * recalculaba en cada ejecución qué persona ocupaba cada correo, a partir
 * del estado actual de la lista «Personal GCT». Editar la lista reescribía
 * tickets pasados. Desde esta unidad, la ocupación vive en
 * `core.personal_correo_ocupacion`, que solo crece.
 *
 * Lo que garantiza la base: el trigger de la tabla rechaza borrar, editar
 * un intervalo cerrado o solapar dos. Lo que garantiza esta suite, antes del
 * despliegue: que la copia versionada de la ingesta lea esa tabla, no la
 * vacíe ni la reescriba, y que la 04 no vuelva a crear marcadores sobre
 * correos con dueño conocido.
 *
 * Límite: `n8n/` es la copia exportada, no la instancia viva. Que n8n corra
 * esta versión depende de reimportarla (operacion.md).
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(THIS_DIR, "../../..");
const REPO_DIR = path.resolve(WEB_DIR, "..");
const MIGRATIONS_DIR = path.join(WEB_DIR, "prisma/migrations");
const INGEST_WORKFLOW = path.join(
  REPO_DIR,
  "n8n/CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json",
);

type N8nNode = { name: string; parameters?: { query?: unknown } };

/** Quita comentarios de línea para que la prosa no cuente como SQL. */
function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

const ingestQueries = (JSON.parse(readFileSync(INGEST_WORKFLOW, "utf8")) as { nodes: N8nNode[] }).nodes
  .filter((node) => typeof node.parameters?.query === "string")
  .map((node) => ({ name: node.name, sql: stripSqlComments(node.parameters!.query as string) }));

function ingestQuery(prefix: string): string {
  const found = ingestQueries.filter((q) => q.name.startsWith(prefix));
  assert.equal(found.length, 1, `debe existir exactamente un nodo «${prefix}…»`);
  return found[0].sql;
}

const migrationsSql = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"))
  .join("\n");

const OCUPACION = String.raw`core\.personal_correo_ocupacion`;
// El mismo patrón de correo en la 03, la 06 y el CHECK de la tabla: si la
// ingesta aceptara un correo que la tabla rechaza, la siembra abortaría la
// 06 completa.
const EMAIL_SQL = "'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'";

test("la 06 resuelve correos con la tabla de ocupación", () => {
  const sql = ingestQuery("PG - Transform 06");
  assert.match(
    sql,
    new RegExp(String.raw`CREATE\s+TEMP\s+TABLE\s+tmp_ocupante_correo\s+AS\s+SELECT[\s\S]*?FROM\s+${OCUPACION}\s*;`, "i"),
  );
});

test("ninguna query de la ingesta borra ni vacía la ocupación", () => {
  const destructive = new RegExp(String.raw`(DELETE\s+FROM|TRUNCATE(\s+TABLE)?)\s+${OCUPACION}\b`, "i");
  assert.match("DELETE FROM core.personal_correo_ocupacion WHERE true", destructive);
  assert.doesNotMatch("SELECT 1 FROM core.personal_correo_ocupacion", destructive);
  const offenders = ingestQueries.filter((q) => destructive.test(q.sql)).map((q) => q.name);
  assert.deepEqual(offenders, []);
});

test("la única actualización de la ocupación cierra un intervalo", () => {
  const updates = ingestQueries.flatMap((q) =>
    [...q.sql.matchAll(new RegExp(String.raw`UPDATE\s+${OCUPACION}\b[^;]*?\bSET\s+([\s\S]*?)\bFROM\b`, "gi"))].map(
      (match) => ({ name: q.name, set: match[1].trim() }),
    ),
  );
  assert.ok(updates.length > 0, "la 06 debe cerrar intervalos en los relevos");
  for (const update of updates) {
    assert.match(update.set, /^hasta\s*=\s*NOW\(\)$/i, `${update.name} solo puede fijar hasta = NOW()`);
  }
});

test("la 04 no crea marcadores para correos con ocupación registrada", () => {
  const sql = ingestQuery("PG - Transform 04");
  assert.match(sql, new RegExp(String.raw`NOT\s+IN\s*\(\s*SELECT\s+correo\s+FROM\s+${OCUPACION}\s*\)`, "i"));
});

test("la 03, la 06 y la tabla usan el mismo patrón de correo", () => {
  assert.ok(ingestQuery("PG - Transform 03").includes(EMAIL_SQL), "la 03 debe validar el correo");
  assert.ok(ingestQuery("PG - Transform 06").includes(EMAIL_SQL), "la siembra de la 06 debe validar el correo");
  assert.ok(migrationsSql.includes(EMAIL_SQL), "el CHECK de la tabla debe usar el mismo patrón");
});

test("la tabla de ocupación está protegida por su trigger", () => {
  assert.match(
    migrationsSql,
    new RegExp(String.raw`CREATE\s+TRIGGER\s+"trg_guardar_personal_correo_ocupacion"\s+BEFORE\s+INSERT\s+OR\s+UPDATE\s+OR\s+DELETE`, "i"),
  );
});
