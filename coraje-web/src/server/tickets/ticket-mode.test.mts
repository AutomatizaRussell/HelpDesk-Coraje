import { test } from "node:test";
import assert from "node:assert/strict";

import { inboxPath, modeCondition, parseTicketMode, ticketModeOf } from "./ticket-mode";

test("solo `externo` abre el modo Externo: cualquier otro valor es Interno", () => {
  assert.equal(parseTicketMode("externo"), "externo");
  for (const value of [undefined, "", "Coraje", "interno", "clientes", "coraje "]) assert.equal(parseTicketMode(value), "interno");
});

test("un ticket es Externo si y solo si tiene cliente", () => {
  assert.equal(ticketModeOf("6c69866d-91ab-4258-acd7-0766bb62d72f"), "externo");
  assert.equal(ticketModeOf(null), "interno");
  // El filtro de la base dice lo mismo que la regla en memoria.
  assert.deepEqual(modeCondition("externo"), { idClienteContai: { not: null } });
  assert.deepEqual(modeCondition("interno"), { idClienteContai: null });
});

test("la bandeja Interna no lleva parámetro y la Externa sí", () => {
  assert.equal(inboxPath("interno"), "/tickets");
  assert.equal(inboxPath("externo"), "/tickets?modo=externo");
  assert.equal(inboxPath("externo", "redirigir"), "/tickets?modo=externo&vista=redirigir");
  assert.equal(inboxPath("interno", "radicados"), "/tickets?vista=radicados");
});
