import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato del área que remite (U38, docs/specs/tickets.md §3.2).
 *
 * El defecto que esto impide: el área que remite se deducía del área ACTUAL
 * de quien radicó. Medido el 05-nov-2026, eso dejaba sin área 672 de 3.088
 * tickets legacy y cambiaba de área otros 11, porque las personas salen de
 * la firma o cambian de área. Ahora se fija cuando nace el ticket.
 *
 * Lo que garantiza la base: coraje_runtime no tiene UPDATE sobre la columna.
 * Lo que garantiza esta suite, antes del despliegue: que la migración no se
 * lo conceda, que crear_ticket_interno la escriba al radicar, y que la copia
 * versionada de la ingesta la tome de Área_Remite del ítem y no del
 * directorio de personal.
 *
 * Límite: `n8n/` es la copia exportada, no la instancia viva. Que n8n corra
 * esta versión depende de reimportarla (operacion.md, «Área que remite»).
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

const transform06 = (() => {
  const nodes = (JSON.parse(readFileSync(INGEST_WORKFLOW, "utf8")) as { nodes: N8nNode[] }).nodes.filter(
    (node) => node.name.startsWith("PG - Transform 06") && typeof node.parameters?.query === "string",
  );
  assert.equal(nodes.length, 1, "debe existir exactamente un nodo «PG - Transform 06…»");
  return stripSqlComments(nodes[0].parameters!.query as string);
})();

/** Migraciones en orden de aplicación, sin comentarios. */
const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => ({ name, sql: stripSqlComments(readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8")) }));

/**
 * Cuerpo de la última definición de una función: la que queda viva tras
 * aplicar todas las migraciones. Las definiciones van entre $function$.
 */
function latestFunctionBody(qualifiedName: string): string {
  const pattern = new RegExp(
    String.raw`CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+${qualifiedName}\s*\([\s\S]*?\$function\$([\s\S]*?)\$function\$`,
    "gi",
  );
  const bodies = migrations.flatMap((m) => [...m.sql.matchAll(pattern)].map((match) => match[1]));
  assert.ok(bodies.length > 0, `no hay definición de ${qualifiedName}`);
  return bodies[bodies.length - 1];
}

test("la columna existe con llave foránea al catálogo de áreas", () => {
  const all = migrations.map((m) => m.sql).join("\n");
  assert.match(all, /ADD\s+COLUMN\s+"id_area_remite"\s+UUID/i);
  assert.match(
    all,
    /FOREIGN\s+KEY\s*\(\s*"id_area_remite"\s*\)\s+REFERENCES\s+"core"\."dim_area"\s*\(\s*"id_area"\s*\)/i,
  );
});

test("solo la ingesta puede reescribir el área que remite", () => {
  // Cada GRANT UPDATE (columnas) ON fact_ticket TO rol, en cualquier migración.
  const grants = migrations.flatMap((m) =>
    [...m.sql.matchAll(/GRANT\s+UPDATE\s*\(([^)]*)\)\s+ON\s+"helpdesk"\."fact_ticket"\s+TO\s+([^;]+);/gi)].map(
      (match) => ({ columns: match[1], roles: match[2] }),
    ),
  );
  const withColumn = grants.filter((grant) => /"id_area_remite"/.test(grant.columns));
  assert.ok(withColumn.length > 0, "coraje_etl necesita UPDATE sobre la columna para la ingesta");
  for (const grant of withColumn) {
    assert.doesNotMatch(grant.roles, /coraje_runtime/, "la aplicación no puede cambiar el área que remite");
  }
});

test("crear_ticket_interno fija el área del solicitante al radicar", () => {
  const body = latestFunctionBody(String.raw`"helpdesk"\."crear_ticket_interno"`);
  assert.match(body, /SELECT\s+persona\.id_area\s+INTO\s+v_id_area_remite\s+FROM\s+core\.dim_personal/i);
  assert.match(body, /INSERT\s+INTO\s+helpdesk\.fact_ticket[\s\S]*?\(\s*[\s\S]*?\bid_area_remite\b[\s\S]*?\)\s*VALUES/i);
  assert.match(body, /VALUES\s*\([\s\S]*?\bv_id_area_remite\b/i);
});

test("la 06 toma el área que remite del ítem de SharePoint", () => {
  assert.match(transform06, /arem\.id_area\s+AS\s+id_area_remite/i);
  assert.match(
    transform06,
    /LEFT\s+JOIN\s+core\.dim_area\s+arem\s+ON\s+core\.norm_text\(arem\.nombre_area\)\s*=\s*core\.norm_text\(s\.payload->>'OData__x00c1_rea_Remite'\)/i,
  );
  // Ninguna asignación desde el directorio de personal (el defecto original).
  assert.doesNotMatch(transform06, /\b(?:sol|p|persona|dp)\.id_area\s+AS\s+id_area_remite/i);
});

test("la 06 reescribe el área que remite cuando cambia en SharePoint", () => {
  assert.match(transform06, /id_area_remite\s*=\s*EXCLUDED\.id_area_remite/i);
  // Sin la columna en el IS DISTINCT FROM, un cambio solo de Área_Remite no
  // reescribiría el ticket, y el llenado inicial de los 3.088 no ocurriría.
  assert.match(transform06, /destino\.id_area_remite\s*,[\s\S]*?\)\s*IS\s+DISTINCT\s+FROM\s*\([\s\S]*?EXCLUDED\.id_area_remite\s*,/i);
});
