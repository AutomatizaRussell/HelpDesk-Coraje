-- =====================================================================
-- IDENTIDAD DE EMPLEADOS — U3, 11-sep-2026
-- =====================================================================
-- A diferencia del baseline (20260910000000), esta migración SÍ ejecuta DDL
-- real contra la base viva: agrega columnas y una tabla que hoy no existen.
-- Escrita a mano (mismo motivo que el baseline: este entorno de trabajo no
-- tiene acceso a la base real para correr `prisma migrate dev`), pero
-- replica exactamente lo que `prisma migrate diff` generaría a partir del
-- diff de schema.prisma, sin nada fuera del alcance de esta unidad.
--
-- ADVERTENCIA OPERATIVA antes de aplicar contra producción: el índice único
-- parcial de la sección 3 asume que ninguna fila activa (no marcada como
-- buzón histórico de F10) comparte correo_corporativo con otra. Verificar
-- con la consulta de solo lectura entregada en el handoff/acción inmediata
-- antes de desplegar — si existe algún duplicado real, este CREATE UNIQUE
-- INDEX falla explícitamente (y con él, el servicio `migrate` completo, sin
-- dejar que `web` arranque con el esquema a medias), en vez de degradarse en
-- silencio.
-- =====================================================================


-- =====================================================================
-- 1. SCHEMA NUEVO — estado propio de la plataforma, separado de core/helpdesk
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS "app";


-- =====================================================================
-- 2. CATÁLOGO DE ROLES DE APLICACIÓN
-- =====================================================================
-- Un único valor por ahora (ver comentario en schema.prisma): el catálogo
-- fino de roles es competencia de specs/permisos.md, todavía sin cerrar.

CREATE TYPE "core"."rol_aplicacion" AS ENUM ('AGENTE');


-- =====================================================================
-- 3. COLUMNAS NUEVAS EN core.dim_personal
-- =====================================================================
-- Ambas nullable y sin default: el UPSERT del ELT (sql/elt/03_transform_personal.sql)
-- no las toca porque no aparecen en su SET explícito — mismo patrón que
-- es_responsable_historico_no_identificado (F10). rol_aplicacion nulo es la
-- condición normal de una fila recién llegada de SharePoint; la admisión la
-- rechaza con UNKNOWN_ROLE hasta que alguien la habilite a mano.

ALTER TABLE "core"."dim_personal" ADD COLUMN "rol_aplicacion" "core"."rol_aplicacion";
ALTER TABLE "core"."dim_personal" ADD COLUMN "entra_object_id" VARCHAR(64);

CREATE UNIQUE INDEX "dim_personal_entra_object_id_key" ON "core"."dim_personal"("entra_object_id");

-- Búsqueda determinista por correo en el primer ingreso federado, antes de que
-- exista el enlace por entra_object_id (specs/acceso-empleados.md §7.1).
CREATE UNIQUE INDEX "ux_dim_personal_correo_activo" ON "core"."dim_personal"("correo_corporativo") WHERE (estado_activo AND NOT es_responsable_historico_no_identificado);


-- =====================================================================
-- 4. app.employee_session — sesión propia opaca (specs/acceso-empleados.md §6)
-- =====================================================================

CREATE TABLE "app"."employee_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_personal" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "identity_subject" VARCHAR(255) NOT NULL,
    "identity_tenant_id" VARCHAR(64) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(200),
    "user_agent" VARCHAR(400),

    CONSTRAINT "employee_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_session_token_hash_key" ON "app"."employee_session"("token_hash");
CREATE INDEX "ix_employee_session_personal_expires" ON "app"."employee_session"("id_personal", "expires_at");
CREATE INDEX "ix_employee_session_expires" ON "app"."employee_session"("expires_at");

ALTER TABLE "app"."employee_session" ADD CONSTRAINT "employee_session_id_personal_fkey" FOREIGN KEY ("id_personal") REFERENCES "core"."dim_personal"("id_personal") ON DELETE CASCADE ON UPDATE NO ACTION;


-- =====================================================================
-- 5. PERMISOS — mismo patrón que F6 (docs/estado/operacion.md): coraje_runtime
--    (rol de `web`, DML) necesita acceso al schema nuevo. coraje_migrator
--    (dueño de esta migración) queda automáticamente como dueño de `app` por
--    haberlo creado — sin GRANT adicional para eso.
-- =====================================================================

GRANT USAGE ON SCHEMA "app" TO "coraje_runtime";
GRANT SELECT, INSERT, UPDATE, DELETE ON "app"."employee_session" TO "coraje_runtime";
