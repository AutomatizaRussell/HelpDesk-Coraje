import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { helpdeskEmailTheme } from "@/design-system/themes/helpdesk-email";
import { isPublicAssetPath } from "@/server/security/public-assets";

import { MAIL_LOGO, renderMail, type MailBlock } from "./mail-layout";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../public");

const hostile = '<script>alert(1)</script><a href="https://malo">aquí</a>';
const everyBlock: MailBlock[] = [
  { kind: "greeting", name: hostile },
  { kind: "title", text: hostile },
  { kind: "paragraph", parts: [hostile, { strong: hostile }] },
  { kind: "quote", label: hostile, text: `${hostile}\nsegunda línea` },
  { kind: "button", label: hostile, href: 'https://bien.example/x"onmouseover="alert(1)' },
  { kind: "code", value: hostile },
  { kind: "note", text: hostile },
];

test("ningún bloque deja pasar HTML activo ni rompe un atributo", () => {
  const html = renderMail(hostile, everyBlock);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="https://malo"'));
  assert.ok(!html.includes('"onmouseover="'));
  assert.ok(html.includes("&lt;script&gt;"));
  // Los saltos de línea de la cita se conservan.
  assert.ok(html.includes("&lt;/a&gt;<br>segunda línea"));
});

test("todo color del correo sale del tema de correo", () => {
  const html = renderMail("Asunto", everyBlock);
  const allowed = new Set(Object.values(helpdeskEmailTheme.color).map((value) => value.toLowerCase()));
  const used = new Set([...html.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toLowerCase()));
  assert.deepEqual([...used].filter((value) => !allowed.has(value)), []);
});

test("el logotipo existe con las medidas declaradas y se sirve sin sesión", () => {
  // El correo declara alto y ancho porque Outlook ignora el tamaño CSS de una
  // imagen; si el archivo cambia, la proporción tiene que cambiar con él.
  const png = readFileSync(path.join(PUBLIC_DIR, MAIL_LOGO.path));
  assert.equal(png.readUInt32BE(16), MAIL_LOGO.width);
  assert.equal(png.readUInt32BE(20), MAIL_LOGO.height);
  assert.ok(isPublicAssetPath(MAIL_LOGO.path), "el cliente de correo lo pide sin sesión");

  const html = renderMail("Asunto", [{ kind: "paragraph", parts: ["x"] }]);
  assert.ok(html.includes(`src="https://conecta.rbgct.cloud/helpdesk${MAIL_LOGO.path}"`));
});
