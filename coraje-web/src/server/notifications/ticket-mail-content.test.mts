import { test } from "node:test";
import assert from "node:assert/strict";

import { buildTicketMail, escapeHtml, type TicketMailContext } from "./ticket-mail-content";

const base: TicketMailContext = {
  codigo: "TI-2026-0001",
  descripcion: "No abre el correo",
  area: "Proyectos y TI",
  tipo: "Soporte",
  solicitante: "Ana Pérez",
  remitente: "Luis Gómez",
  responsable: "Marta Ruiz",
  texto: null,
  vence: "30 sept 2026",
  url: "https://conecta.rbgct.cloud/helpdesk/tickets/abc",
};

test("el texto de una persona no entra como HTML activo", () => {
  const { html } = buildTicketMail("CREACION_RESPONSABLE", {
    ...base,
    descripcion: '<script>alert(1)</script><a href="https://malo">aquí</a>',
    solicitante: "<b>Ana</b>",
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes('href="https://malo"'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;b&gt;Ana&lt;/b&gt;"));
});

test("el comentario interno de una reasignación nunca llega a quien radicó", () => {
  const ctx = { ...base, texto: "El cliente es difícil, ojo" };
  assert.ok(buildTicketMail("REASIGNACION_RESPONSABLE", ctx).html.includes("El cliente es difícil"));
  assert.ok(!buildTicketMail("REASIGNACION_SOLICITANTE", ctx).html.includes("El cliente es difícil"));
});

test("la respuesta y el motivo del rechazo van en el correo del solicitante, con el enlace", () => {
  const respuesta = buildTicketMail("RESPUESTA_SOLICITANTE", { ...base, texto: "Listo,\nreinicia el equipo" });
  assert.match(respuesta.subject, /TI-2026-0001/);
  assert.ok(respuesta.html.includes("Listo,<br>reinicia el equipo"));
  assert.ok(respuesta.html.includes('href="https://conecta.rbgct.cloud/helpdesk/tickets/abc"'));

  const rechazo = buildTicketMail("RECHAZO_SOLICITANTE", { ...base, texto: "No corresponde al área" });
  assert.ok(rechazo.html.includes("No corresponde al área"));
});

test("escapeHtml cubre las comillas, para que un valor no salga de su atributo", () => {
  assert.equal(escapeHtml(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
});
