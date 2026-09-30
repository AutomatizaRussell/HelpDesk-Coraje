import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { NOTICE_CLASS, RESPONSIBLE_NOTICE_KINDS } from "./ticket-notice-kinds";

/**
 * Contrato entre la tabla de tipos de aviso (TypeScript) y la migración que
 * la materializa en la base. Si divergen, la aplicación escribiría un tipo
 * que el CHECK rechaza —una acción que falla entera por su aviso— o la base
 * cerraría pendientes con otra regla que la que la vista explica.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(THIS_DIR, "../../../prisma/migrations/20260930120000_avisos_ticket/migration.sql");
const sql = readFileSync(MIGRATION, "utf8");

/** Los literales entre comillas simples de un fragmento de SQL. */
function literals(fragment: string): string[] {
  return [...fragment.matchAll(/'([A-Z_]+)'/g)].map((match) => match[1]);
}

function between(start: RegExp, end: RegExp): string {
  const from = sql.search(start);
  assert.ok(from >= 0, `No se encontró ${start} en la migración`);
  const rest = sql.slice(from);
  const to = rest.search(end);
  assert.ok(to >= 0, `No se encontró el final de ${start}`);
  return rest.slice(0, to);
}

const allKinds = Object.keys(NOTICE_CLASS).sort();
const attentionKinds = Object.entries(NOTICE_CLASS)
  .filter(([, clase]) => clase === "ATENCION")
  .map(([kind]) => kind)
  .sort();

test("el CHECK de tipo admite exactamente los tipos de la tabla", () => {
  const check = between(/CONSTRAINT "chk_ticket_aviso_tipo"/, /\)\),/);
  assert.deepEqual(literals(check).sort(), allKinds);
});

test("el CHECK de clase marca como ATENCION exactamente los mismos tipos", () => {
  const check = between(/CONSTRAINT "chk_ticket_aviso_clase"/, /THEN 'ATENCION'/);
  assert.deepEqual(literals(check).sort(), attentionKinds);
});

test("el trigger cierra, al cambiar de responsable, exactamente los avisos de responsable", () => {
  const trigger = between(/CREATE FUNCTION "helpdesk"\."resolver_avisos_ticket"/, /\$function\$;/);
  const tipos = trigger.match(/tipo IN \(([^)]*)\)/)?.[1] ?? "";
  assert.deepEqual(literals(tipos).sort(), [...RESPONSIBLE_NOTICE_KINDS].sort());
  // Todo aviso de responsable es de atención: una novedad no se cierra.
  for (const kind of RESPONSIBLE_NOTICE_KINDS) assert.equal(NOTICE_CLASS[kind], "ATENCION");
});

test("el permiso de los avisos está sembrado para los tres roles con alcance PROPIO", () => {
  const seed = between(/INSERT INTO "app"\."permiso_regla"/, /;\s*$/);
  assert.match(seed, /'aviso\.consultar', 'PROPIO'/);
  for (const rol of ["COLABORADOR", "CLASIFICADOR", "ADMIN"]) assert.ok(seed.includes(`'${rol}'`), `Falta ${rol}`);
});
