import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEscalationMail, describeNotice, excerpt, type NoticeContext } from "./ticket-notice-content";
import { NOTICE_CLASS, type TicketNoticeKind } from "./ticket-notice-kinds";

const base: NoticeContext = {
  codigo: "TI-2026-0001",
  autor: "Luis Gómez",
  descripcion: "No abre el correo",
  textoEvento: "",
};

test("cada tipo de aviso tiene un título que nombra el ticket", () => {
  for (const kind of Object.keys(NOTICE_CLASS) as TicketNoticeKind[]) {
    const { titulo } = describeNotice(kind, base);
    assert.ok(titulo.includes("TI-2026-0001"), `${kind}: ${titulo}`);
  }
});

test("el comentario interno de una reasignación nunca llega a quien radicó", () => {
  const ctx = { ...base, textoEvento: "Reasignado a Marta Ruiz.\n\nEl cliente es difícil, ojo" };
  const solicitante = describeNotice("REASIGNACION_SOLICITANTE", ctx);
  assert.ok(!solicitante.titulo.includes("difícil"));
  assert.ok(!solicitante.detalle.includes("difícil"));
  assert.equal(solicitante.detalle, "No abre el correo");
});

test("la respuesta, el motivo y la solicitud de validación van en el detalle", () => {
  const ctx = { ...base, textoEvento: "Listo,\nreinicia el equipo" };
  assert.equal(describeNotice("RESPUESTA_SOLICITANTE", ctx).detalle, "Listo, reinicia el equipo");
  assert.equal(describeNotice("RECHAZO_OBSERVADOR", ctx).detalle, "Listo, reinicia el equipo");
  assert.equal(describeNotice("SOLICITUD_VALIDACION", ctx).detalle, "Listo, reinicia el equipo");
});

test("el extracto queda en una línea y se corta por palabra", () => {
  assert.equal(excerpt("  uno\n\n dos  "), "uno dos");
  const largo = excerpt("palabra ".repeat(60), 40);
  assert.ok(largo.length <= 41, largo);
  assert.ok(largo.endsWith("…"));
  assert.ok(!largo.includes("  "));
});

test("el correo de escalamiento escapa lo que viene de personas y enlaza cada pendiente", () => {
  const { subject, html } = buildEscalationMail({
    nombre: "<b>Ana</b>",
    avisosUrl: "https://conecta.rbgct.cloud/helpdesk/avisos",
    pendientes: [
      { titulo: 'Luis te reasignó <script>x</script>', desde: "29 sept 2026", url: "https://conecta.rbgct.cloud/helpdesk/tickets/a" },
      { titulo: "Otro", desde: "30 sept 2026", url: "https://conecta.rbgct.cloud/helpdesk/tickets/b" },
    ],
  });
  assert.equal(subject, "Tienes 2 pendientes sin atender en HelpDesk");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;b&gt;Ana&lt;/b&gt;"));
  assert.ok(html.includes('href="https://conecta.rbgct.cloud/helpdesk/tickets/a"'));
  assert.ok(html.includes('href="https://conecta.rbgct.cloud/helpdesk/avisos"'));
});

test("el asunto del escalamiento concuerda en singular", () => {
  const { subject } = buildEscalationMail({
    nombre: "Ana",
    avisosUrl: "https://conecta.rbgct.cloud/helpdesk/avisos",
    pendientes: [{ titulo: "Uno", desde: "30 sept 2026", url: "https://conecta.rbgct.cloud/helpdesk/tickets/a" }],
  });
  assert.equal(subject, "Tienes un pendiente sin atender en HelpDesk");
});
