import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TICKET_ACTIONS } from "../authorization/catalog";
import { isTicketWithinScope } from "../authorization/scope";

/**
 * Contrato del acceso de clientes y de los tickets del portal (U8) en lo que
 * se puede ver antes de desplegar. Lo que la base hace cumplir —privilegios,
 * CHECK, índices únicos— se ejercita contra la base desplegada; aquí se
 * comprueba que el repositorio no lo contradiga.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, "../..");
const WEB_DIR = path.resolve(SRC_DIR, "..");
const MIGRATIONS = path.join(WEB_DIR, "prisma/migrations");
const VALUES_MIGRATION = readFileSync(path.join(MIGRATIONS, "20260928100000_valores_acceso_clientes/migration.sql"), "utf8");
const MIGRATION = readFileSync(path.join(MIGRATIONS, "20260928110000_acceso_clientes/migration.sql"), "utf8");
const WORKFLOW = JSON.parse(
  readFileSync(path.resolve(WEB_DIR, "../n8n/HELPDESK - Portal - Enviar correo V3.json"), "utf8"),
) as { settings: Record<string, unknown>; nodes: { name: string; type: string; parameters?: Record<string, unknown> }[] };

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

function functionBody(name: string): string {
  const match = MIGRATION.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION "helpdesk"\\."${name}"\\([\\s\\S]*?\\$function\\$;`));
  assert.ok(match, `la migración debe definir helpdesk.${name}`);
  return match[0];
}

test("los valores nuevos de enum van solos en su propio archivo", () => {
  // Prisma envuelve cada migración en una transacción, y un valor añadido no
  // se puede usar en la transacción que lo crea (tickets.md §6).
  const statements = stripSqlComments(VALUES_MIGRATION)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(statements.length > 0);
  for (const statement of statements) assert.match(statement, /^ALTER TYPE "\w+"\."\w+" ADD VALUE '[A-Z_]+'$/);
  assert.match(VALUES_MIGRATION, /ADD VALUE 'CLIENTE'/);
  assert.match(VALUES_MIGRATION, /ADD VALUE 'CLASIFICADOR'/);
  assert.match(VALUES_MIGRATION, /ADD VALUE 'ADMIN'/);
});

test("ningún secreto del portal tiene columna en claro: solo hashes", () => {
  const sql = stripSqlComments(MIGRATION);
  for (const column of ["token_hash", "code_hash", "credential_hash"]) {
    assert.match(sql, new RegExp(`"${column}" CHAR\\(64\\) NOT NULL`), `${column} debe ser un hash de 64 hex`);
  }
  assert.doesNotMatch(sql, /"(?:token|codigo|code|credential|otp)" /, "una columna con el secreto en claro");
});

test("las funciones nuevas corren como su dueño, con search_path fijado, y no quedan abiertas a PUBLIC", () => {
  for (const name of ["crear_ticket_cliente", "redirigir_ticket", "resolver_responsable_tipo", "registrar_evento_ticket"]) {
    const body = functionBody(name);
    assert.match(body, /SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/, `${name}: SECURITY DEFINER con search_path`);
    assert.match(MIGRATION, new RegExp(`REVOKE ALL ON FUNCTION "helpdesk"\\."${name}"\\(`), `${name}: sin REVOKE de PUBLIC`);
  }
});

test("redirigir no escribe el outbox por su cuenta: el espejo lo encola un solo trigger (U9)", () => {
  const body = stripSqlComments(functionBody("redirigir_ticket"));
  assert.doesNotMatch(body, /ticket_sync_outbox/);
});

test("el cliente solo radica: el escritor rechaza cualquier otro evento de CLIENTE", () => {
  const body = functionBody("registrar_evento_ticket");
  assert.match(body, /p_tipo_actor = 'CLIENTE' AND p_tipo_evento <> 'CREACION'/);
  assert.match(body, /p_tipo_actor = 'CLIENTE' AND p_estado_nuevo <> 'ABIERTO'/);
});

test("el plazo del cliente es de 3 días hábiles y empieza al redirigir, no al radicar", () => {
  assert.match(functionBody("redirigir_ticket"), /c_dias_cliente CONSTANT INTEGER := 3/);
  assert.doesNotMatch(stripSqlComments(functionBody("crear_ticket_cliente")), /fecha_limite/);
});

test("la auditoría del portal solo crece", () => {
  assert.match(MIGRATION, /GRANT SELECT, INSERT ON "app"\."portal_auditoria" TO "coraje_runtime";/);
  assert.doesNotMatch(MIGRATION, /GRANT[^;]*(?:UPDATE|DELETE)[^;]*"app"\."portal_auditoria"/);
});

test("un ticket sin clasificar solo lo cubre el alcance TOTAL de ticket.redirigir", () => {
  // Aunque reciba un área y un tipo: un ticket sin clasificar no tiene ninguno.
  const actor = { idPersonal: "p", idArea: "a", recepcion: { idTiposReq: ["t"], idAreas: ["a"] } };
  const ticket = { idSolicitante: null, idAsignado: null, idAreaDestino: null, idTipoReq: null, idObservadores: [] };
  const action = TICKET_ACTIONS.redirigir;
  assert.equal(isTicketWithinScope({ alcance: "PROPIO", action, actor, ticket }), false);
  assert.equal(isTicketWithinScope({ alcance: "AREA", action, actor, ticket }), false);
  assert.equal(isTicketWithinScope({ alcance: "TOTAL", action, actor, ticket }), true);
  assert.match(MIGRATION, /\('CLASIFICADOR', 'ticket\.redirigir', 'TOTAL'\)/);
  assert.match(MIGRATION, /\('ADMIN', 'portal\.acceso\.administrar', 'TOTAL'\)/);
});

test("CLASIFICADOR se renombra a REDIRECTOR sin tocar sus reglas (U17)", () => {
  // RENAME VALUE y nada más: la regla de arriba sigue siendo de quien la tenía.
  const sql = stripSqlComments(readFileSync(path.join(MIGRATIONS, "20261001100000_rol_redirector/migration.sql"), "utf8")).trim();
  assert.equal(sql, `ALTER TYPE "core"."rol_aplicacion" RENAME VALUE 'CLASIFICADOR' TO 'REDIRECTOR';`);
});

test("el workflow de correo del portal no guarda los datos de sus ejecuciones", () => {
  // El cuerpo lleva un código o un enlace de un solo uso (observación B8 de
  // Impulsa): n8n no debe conservarlo, dependa o no de la instancia.
  assert.equal(WORKFLOW.settings.saveDataSuccessExecution, "none");
  assert.equal(WORKFLOW.settings.saveDataErrorExecution, "none");
  assert.equal(WORKFLOW.settings.saveManualExecutions, false);
  const code = WORKFLOW.nodes.find((node) => node.type === "n8n-nodes-base.code")?.parameters?.jsCode;
  assert.match(String(code), /saveToSentItems: false/);
});

test("el correo sale desde el buzón compartido, no desde quien autorizó la credencial", () => {
  // El buzón no tiene inicio de sesión propio (01-oct-2026): la credencial la
  // autoriza una persona con Send As. Con /me, el correo saldría de esa persona.
  const http = WORKFLOW.nodes.find((node) => node.name === "HTTP - Graph sendMail");
  assert.equal(http?.parameters?.url, "https://graph.microsoft.com/v1.0/users/automatizacionmedellin@rbcol.co/sendMail");
});

/** Archivos de src/server/portal sin pruebas. */
function portalSources(): { file: string; text: string }[] {
  return readdirSync(THIS_DIR)
    .filter((name) => /\.ts$/.test(name) && statSync(path.join(THIS_DIR, name)).isFile())
    .map((name) => ({ file: name, text: readFileSync(path.join(THIS_DIR, name), "utf8") }));
}

test("la auditoría del portal no recibe secretos", () => {
  // Detector sencillo, con su límite declarado: mira las claves de los
  // objetos `metadata` de src/server/portal. Un secreto con otro nombre no lo
  // vería; la regla la sostiene sobre todo la revisión (portal-audit.ts).
  const offenders = portalSources().filter(({ text }) =>
    [...text.matchAll(/metadata:\s*\{([^}]*)\}/g)].some((match) => /\b(?:code|codigo|token|credential)\s*[:,}]/.test(match[1])),
  );
  assert.deepEqual(offenders.map((o) => o.file), []);
});
