import { test } from "node:test";
import assert from "node:assert/strict";

import { inboxPath, modeCondition, parseTicketMode, ticketModeOf } from "./ticket-mode";

test("solo `coraje` abre el modo Coraje: cualquier otro valor es HelpDesk", () => {
  assert.equal(parseTicketMode("coraje"), "coraje");
  for (const value of [undefined, "", "Coraje", "helpdesk", "clientes", "coraje "]) assert.equal(parseTicketMode(value), "helpdesk");
});

test("un ticket es de Coraje si y solo si tiene cliente", () => {
  assert.equal(ticketModeOf("6c69866d-91ab-4258-acd7-0766bb62d72f"), "coraje");
  assert.equal(ticketModeOf(null), "helpdesk");
  // El filtro de la base dice lo mismo que la regla en memoria.
  assert.deepEqual(modeCondition("coraje"), { idClienteContai: { not: null } });
  assert.deepEqual(modeCondition("helpdesk"), { idClienteContai: null });
});

test("la bandeja de HelpDesk no lleva parámetro y la de Coraje sí", () => {
  assert.equal(inboxPath("helpdesk"), "/tickets");
  assert.equal(inboxPath("coraje"), "/tickets?modo=coraje");
  assert.equal(inboxPath("coraje", "redirigir"), "/tickets?modo=coraje&vista=redirigir");
  assert.equal(inboxPath("helpdesk", "radicados"), "/tickets?vista=radicados");
});
