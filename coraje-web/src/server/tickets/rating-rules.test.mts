import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  RATING_COMMENT_REQUIRED_AT_OR_BELOW,
  RATING_MAX,
  RATING_MIN,
  ratingRequiresComment,
} from "./rating-rules";

/**
 * Las reglas de la calificación viven en dos sitios: `rating-rules.ts`, que
 * leen la acción y el formulario, y `helpdesk.calificar_ticket`, que las hace
 * cumplir. Si divergen, el formulario aceptaría lo que la base rechaza (o
 * pediría un comentario que la base no exige).
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(THIS_DIR, "../../../prisma/migrations/20261104110000_calificacion_ticket/migration.sql");
const sql = readFileSync(MIGRATION, "utf8");

test("calificar_ticket valida el mismo rango que la aplicación", () => {
  assert.match(sql, new RegExp(`p_calificacion NOT BETWEEN ${RATING_MIN} AND ${RATING_MAX}`));
});

test("calificar_ticket exige comentario desde el mismo umbral", () => {
  assert.match(sql, new RegExp(`p_calificacion <= ${RATING_COMMENT_REQUIRED_AT_OR_BELOW} AND v_comentario IS NULL`));
});

test("el comentario es obligatorio con 1 y 2 estrellas, y opcional con 3 a 5", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(ratingRequiresComment),
    [true, true, false, false, false],
  );
});
