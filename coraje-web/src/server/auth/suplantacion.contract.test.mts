import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SUPLANTACIÓN — bloque temporal para pruebas. Contrato de lo que se puede
 * ver antes de desplegar: la migración, el único punto de entrada y los
 * delimitadores que hacen retirable el bloque (operacion.md, «Suplantación
 * para pruebas»). Cuando el bloque se retire, esta prueba se retira con él.
 *
 * Límite honesto: que la habilitación funcione, que el cambio se audite y que
 * los correos lleguen solo a quien suplanta se ejercita contra el despliegue.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, "../..");
const WEB_DIR = path.resolve(SRC_DIR, "..");
const MIGRATION = readFileSync(
  path.join(WEB_DIR, "prisma/migrations/20260929100000_suplantacion_pruebas/migration.sql"),
  "utf8",
).replace(/--[^\n]*/g, "");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "generated") found.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.mts")) found.push(full);
  }
  return found;
}

function relative(file: string): string {
  return path.relative(SRC_DIR, file).split(path.sep).join("/");
}

test("la aplicación solo puede leer quién está habilitado: habilitarse es cosa de psql", () => {
  assert.match(MIGRATION, /REVOKE ALL ON "app"\."suplantacion_habilitada" FROM "coraje_runtime", "coraje_etl";/);
  assert.match(MIGRATION, /GRANT SELECT ON "app"\."suplantacion_habilitada" TO "coraje_runtime";/);
});

test("la auditoría solo crece", () => {
  assert.match(MIGRATION, /GRANT SELECT, INSERT ON "app"\."suplantacion_auditoria" TO "coraje_runtime";/);
  assert.doesNotMatch(MIGRATION, /GRANT[^;]*(UPDATE|DELETE)[^;]*"suplantacion_auditoria"/);
});

test("la suplantación muere con la sesión que la sostiene", () => {
  assert.match(MIGRATION, /REFERENCES "app"\."employee_session"\("id"\)\s+ON DELETE CASCADE/);
});

test("la identidad que actúa se resuelve en un solo sitio", () => {
  const callers = sourceFiles(SRC_DIR)
    .filter((file) => readFileSync(file, "utf8").includes("resolveActingEmployee"))
    .map(relative)
    .sort();
  assert.deepEqual(callers, ["server/auth/current-employee.ts", "server/auth/suplantacion.ts"]);
});

test("cada bloque marcado fuera de su módulo abre y cierra, para poder retirarlo entero", () => {
  const OWN_FILES = new Set(["server/auth/suplantacion.ts", "features/suplantacion/actions.ts", "features/suplantacion/SuplantacionSelector.tsx"]);
  const marked = sourceFiles(SRC_DIR).filter((file) => !OWN_FILES.has(relative(file)));
  let blocks = 0;
  for (const file of marked) {
    const text = readFileSync(file, "utf8");
    const opens = (text.match(/SUPLANTACIÓN — bloque temporal/g) ?? []).length;
    const closes = (text.match(/FIN SUPLANTACIÓN/g) ?? []).length;
    // Un comentario de documentación puede nombrar el bloque sin abrirlo
    // (employee-session.ts): basta con que ningún cierre quede huérfano.
    assert.ok(closes <= opens, `${relative(file)} cierra más bloques de SUPLANTACIÓN de los que abre`);
    blocks += closes;
  }
  // Si el recorrido dejara de encontrar los bloques, la prueba pasaría sin
  // comprobar nada.
  assert.ok(blocks >= 5, `se esperaban al menos 5 bloques cerrados, hay ${blocks}`);
});
