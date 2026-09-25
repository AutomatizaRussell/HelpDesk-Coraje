import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato del modelo de eventos del ticket (docs/specs/tickets.md §3, §3.1,
 * §6).
 *
 * La regla la hace cumplir PostgreSQL, no esta suite: el escritor único es
 * una función SECURITY DEFINER y los privilegios de los roles de servicio
 * impiden el camino directo. Esta suite cubre lo que la base no puede ver
 * antes del despliegue: que las tres copias del vocabulario no diverjan y
 * que la copia versionada de la ingesta no vuelva a escribir el registro por
 * su cuenta.
 *
 * - El enum vive en dos sitios escritos a mano: `schema.prisma` y el
 *   `CREATE TYPE` de la migración. Si divergen, Prisma cree que existe un
 *   valor que la base rechaza (o al revés).
 * - Cada tipo de evento necesita su rama en el `CASE` del escritor: un tipo
 *   sin rama falla con CASE_NOT_FOUND en producción, no aquí.
 * - La ingesta de n8n es el segundo escritor. Un INSERT directo en
 *   `fact_ticket_evento` o una asignación de `id_estado` en su SQL fallarían
 *   al retirarse los privilegios, y hasta entonces escribirían sin evento.
 *
 * Límite honesto: `n8n/` es la copia exportada del workflow, no la instancia
 * viva. Lo que esta suite garantiza es que el repositorio no contradiga el
 * contrato; lo que corre en n8n lo garantizan los privilegios.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(THIS_DIR, "../../..");
const REPO_DIR = path.resolve(WEB_DIR, "..");
const SCHEMA = readFileSync(path.join(WEB_DIR, "prisma/schema.prisma"), "utf8");
const MIGRATIONS_DIR = path.join(WEB_DIR, "prisma/migrations");
const INGEST_WORKFLOW = path.join(
  REPO_DIR,
  "n8n/CORAJE - INCREMENTAL COMPLETO - SharePoint to PostgreSQL.json",
);

/** Todas las migraciones concatenadas en orden: un ADD VALUE posterior cuenta. */
const migrationsSql = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) => readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"))
  .join("\n");

function prismaEnumValues(prismaName: string): string[] {
  const match = SCHEMA.match(new RegExp(`enum ${prismaName} \\{([\\s\\S]*?)\\}`));
  assert.ok(match, `schema.prisma debe declarar enum ${prismaName}`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[A-Z_]+$/.test(line));
}

