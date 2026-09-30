import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTicketMail, escapeHtml, type TicketMailContext } from "./ticket-mail-content";

const base: TicketMailContext = {
  codigo: "TI-2026-0001",
  remitente: "Luis Gómez",
  texto: null,
  url: "https://conecta.rbgct.cloud/helpdesk/portal/tickets/abc",
};

test("el texto de una persona no entra como HTML activo", () => {
  const { html } = buildTicketMail("RESPUESTA_CLIENTE", {
    ...base,
    texto: '<script>alert(1)</script><a href="https://malo">aquí</a>',
    remitente: "<b>Luis</b>",
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="https://malo"'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;b&gt;Luis&lt;/b&gt;"));
});

test("la respuesta y el motivo del rechazo van en el correo del contacto, con el enlace al portal", () => {
  const respuesta = buildTicketMail("RESPUESTA_CLIENTE", { ...base, texto: "Listo,\nya quedó" });
  assert.match(respuesta.subject, /TI-2026-0001/);
  assert.ok(respuesta.html.includes("Listo,<br>ya quedó"));
  assert.ok(respuesta.html.includes('href="https://conecta.rbgct.cloud/helpdesk/portal/tickets/abc"'));

  const rechazo = buildTicketMail("RECHAZO_CLIENTE", { ...base, texto: "No corresponde" });
  assert.ok(rechazo.html.includes("No corresponde"));
});

test("escapeHtml cubre las comillas, para que un valor no salga de su atributo", () => {
  assert.equal(escapeHtml(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
});
