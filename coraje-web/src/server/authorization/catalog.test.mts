import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TICKET_ACTIONS } from "./catalog";

/**
 * Criterios de aceptación de specs/permisos.md §7 que se pueden comprobar sin
 * base de datos:
 * - cada acción del catálogo de código está sembrada en `app.permiso_accion`;
 * - cada acción se consulta en algún servicio (presencia en el catálogo no es
 *   autorización aplicada);
 * - no hay comparaciones de rol fuera del autorizador.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, "../..");
const MIGRATIONS_DIR = path.resolve(SRC_DIR, "../prisma/migrations");

const migrationsSql = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(path.join(MIGRATIONS_DIR, entry.name, "migration.sql"), "utf8"))
  .join("\n");

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

const sources = listSourceFiles(SRC_DIR).map((file) => ({
  file: path.relative(SRC_DIR, file).split(path.sep).join("/"),
  text: readFileSync(file, "utf8"),
}));

test("cada acción del catálogo de código está sembrada en app.permiso_accion", () => {
  const missing = Object.values(TICKET_ACTIONS).filter((code) => !migrationsSql.includes(`('${code}'`));
  assert.deepEqual(missing, [], "Acciones sin fila en app.permiso_accion");
});

test("cada acción del catálogo se consulta en algún servicio", () => {
  const consulted = sources
    .filter(({ file }) => file !== "server/authorization/catalog.ts")
    .map(({ text }) => text)
    .join("\n");
  // `reenviarNotificacion` la consulta el envío de correo (D6).
  const unused = Object.keys(TICKET_ACTIONS).filter((key) => !consulted.includes(`TICKET_ACTIONS.${key}`));
  assert.deepEqual(unused, [], "Acciones del catálogo que ningún servicio consulta");
});

test("ninguna comparación de rol fuera del autorizador y la admisión", () => {
  // La admisión (employee-admission.ts) comprueba que el rol exista, no cuál
  // es. El autorizador lo usa para elegir la regla. Nadie más lo compara.
  const allowed = new Set(["server/auth/employee-admission.ts", "server/authorization/authorizer.ts"]);
  const offenders = sources
    .filter(({ file }) => !allowed.has(file) && !file.endsWith(".test.mts"))
    .filter(({ text }) => /rolAplicacion\s*[!=]==|===?\s*["']AGENTE["']|["']AGENTE["']\s*===?/.test(text))
    .map(({ file }) => file);
  assert.deepEqual(offenders, [], "Comparaciones de rol fuera del autorizador");
});