function sqlEnumValues(sqlName: string): string[] {
  const created = migrationsSql.match(
    new RegExp(`CREATE TYPE "helpdesk"\\."${sqlName}" AS ENUM \\(([\\s\\S]*?)\\);`),
  );
  assert.ok(created, `una migración debe crear helpdesk.${sqlName}`);
  const values = [...created[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  const added = [
    ...migrationsSql.matchAll(
      new RegExp(`ALTER TYPE "helpdesk"\\."${sqlName}" ADD VALUE (?:IF NOT EXISTS )?'([A-Z_]+)'`, "g"),
    ),
  ].map((m) => m[1]);
  return [...values, ...added];
}

const ENUMS = [
  ["TipoEventoTicket", "tipo_evento_ticket"],
  ["TipoActorEvento", "tipo_actor_evento"],
  ["VisibilidadEvento", "visibilidad_evento"],
] as const;

for (const [prismaName, sqlName] of ENUMS) {
  test(`${prismaName}: schema.prisma y las migraciones declaran los mismos valores`, () => {
    assert.deepEqual(
      [...prismaEnumValues(prismaName)].sort(),
      [...sqlEnumValues(sqlName)].sort(),
    );
  });
}

/** Cuerpo de la última definición del escritor único en las migraciones. */
function writerBody(): string {
  const definitions = [
    ...migrationsSql.matchAll(
      /CREATE (?:OR REPLACE )?FUNCTION "helpdesk"\."registrar_evento_ticket"\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/g,
    ),
  ];
  assert.ok(definitions.length > 0, "una migración debe definir helpdesk.registrar_evento_ticket");
  return definitions[definitions.length - 1][1];
}

test("el escritor único tiene una rama por cada tipo de evento", () => {
  const body = writerBody();
  const missing = prismaEnumValues("TipoEventoTicket").filter(
    (value) => !new RegExp(`WHEN '${value}' THEN`).test(body),
  );
  assert.deepEqual(missing, [], `tipos sin rama en el CASE del escritor: ${missing.join(", ")}`);
});

test("el escritor único es SECURITY DEFINER con search_path fijado", () => {
  const signature = migrationsSql.match(
    /CREATE (?:OR REPLACE )?FUNCTION "helpdesk"\."registrar_evento_ticket"\([\s\S]*?AS \$function\$/,
  );
  assert.ok(signature);
  assert.match(signature[0], /SECURITY DEFINER/);
  assert.match(signature[0], /SET search_path = pg_catalog, pg_temp/);
});

// ---------------------------------------------------------------------------
// Privilegio de UPDATE por columna sobre fact_ticket
// ---------------------------------------------------------------------------

/** Columnas físicas de un modelo: campos escalares, con su @map si lo tienen. */
function prismaColumns(model: string): string[] {
  const match = SCHEMA.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `schema.prisma debe declarar model ${model}`);
  const scalar = /^\s*(\w+)\s+(String|Int|BigInt|DateTime|Boolean|Decimal|Float|Json)\??\s*(.*)$/;
  return match[1]
    .split("\n")
    .map((line) => line.match(scalar))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[3].match(/@map\("([^"]+)"\)/)?.[1] ?? m[1]);
}

/** Columnas de la última concesión de UPDATE por columna sobre fact_ticket. */
function grantedUpdateColumns(): string[] {
  const grants = [
    ...migrationsSql.matchAll(/GRANT UPDATE \(([\s\S]*?)\) ON "helpdesk"\."fact_ticket" TO/g),
  ];
  assert.ok(grants.length > 0, "una migración debe conceder UPDATE por columna sobre fact_ticket");
  return [...grants[grants.length - 1][1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

test("los roles de servicio pueden actualizar toda columna de fact_ticket salvo id_estado", () => {
  // Un REVOKE de columna no anula un UPDATE de tabla, así que la protección de
  // id_estado es una lista explícita de columnas concedidas. Una columna nueva
  // obliga a decidir si se concede: esta prueba falla hasta que se decida.
  const expected = prismaColumns("FactTicket").filter((column) => column !== "id_estado").sort();
  const granted = grantedUpdateColumns();
  assert.ok(!granted.includes("id_estado"), "id_estado no puede estar en la concesión de UPDATE");
  assert.deepEqual([...granted].sort(), expected);
});

// ---------------------------------------------------------------------------
// La ingesta versionada no escribe el registro ni el estado por su cuenta
// ---------------------------------------------------------------------------

type N8nNode = { name: string; parameters?: { query?: unknown } };

const ingestQueries = (JSON.parse(readFileSync(INGEST_WORKFLOW, "utf8")) as { nodes: N8nNode[] }).nodes
  .filter((node) => typeof node.parameters?.query === "string")
  .map((node) => ({ name: node.name, sql: stripSqlComments(node.parameters!.query as string) }));

/** Quita comentarios de línea para que un «no hacer X» escrito en prosa no cuente como X. */
function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Detectores con ejemplos positivos y negativos: uno que nunca dispara no demuestra nada. */
const directEventInsert = /INSERT\s+INTO\s+helpdesk\.fact_ticket_evento\b/i;
// Una asignación (SET id_estado = …) nombra la columna sin alias; las
// comparaciones de un JOIN siempre la califican (e.id_estado = f.id_estado).
const stateAssignment = /(?<![.\w])id_estado\s*=(?!=)/i;

test("detectores de escritura directa: disparan donde deben y solo ahí", () => {
  assert.match("INSERT INTO helpdesk.fact_ticket_evento (id_ticket)", directEventInsert);
  assert.doesNotMatch("SELECT helpdesk.registrar_evento_ticket(...)", directEventInsert);
  assert.match("DO UPDATE SET id_estado = EXCLUDED.id_estado", stateAssignment);
  assert.match("UPDATE helpdesk.fact_ticket SET id_estado = x", stateAssignment);
  assert.doesNotMatch("JOIN helpdesk.dim_estado e ON e.id_estado = f.id_estado", stateAssignment);
  assert.doesNotMatch("ON estado_actual.id_estado = f.id_estado", stateAssignment);
});

test("ninguna query de la ingesta inserta directamente en fact_ticket_evento", () => {
  const offenders = ingestQueries.filter((q) => directEventInsert.test(q.sql)).map((q) => q.name);
  assert.deepEqual(offenders, []);
});

test("ninguna query de la ingesta asigna id_estado", () => {
  const offenders = ingestQueries.filter((q) => stateAssignment.test(q.sql)).map((q) => q.name);
  assert.deepEqual(offenders, []);
});
