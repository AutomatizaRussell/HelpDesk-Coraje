import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TICKET_STATES } from "./ticket-state";

/**
 * Contrato del ciclo interno (specs/tickets.md §3.1, §4, §8) en lo que se
 * puede ver antes de desplegar. Lo que la base hace cumplir —el `REVOKE`, el
 * escritor único— se ejercita contra la base desplegada con `SET LOCAL ROLE`;
 * aquí se comprueba que el repositorio no lo contradiga.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, "../..");
const MIGRATION = readFileSync(
  path.resolve(SRC_DIR, "../prisma/migrations/20260926100000_permisos_y_creacion_ticket/migration.sql"),
  "utf8",
);
const BASELINE = readFileSync(path.resolve(SRC_DIR, "../prisma/migrations/20260910000000_baseline/migration.sql"), "utf8");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(?:ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const sources = listSourceFiles(SRC_DIR)
  .filter((file) => !file.endsWith(".test.mts"))
  .map((file) => ({ file: path.relative(SRC_DIR, file).split(path.sep).join("/"), text: readFileSync(file, "utf8") }));

test("la aplicación ya no puede insertar tickets sin pasar por crear_ticket_interno", () => {
  assert.match(MIGRATION, /REVOKE INSERT ON "helpdesk"\."fact_ticket" FROM "coraje_runtime";/);
  assert.match(MIGRATION, /CREATE FUNCTION "helpdesk"\."crear_ticket_interno"/);
  assert.match(MIGRATION, /SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/);
  assert.match(MIGRATION, /REVOKE ALL ON FUNCTION "helpdesk"\."crear_ticket_interno"\(UUID, UUID, TEXT, TEXT\) FROM PUBLIC;/);
});

test("crear_ticket_interno escribe la CREACION con el mismo estado con el que inserta", () => {
  const body = MIGRATION.slice(MIGRATION.indexOf('CREATE FUNCTION "helpdesk"."crear_ticket_interno"'));
  assert.match(body, /nombre_estado = 'ASIGNADO'/);
  assert.match(body, /'CREACION'::helpdesk\.tipo_evento_ticket[\s\S]*?'ASIGNADO'\s*\)/);
});

test("el origen que la aplicación escribe es uno de los que el CHECK admite", () => {
  const allowed = BASELINE.match(/chk_fact_ticket_origen_sistema" CHECK \(origen_sistema = ANY \(ARRAY\[([^\]]*)\]/)?.[1] ?? "";
  assert.match(allowed, /'SISTEMA_INTERNO'/);
  assert.match(MIGRATION, /'SISTEMA_INTERNO',/);
});

test("nadie en src/ escribe fact_ticket_evento ni inserta en fact_ticket por su cuenta", () => {
  const offenders = sources
    .filter(({ text }) =>
      /factTicketEvento\.(?:create|update|upsert|delete)|INSERT\s+INTO\s+helpdesk\.fact_ticket(?:_evento)?\b|factTicket\.create/i.test(text),
    )
    .map(({ file }) => file);
  assert.deepEqual(offenders, [], "Escritura directa del ticket o de su registro de eventos");
});

test("el vocabulario de estados es uno solo (tickets.md §8)", () => {
  // Una segunda lista se reconoce porque nombra juntos un estado abierto y uno
  // terminal. Las autoridades que traducen estado a otra cosa (rótulo, tono)
  // son `Record<TicketState, …>`: el compilador las ata a esta lista.
  const secondLists = sources
    .filter(({ file }) => file !== "server/tickets/ticket-state.ts")
    .filter(({ text }) => /\[\s*"ABIERTO"[^\]]*"CERRADO"/.test(text))
    .map(({ file }) => file);
  assert.deepEqual(secondLists, [], "Otra lista de estados fuera de ticket-state.ts");
  assert.deepEqual([...TICKET_STATES], ["ABIERTO", "ASIGNADO", "CERRADO", "RECHAZADO"]);
});
