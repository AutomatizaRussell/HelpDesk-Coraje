import { test } from "node:test";
import assert from "node:assert/strict";

import { inboxSummary } from "./inbox-summary";

const text = (parts: ReturnType<typeof inboxSummary>) => parts.map((part) => part.text).join("");
const alerts = (parts: ReturnType<typeof inboxSummary>) => parts.filter((part) => part.alert).map((part) => part.text);

test("vencidos y por vencer: solo los vencidos se resaltan", () => {
  const parts = inboxSummary(3, 2);
  assert.equal(text(parts), "En tu alcance hay 3 tickets vencidos y 2 por vencer en menos de un día.");
  assert.deepEqual(alerts(parts), ["3 tickets vencidos"]);
});

test("singular y miles", () => {
  assert.equal(text(inboxSummary(1, 0)), "En tu alcance hay 1 ticket vencido.");
  assert.equal(text(inboxSummary(1200, 0)), "En tu alcance hay 1.200 tickets vencidos.");
  assert.equal(text(inboxSummary(0, 1)), "Nada vencido en tu alcance; 1 ticket por vencer en menos de un día.");
});

test("sin vencidos no hay nada resaltado", () => {
  assert.deepEqual(alerts(inboxSummary(0, 4)), []);
  assert.equal(text(inboxSummary(0, 0)), "Nada vencido ni por vencer en tu alcance.");
});
