import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato de la visibilidad por recepción (permisos.md §4.5): quien recibe
 * un ticket nuevo tiene que verlo en su bandeja. Lo recibe según
 * `helpdesk.resolver_responsable_tipo`; lo ve según `recepcion.ts`. Si las dos
 * reglas se separan, la persona recibiría el correo de un ticket que no puede
 * abrir. No se puede probar sin base, así que se exige que las dos escriban la
 * misma expresión.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(THIS_DIR, "../../..");
const MIGRATIONS_DIR = path.join(WEB_DIR, "prisma/migrations");
const RECEPCION = readFileSync(path.join(THIS_DIR, "recepcion.ts"), "utf8");

const RULE = "LOWER(BTRIM(COALESCE(regla.encargado_interno, area.encargado_recepcion)))";

/** La definición vigente: la de la última migración que crea o reemplaza la función. */
function latestResolver(): string {
  const definitions = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    // migration_lock.toml vive junto a las carpetas y no es una migración.
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((dir) => readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"))
    .flatMap((sql) => {
      const start = sql.search(/CREATE (?:OR REPLACE )?FUNCTION "helpdesk"\."resolver_responsable_tipo"/);
      if (start < 0) return [];
      const end = sql.indexOf("$function$;", start);
      return [sql.slice(start, end)];
    });
  const latest = definitions.at(-1);
  assert.ok(latest, "no se encontró helpdesk.resolver_responsable_tipo en las migraciones");
  return latest;
}

test("la bandeja y la asignación usan la misma regla para decidir quién recibe", () => {
  assert.ok(latestResolver().includes(RULE), "resolver_responsable_tipo ya no usa la regla esperada");
  assert.ok(RECEPCION.includes(RULE), "recepcion.ts ya no usa la regla de resolver_responsable_tipo");
  assert.match(RECEPCION, /regla\.activo/);
});

test("AGENTE se renombra sin borrar filas, y ADMIN consulta todo", () => {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, "20260930100000_rol_colaborador/migration.sql"), "utf8").replace(/--[^\n]*/g, "");
  assert.match(sql, /ALTER TYPE "core"\."rol_aplicacion" RENAME VALUE 'AGENTE' TO 'COLABORADOR';/);
  assert.match(sql, /SET "alcance" = 'TOTAL'[^;]*WHERE "rol" = 'ADMIN' AND "codigo_accion" = 'ticket\.consultar';/);
  assert.doesNotMatch(sql, /\bDELETE\b|\bDROP\b/);
});
