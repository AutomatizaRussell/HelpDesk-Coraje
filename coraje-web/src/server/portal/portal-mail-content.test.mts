import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCodeMail, buildInvitationMail } from "./portal-mail-content";

test("la invitación lleva el enlace y escapa lo que escribió una persona", () => {
  const { html } = buildInvitationMail({
    nombreContacto: `Ana <a href="https://phish.example">clic</a>`,
    nombreCliente: "ACME & Cía",
    url: "https://conecta.rbgct.cloud/helpdesk/portal/activar/abc",
    venceEl: "12 oct 2026",
  });
  assert.match(html, /href="https:\/\/conecta\.rbgct\.cloud\/helpdesk\/portal\/activar\/abc"/);
  assert.doesNotMatch(html, /phish\.example">/);
  assert.match(html, /ACME &amp; Cía/);
});

test("el correo del código lleva el código y su vigencia", () => {
  const { html, subject } = buildCodeMail({ nombreContacto: "Ana", codigo: "042917" });
  assert.match(html, /042917/);
  assert.match(html, /10 minutos/);
  // El asunto no lleva el código: se ve en la bandeja de entrada, en la
  // vista previa del teléfono y en los registros de muchos servidores.
  assert.doesNotMatch(subject, /042917/);
});
