import { test } from "node:test";
import assert from "node:assert/strict";

import { escapeHtml } from "./mail-layout";
import { buildTicketMail, type TicketMailContext } from "./ticket-mail-content";

const base: TicketMailContext = {
  codigo: "TI-2026-0001",
  remitente: "Luis Gómez",
  texto: null,
  url: "https://conecta.rbgct.cloud/helpdesk/portal/tickets/abc",
};

test("el texto de una persona no entra como HTML activo", () => {
  for (const kind of ["RESPUESTA_CLIENTE", "CIERRE_EMPLEADO", "APROBACION_EMPLEADO", "CREACION_EMPLEADO"] as const) {
    const { html } = buildTicketMail(kind, {
      ...base,
      texto: '<script>alert(1)</script><a href="https://malo">aquí</a>',
      descripcion: "<img src=x onerror=alert(1)>",
      remitente: "<b>Luis</b>",
    });
    assert.ok(!html.includes("<script>"), kind);
    // El layout lleva su propio `<img>`, el logotipo: se busca la inyectada.
    assert.ok(!html.includes("<img src=x"), kind);
    assert.ok(!html.includes('href="https://malo"'), kind);
    assert.ok(html.includes("&lt;b&gt;Luis&lt;/b&gt;"), kind);
  }
});

test("la respuesta va en el correo del contacto, con el enlace al portal", () => {
  const respuesta = buildTicketMail("RESPUESTA_CLIENTE", { ...base, texto: "Listo,\nya quedó" });
  assert.match(respuesta.subject, /TI-2026-0001/);
  assert.ok(respuesta.html.includes("Listo,<br>ya quedó"));
  assert.ok(respuesta.html.includes('href="https://conecta.rbgct.cloud/helpdesk/portal/tickets/abc"'));
});

test("cada correo a un empleado nombra el ticket y lleva lo que le toca saber (U29)", () => {
  const url = "https://conecta.rbgct.cloud/helpdesk/tickets/abc";
  const creacion = buildTicketMail("CREACION_EMPLEADO", { ...base, url, descripcion: "No enciende el equipo" });
  assert.match(creacion.subject, /TI-2026-0001/);
  assert.ok(creacion.html.includes("No enciende el equipo"));
  assert.ok(creacion.html.includes(`href="${url}"`));

  const aprobacion = buildTicketMail("APROBACION_EMPLEADO", { ...base, url, texto: "Compra de licencia" });
  assert.ok(aprobacion.html.includes("Compra de licencia"));
  assert.match(aprobacion.html, /no se puede cerrar hasta que respondas/);

  const cierre = buildTicketMail("CIERRE_EMPLEADO", { ...base, url, texto: "Reinicia el equipo" });
  assert.match(cierre.subject, /cerrado/);
  assert.ok(cierre.html.includes("Reinicia el equipo"));

  assert.match(buildTicketMail("OBSERVADOR_EMPLEADO", { ...base, url }).subject, /TI-2026-0001/);
});

test("escapeHtml cubre las comillas, para que un valor no salga de su atributo", () => {
  assert.equal(escapeHtml(`"'<>&`), "&quot;&#39;&lt;&gt;&amp;");
});
