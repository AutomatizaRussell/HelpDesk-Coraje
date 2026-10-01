import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrato de los workflows versionados en `n8n/` (decisión del usuario del
 * 01-oct-2026, igual que Impulsa): **ningún secreto vive en variables de
 * entorno de n8n**. Cada secreto compartido con HelpDesk es una credencial
 * *Header Auth*: cifrada, fuera de las exportaciones y de las expresiones, y
 * sin reiniciar la instancia para cambiarla.
 *
 * - Ningún workflow lee `$env`.
 * - Todo webhook se autentica con *Header Auth*: n8n rechaza con 403 sin
 *   ejecutar nada, en vez de un nodo IF que compara a mano.
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const N8N_DIR = path.resolve(THIS_DIR, "../../../n8n");

type Node = { name: string; type: string; parameters?: Record<string, unknown>; credentials?: Record<string, unknown> };
type Workflow = { name: string; nodes: Node[] };

const workflows = readdirSync(N8N_DIR)
  .filter((file) => file.endsWith(".json"))
  .map((file) => ({ file, workflow: JSON.parse(readFileSync(path.join(N8N_DIR, file), "utf8")) as Workflow }));

test("se encontraron los workflows del repositorio", () => {
  assert.ok(workflows.length >= 5, `Solo ${workflows.length} workflows en n8n/`);
});

test("ningún workflow lee variables de entorno de n8n", () => {
  const offenders = workflows.flatMap(({ file, workflow }) =>
    workflow.nodes.filter((node) => JSON.stringify(node.parameters ?? {}).includes("$env")).map((node) => `${file} → ${node.name}`),
  );
  assert.deepEqual(offenders, [], "Nodos que leen $env: usa una credencial Header Auth");
});

test("todo webhook se autentica con una credencial Header Auth", () => {
  const offenders = workflows.flatMap(({ file, workflow }) =>
    workflow.nodes
      .filter((node) => node.type === "n8n-nodes-base.webhook")
      .filter((node) => node.parameters?.authentication !== "headerAuth" || !node.credentials?.httpHeaderAuth)
      .map((node) => `${file} → ${node.name}`),
  );
  assert.deepEqual(offenders, [], "Webhooks sin Header Auth");
});
