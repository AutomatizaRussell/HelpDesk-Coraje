import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato entre la app y el paquete aislado del servicio `migrate` (U26).
 *
 * `migrator/` tiene su propio `package.json` y su propio lockfile para que la
 * imagen de `migrate` lleve solo el CLI de Prisma (~160 MB) y no el
 * `node_modules` entero de la app (~700 MB). No puede ser un paquete del
 * workspace de `coraje-web/`: pnpm incluye siempre la raíz del workspace en
 * una instalación filtrada o en `pnpm deploy`, y la raíz es la app.
 *
 * El precio de dos lockfiles es que pueden divergir: subir Prisma en la app y
 * olvidar `migrator/` aplicaría las migraciones con un CLI distinto del que
 * las generó. Esta prueba lo impide comparando versiones resueltas, no
 * especificadores: la app declara `^7.8.0`, el migrador la versión exacta.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(THIS_DIR, "../..");
const MIGRATOR_DIR = path.join(APP_DIR, "migrator");

const SHARED = ["prisma", "dotenv"] as const;

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/**
 * Versión que el lockfile de la app resolvió para `name` en el importador
 * raíz (`.`). El lockfile anota los pares resueltos como sufijo entre
 * paréntesis (`7.8.0(@types/react@…)`); solo cuenta la versión.
 */
function appResolvedVersion(name: string): string {
  const lock = readFileSync(path.join(APP_DIR, "pnpm-lock.yaml"), "utf8");
  const root = lock.split(/\n {2}migrator:\n|\npackages:\n/)[0];
  const match = root.match(new RegExp(`\\n {6}${name}:\\n {8}specifier: [^\\n]+\\n {8}version: ([^(\\n]+)`));
  assert.ok(match, `${name} no aparece en el importador raíz de pnpm-lock.yaml`);
  return match[1];
}

test("migrator/ fija las mismas versiones que resolvió la app", () => {
  const deps = readJson(path.join(MIGRATOR_DIR, "package.json")).dependencies as Record<string, string>;
  for (const name of SHARED) {
    assert.equal(deps[name], appResolvedVersion(name), `${name} difiere entre la app y migrator/`);
  }
});

test("migrator/ usa la misma versión de pnpm que la app", () => {
  const app = readJson(path.join(APP_DIR, "package.json")).packageManager;
  const migrator = readJson(path.join(MIGRATOR_DIR, "package.json")).packageManager;
  assert.equal(migrator, app);
});

test("el lockfile de migrator/ resuelve las versiones que fija su package.json", () => {
  const lock = readFileSync(path.join(MIGRATOR_DIR, "pnpm-lock.yaml"), "utf8");
  const deps = readJson(path.join(MIGRATOR_DIR, "package.json")).dependencies as Record<string, string>;
  for (const name of SHARED) {
    assert.match(lock, new RegExp(`\\n {2}${name}@${deps[name].replaceAll(".", "\\.")}:`), `${name} sin resolver`);
  }
});
