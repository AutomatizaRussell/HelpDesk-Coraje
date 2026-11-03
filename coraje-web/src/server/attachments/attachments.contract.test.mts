import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ATTACHMENTS_FOLDER } from "./attachment-rules";

/**
 * Contrato de los adjuntos (U7, specs/tickets.md §14) en lo que se puede ver
 * antes de desplegar: la copia versionada del workflow y la migración. Que
 * Graph se comporte como se espera solo se sabe contra el OneDrive real
 * (guion de cierre, §14.7).
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(THIS_DIR, "../../..");
const REPO_DIR = path.resolve(WEB_DIR, "..");

type Node = { name: string; type: string; parameters: Record<string, unknown>; credentials?: Record<string, { name: string }> };
const WORKFLOW = JSON.parse(readFileSync(path.join(REPO_DIR, "n8n/HELPDESK - Adjuntos V1.json"), "utf8")) as {
  nodes: Node[];
  settings: Record<string, unknown>;
};
const MIGRATION = readFileSync(path.join(WEB_DIR, "prisma/migrations/20261103130000_adjuntos_ticket/migration.sql"), "utf8");
const BROKER = readFileSync(path.join(THIS_DIR, "attachment-broker.ts"), "utf8");

test("cinco webhooks, los que llama attachment-broker.ts, con su credencial Header Auth", () => {
  const webhooks = WORKFLOW.nodes.filter((node) => node.type === "n8n-nodes-base.webhook");
  assert.deepEqual(webhooks.map((node) => node.parameters.path).sort(), [
    "helpdesk/adjuntos/confirmar",
    "helpdesk/adjuntos/descarga",
    "helpdesk/adjuntos/organizar",
    "helpdesk/adjuntos/sesion",
    "helpdesk/adjuntos/vista",
  ]);
  for (const node of webhooks) {
    assert.equal(node.credentials?.httpHeaderAuth?.name, "HelpDesk adjuntos · x-helpdesk-secret");
  }
  for (const operation of ["sesion", "confirmar", "descarga", "vista", "organizar"]) {
    assert.match(BROKER, new RegExp(`"${operation}"`), `el broker no llama a ${operation}`);
  }
});

test("Graph solo en el OneDrive de la credencial, y sin enlaces compartidos (§14.1)", () => {
  const graph = WORKFLOW.nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
  // sesión, confirmar, descarga, vista, y crear, leer y mover en la carpeta del ticket.
  assert.equal(graph.length, 7);
  for (const node of graph) {
    assert.match(String(node.parameters.url), /graph\.microsoft\.com\/v1\.0\/me\/drive\//, `${node.name} sale de /me/drive`);
    assert.equal(node.credentials?.microsoftOAuth2Api?.name, "Graph info.admingct");
  }
  // Impulsa publica un enlace para toda la organización; aquí la descarga la decide HelpDesk.
  assert.doesNotMatch(JSON.stringify(WORKFLOW), /createLink/);
});

test("la carpeta del ticket se crea sin reemplazar la que ya existe (U29)", () => {
  const create = WORKFLOW.nodes.find((node) => node.name === "Graph - Crear carpeta del ticket");
  assert.match(String(create?.parameters.jsonBody), /conflictBehavior': 'fail'/);
  // «replace» borraría los adjuntos de un envío anterior del mismo ticket.
  assert.doesNotMatch(JSON.stringify(WORKFLOW), /conflictBehavior': 'replace'/);
});

test("la descarga pide el objeto sin $select, para que Graph incluya la URL", () => {
  const download = WORKFLOW.nodes.find((node) => node.name === "Graph - Consultar descarga");
  assert.doesNotMatch(String(download?.parameters.url), /\$select/);
});

test("las ejecuciones no se guardan: llevan credenciales temporales", () => {
  assert.equal(WORKFLOW.settings.saveDataSuccessExecution, "none");
  assert.equal(WORKFLOW.settings.saveDataErrorExecution, "none");
});

test("la carpeta autorizada es la misma en la aplicación y en la comparación del workflow", () => {
  assert.equal(ATTACHMENTS_FOLDER, "Documentación Nube/HelpDesk/Adjuntos");
  assert.match(BROKER, /folderPath: ATTACHMENTS_FOLDER/);
});

test("un adjunto es constancia: la aplicación lo inserta y lo lee, y nada más", () => {
  assert.match(MIGRATION, /REVOKE ALL ON "helpdesk"\."ticket_adjunto" FROM "coraje_runtime", "coraje_etl";/);
  assert.match(MIGRATION, /GRANT SELECT, INSERT ON "helpdesk"\."ticket_adjunto" TO "coraje_runtime";/);
  assert.match(MIGRATION, /FOREIGN KEY \("id_evento", "id_ticket"\) REFERENCES "helpdesk"\."fact_ticket_evento"\("id_evento", "id_ticket"\)/);
});
