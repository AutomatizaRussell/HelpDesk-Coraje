import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato entre las variables de entorno que lee el servidor y las que el
 * despliegue le entrega (F7).
 *
 * `docker-compose.yaml` es la lista explícita de lo que `web` necesita: quien
 * despliega lee ahí qué variables tiene que crear en Coolify. Le faltaban
 * cinco de U8, U9 y U15.
 *
 * Corregido el 01-oct-2026: la primera versión de este comentario afirmaba que
 * sin estar en esa lista una variable de Coolify no llegaba al contenedor. Es
 * falso: Coolify inyecta las que tiene definidas (las de `N8N_OUTBOX_KICK_*`
 * llegaban). Lo que faltaba de verdad era crear `N8N_PORTAL_MAIL_*` en Coolify.
 * La prueba vale igual: impide que la lista deje de estar completa.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THIS_DIR, "..");
const COMPOSE = path.resolve(SRC_DIR, "../docker-compose.yaml");

/** Las que pone el propio entorno de ejecución, no el despliegue. */
const RUNTIME_PROVIDED = new Set(["NODE_ENV"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "generated" || entry === "node_modules") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(?:ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Nombres leídos con `process.env.X`, con `requiredEnv("X")`, o con una
 * constante `const K = "X"` que después se lee como `process.env[K]`. Las
 * pruebas (`.mts`) no cuentan: fijan valores, no los leen del despliegue.
 */
function readVariables(): Set<string> {
  const names = new Set<string>();
  for (const file of sourceFiles(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    for (const [, name] of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(name);
    for (const [, name] of source.matchAll(/requiredEnv\("([A-Z][A-Z0-9_]*)"\)/g)) names.add(name);
    for (const [, constant, name] of source.matchAll(/const\s+(\w+)\s*=\s*"([A-Z][A-Z0-9_]*)"/g)) {
      if (source.includes(`process.env[${constant}]`)) names.add(name);
    }
  }
  for (const name of RUNTIME_PROVIDED) names.delete(name);
  return names;
}

/** Las claves del bloque `environment` del servicio `web`. */
function webEnvironment(): Set<string> {
  // Sin retornos de carro: en Windows git deja el archivo con CRLF.
  const compose = readFileSync(COMPOSE, "utf8").replace(/\r\n/g, "\n");
  const web = compose.slice(compose.search(/^ {2}web:/m));
  const block = web.match(/^ {4}environment:\n((?: {6}.*\n|\s*\n)+)/m)?.[1] ?? "";
  return new Set([...block.matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)].map((match) => match[1]));
}

test("el servicio web recibe cada variable de entorno que lee el servidor", () => {
  const read = readVariables();
  const declared = webEnvironment();
  // Si el recorrido dejara de encontrar algo, la prueba pasaría sin comprobar nada.
  assert.ok(read.has("DATABASE_URL") && read.has("HELPDESK_ESCALAR_AVISOS_SECRET"), "No se encontraron las variables leídas");
  assert.ok(declared.has("DATABASE_URL"), "No se pudo leer el environment de web");
  const missing = [...read].filter((name) => !declared.has(name)).sort();
  assert.deepEqual(missing, [], "Variables que el código lee y el compose no entrega a web");
});
