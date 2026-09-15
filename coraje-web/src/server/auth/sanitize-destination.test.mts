import { test } from "node:test";
import assert from "node:assert/strict";

import { sanitizeDestination } from "./sanitize-destination";

test("sanitizeDestination preserva una ruta relativa válida", () => {
  assert.equal(sanitizeDestination("/tickets/123"), "/tickets/123");
});

test("sanitizeDestination cae a '/' cuando el valor es nulo o vacío", () => {
  assert.equal(sanitizeDestination(null), "/");
  assert.equal(sanitizeDestination(undefined), "/");
  assert.equal(sanitizeDestination(""), "/");
});

test("sanitizeDestination rechaza protocol-relative (//host)", () => {
  assert.equal(sanitizeDestination("//evil.example"), "/");
});

test("sanitizeDestination rechaza URLs absolutas", () => {
  assert.equal(sanitizeDestination("https://evil.example"), "/");
  assert.equal(sanitizeDestination("http://evil.example/tickets"), "/");
});

test("sanitizeDestination rechaza backslash (normalizable a protocol-relative por el navegador)", () => {
  assert.equal(sanitizeDestination("/\\evil.example"), "/");
  assert.equal(sanitizeDestination("\\\\evil.example"), "/");
});
