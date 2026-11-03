import { test } from "node:test";
import assert from "node:assert/strict";

import { MAX_ATTACHMENT_BYTES, attachmentProblem, isAllowedName, storedNameFor } from "./attachment-rules";

const CARGA = "3f2a9c1e-7b4d-4e8a-9c0b-1d2e3f4a5b6c";

test("se admite por extensión, sin mirar el MIME del navegador", () => {
  assert.equal(isAllowedName("Informe.PDF"), true);
  assert.equal(isAllowedName("datos.csv"), true);
  assert.equal(isAllowedName("instalador.exe"), false);
  assert.equal(isAllowedName("sin-extension"), false);
});

test("un archivo de 26 MB, uno vacío y un .exe se rechazan nombrando el archivo", () => {
  assert.match(attachmentProblem({ name: "video.zip", size: 26 * 1024 * 1024 }) ?? "", /^video\.zip supera/);
  assert.match(attachmentProblem({ name: "nada.pdf", size: 0 }) ?? "", /^nada\.pdf está vacío/);
  assert.match(attachmentProblem({ name: "setup.exe", size: 10 }) ?? "", /^setup\.exe: ese tipo/);
  assert.equal(attachmentProblem({ name: "ok.pdf", size: MAX_ATTACHMENT_BYTES }), null);
});

test("el nombre guardado lleva el sufijo de la carga antes de la extensión", () => {
  assert.equal(storedNameFor(CARGA, "Factura marzo.pdf"), "Factura marzo-3f2a9c1e7b4d.pdf");
});

test("el nombre guardado no lleva lo que OneDrive no admite ni se pasa de largo", () => {
  const name = storedNameFor(CARGA, `a<b>:c"d/e\\f|g?h*i\u0001. .XLSX`);
  assert.equal(name, "a_b__c_d_e_f_g_h_i_-3f2a9c1e7b4d.xlsx");
  const long = storedNameFor(CARGA, `${"x".repeat(400)}.docx`);
  assert.ok(long.length <= 180, `mide ${long.length}`);
  assert.ok(long.endsWith("-3f2a9c1e7b4d.docx"));
});

test("un nombre que solo tenía caracteres inválidos queda como «archivo»", () => {
  assert.equal(storedNameFor(CARGA, "...pdf"), "archivo-3f2a9c1e7b4d.pdf");
});

test("el mismo id de carga y el mismo nombre dan siempre el mismo nombre guardado", () => {
  assert.equal(storedNameFor(CARGA, "a.png"), storedNameFor(CARGA, "a.png"));
  assert.throws(() => storedNameFor("no-es-uuid", "a.png"));
});
