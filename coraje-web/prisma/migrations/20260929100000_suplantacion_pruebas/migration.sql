-- =====================================================================
-- SUPLANTACIÓN — bloque temporal para pruebas (docs/estado/operacion.md,
-- «Suplantación para pruebas»). Se retira antes de que HelpDesk sea la
-- herramienta de trabajo de cualquier área.
-- =====================================================================
-- Permite que una persona habilitada a mano trabaje como otro empleado sin
-- salir de su propia sesión de Microsoft, para recorrer el ciclo del ticket
-- sin una cuenta por persona. Concepto tomado de Impulsa
-- (src/server/dev-impersonation/), con dos diferencias deliberadas:
--
--   · Impulsa la apaga en producción. HelpDesk no tiene otro entorno, así que
--     aquí vive en producción: el riesgo lo aceptó el usuario el 29-sep-2026.
--   · La habilitación no tiene pantalla ni acción del catálogo: se inserta por
--     psql, igual que se asigna un rol. La aplicación solo la lee.
--
-- Tres tablas en `app`, porque son estado de la plataforma, no dato maestro
-- ni hecho de negocio:
--   1. suplantacion_habilitada: quién puede suplantar.
--   2. suplantacion_activa: a quién mira cada sesión ahora mismo.
--   3. suplantacion_auditoria: cada cambio de persona, incluido el regreso.
--
-- Los eventos del ticket NO cambian: una acción hecha suplantando queda a
-- nombre de la persona suplantada. La auditoría es lo que permite saber
-- después qué se hizo así y limpiarlo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Quién puede suplantar
-- ---------------------------------------------------------------------
-- Una fila por persona. La inserta un humano por psql; la aplicación nunca
-- escribe aquí, para que nadie pueda habilitarse a sí mismo desde ella.
CREATE TABLE "app"."suplantacion_habilitada" (
    "id_personal" UUID NOT NULL,
    "habilitada_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "nota" VARCHAR(200),

    CONSTRAINT "suplantacion_habilitada_pkey" PRIMARY KEY ("id_personal"),
    CONSTRAINT "suplantacion_habilitada_id_personal_fkey"
        FOREIGN KEY ("id_personal") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

-- ALTER DEFAULT PRIVILEGES concede DML completo a los dos roles en cada
-- tabla nueva (operacion.md, F6); aquí se deja solo la lectura.
REVOKE ALL ON "app"."suplantacion_habilitada" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT ON "app"."suplantacion_habilitada" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. A quién mira cada sesión
-- ---------------------------------------------------------------------
-- Una fila por sesión que está suplantando. Cuelga de la sesión con
-- CASCADE: si la fila de sesión desaparece, la suplantación también. Una
-- sesión revocada o vencida ya no se lee (employee-session.ts), así que su
-- fila aquí queda inerte aunque siga existiendo.
CREATE TABLE "app"."suplantacion_activa" (
    "id_sesion" UUID NOT NULL,
    "id_personal_suplantado" UUID NOT NULL,
    "iniciada_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "suplantacion_activa_pkey" PRIMARY KEY ("id_sesion"),
    CONSTRAINT "suplantacion_activa_id_sesion_fkey"
        FOREIGN KEY ("id_sesion") REFERENCES "app"."employee_session"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "suplantacion_activa_id_personal_suplantado_fkey"
        FOREIGN KEY ("id_personal_suplantado") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

REVOKE ALL ON "app"."suplantacion_activa" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."suplantacion_activa" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 3. Auditoría de cada cambio de persona
-- ---------------------------------------------------------------------
-- Solo crece. `id_personal_suplantado` nulo significa «volvió a su propia
-- identidad». Sin FK a la sesión, a propósito: la auditoría tiene que
-- sobrevivir a la sesión que registra.
CREATE TABLE "app"."suplantacion_auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_sesion" UUID NOT NULL,
    "id_personal_real" UUID NOT NULL,
    "id_personal_suplantado" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "suplantacion_auditoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "suplantacion_auditoria_id_personal_real_fkey"
        FOREIGN KEY ("id_personal_real") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "suplantacion_auditoria_id_personal_suplantado_fkey"
        FOREIGN KEY ("id_personal_suplantado") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- Consulta de limpieza: qué hizo una persona suplantando, por fecha.
CREATE INDEX "ix_suplantacion_auditoria_real" ON "app"."suplantacion_auditoria" ("id_personal_real", "created_at");

REVOKE ALL ON "app"."suplantacion_auditoria" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT ON "app"."suplantacion_auditoria" TO "coraje_runtime";
