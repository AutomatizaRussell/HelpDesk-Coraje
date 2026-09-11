-- =====================================================================
-- BASELINE — U2, corte 5, 10-sep-2026
-- =====================================================================
-- Esta migración NO se ejecuta contra la base real: se marca aplicada con
-- `prisma migrate resolve --applied 20260910000000_baseline` sobre la base
-- viva, que ya tiene este esquema construido a mano (sql/db/*.sql, más las
-- correcciones y hallazgos de F10/F11/F12, docs/estado/handoff.md corte 5).
--
-- Escrita a mano, no generada por `prisma migrate diff`: este entorno de
-- trabajo no tiene Node/Docker disponible para correr el comando. Replica
-- exactamente lo que `prisma migrate diff --from-empty
-- --to-schema-datamodel=prisma/schema.prisma --script` generaría desde
-- schema.prisma, más las secciones 6-9 que el DSL de Prisma no puede
-- expresar (extensiones, CHECK, funciones, trigger) — preservadas aquí a
-- mano, como prevé contexto-canonico.md §4.
--
-- Disciplina para el futuro: cualquier `prisma migrate dev`/`diff` que toque
-- las tablas de las secciones 6-9 puede proponer borrar lo que no reconoce
-- en el DSL. Revisar el SQL generado antes de aplicar — nunca a ciegas.
-- =====================================================================


-- =====================================================================
-- 1. SCHEMAS Y EXTENSIONES
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS "core";
CREATE SCHEMA IF NOT EXISTS "helpdesk";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "public";


-- =====================================================================
-- 2. CORE — TABLAS
-- =====================================================================

CREATE TABLE "core"."area_exclusion" (
    "nombre_area_normalizado" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "area_exclusion_pkey" PRIMARY KEY ("nombre_area_normalizado")
);

CREATE TABLE "core"."dim_area" (
    "id_area" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sp_area_id" INTEGER,
    "nombre_area" VARCHAR(100) NOT NULL,
    "encargado_recepcion" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "codigo_area" VARCHAR(10) NOT NULL,

    CONSTRAINT "dim_area_pkey" PRIMARY KEY ("id_area")
);

CREATE TABLE "core"."dim_cliente_contai" (
    "id_cliente_contai" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sp_cliente_id" INTEGER,
    "identificacion_fiscal" VARCHAR(50),
    "nombre_cliente" VARCHAR(150) NOT NULL,
    "tipo_cliente" VARCHAR(50),
    "grupo_economico" VARCHAR(100),
    "estado_cliente" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "dim_cliente_contai_pkey" PRIMARY KEY ("id_cliente_contai")
);

CREATE TABLE "core"."cliente_contai_recurso" (
    "id_recurso" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_cliente_contai" UUID NOT NULL,
    "nombre_recurso" VARCHAR(100),
    "url_recurso" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "cliente_contai_recurso_pkey" PRIMARY KEY ("id_recurso")
);

CREATE TABLE "core"."dim_personal" (
    "id_personal" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sp_personal_id" INTEGER,
    "sp_user_id" INTEGER,
    "cedula" VARCHAR(20),
    "nombre_completo" VARCHAR(200) NOT NULL,
    "correo_corporativo" VARCHAR(150),
    "id_area" UUID,
    "cargo" VARCHAR(100),
    "estado_activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "es_responsable_historico_no_identificado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "dim_personal_pkey" PRIMARY KEY ("id_personal")
);


-- =====================================================================
-- 3. HELPDESK — TABLAS
-- =====================================================================

CREATE TABLE "helpdesk"."dim_estado" (
    "id_estado" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre_estado" VARCHAR(50) NOT NULL,

    CONSTRAINT "dim_estado_pkey" PRIMARY KEY ("id_estado")
);

CREATE TABLE "helpdesk"."dim_prioridad" (
    "id_prioridad" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre_prioridad" VARCHAR(50) NOT NULL,
    "dias_sla" INTEGER NOT NULL,
    "peso_prioridad" INTEGER NOT NULL,

    CONSTRAINT "dim_prioridad_pkey" PRIMARY KEY ("id_prioridad")
);

CREATE TABLE "helpdesk"."dim_tipo_requerimiento" (
    "id_tipo_req" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sp_tipo_req_id" INTEGER,
    "id_area" UUID NOT NULL,
    "tipo_requerimiento" VARCHAR(150) NOT NULL,
    "categoria_1" VARCHAR(150),
    "categoria_2" VARCHAR(150),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "dim_tipo_requerimiento_pkey" PRIMARY KEY ("id_tipo_req")
);

CREATE TABLE "helpdesk"."fact_ticket" (
    "id_ticket" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo_ticket" TEXT,
    "descripcion_problema" TEXT NOT NULL,
    "id_cliente_contai" UUID,
    "id_solicitante" UUID,
    "id_area_destino" UUID,
    "id_asignado" UUID,
    "id_estado" UUID NOT NULL,
    "id_prioridad" UUID,
    "id_tipo_req" UUID,
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "fecha_limite" TIMESTAMPTZ(6),
    "fecha_resolucion" TIMESTAMPTZ(6),
    "respuesta_final" TEXT,
    "calificacion" INTEGER,
    "origen_sistema" TEXT NOT NULL,
    "ultima_actualizacion" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "encargado_interno" TEXT,

    CONSTRAINT "fact_ticket_pkey" PRIMARY KEY ("id_ticket")
);

CREATE TABLE "helpdesk"."fact_ticket_evento" (
    "id_evento" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sp_event_id" INTEGER,
    "event_hash" TEXT,
    "id_ticket" UUID NOT NULL,
    "id_autor" UUID,
    "tipo_evento" VARCHAR(50) NOT NULL,
    "contenido" TEXT NOT NULL,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "fact_ticket_evento_pkey" PRIMARY KEY ("id_evento")
);

CREATE TABLE "helpdesk"."routing_rule" (
    "id_routing_rule" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_tipo_req" UUID NOT NULL,
    "encargado_interno" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "routing_rule_pkey" PRIMARY KEY ("id_routing_rule")
);

CREATE TABLE "helpdesk"."ticket_codigo_counter" (
    "id_area" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "ticket_codigo_counter_pkey" PRIMARY KEY ("id_area", "anio")
);

CREATE TABLE "helpdesk"."ticket_legacy_sharepoint_ref" (
    "id_ticket" UUID NOT NULL,
    "sp_id" INTEGER NOT NULL,
    "legacy_id_req" TEXT,
    "legacy_title" TEXT,
    "legacy_created_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "ticket_legacy_sharepoint_ref_pkey" PRIMARY KEY ("id_ticket")
);

CREATE TABLE "helpdesk"."ticket_sync_outbox" (
    "id_sync" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_ticket" UUID NOT NULL,
    "target_system" TEXT NOT NULL DEFAULT 'SHAREPOINT',
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ticket_sync_outbox_pkey" PRIMARY KEY ("id_sync")
);


-- =====================================================================
-- 4. ÍNDICES ÚNICOS Y NO ÚNICOS (confirmados contra la base real,
--    10-sep-2026 — sql/db/06_helpdesk_facts.sql declara varios que NO
--    existen en producción; esta migración captura la realidad, no el
--    archivo. Ver comentario en FactTicket, schema.prisma)
-- =====================================================================

CREATE UNIQUE INDEX "dim_area_sp_area_id_key" ON "core"."dim_area"("sp_area_id");
CREATE UNIQUE INDEX "dim_area_nombre_area_key" ON "core"."dim_area"("nombre_area");
CREATE UNIQUE INDEX "uq_dim_area_codigo_area" ON "core"."dim_area"("codigo_area");

CREATE UNIQUE INDEX "dim_cliente_contai_sp_cliente_id_key" ON "core"."dim_cliente_contai"("sp_cliente_id");
-- Único parcial: NIT no vacío no se repite; múltiples clientes sin NIT sí se permiten.
CREATE UNIQUE INDEX "uq_dim_cliente_contai_identificacion_fiscal_not_null" ON "core"."dim_cliente_contai"("identificacion_fiscal") WHERE (identificacion_fiscal IS NOT NULL);

CREATE UNIQUE INDEX "dim_personal_sp_personal_id_key" ON "core"."dim_personal"("sp_personal_id");
CREATE UNIQUE INDEX "dim_personal_sp_user_id_key" ON "core"."dim_personal"("sp_user_id");
-- Como máximo un marcador histórico por correo compartido — regla dura de F10.
CREATE UNIQUE INDEX "ux_dim_personal_correo_historico" ON "core"."dim_personal"("correo_corporativo") WHERE es_responsable_historico_no_identificado;

CREATE UNIQUE INDEX "dim_estado_nombre_estado_key" ON "helpdesk"."dim_estado"("nombre_estado");

CREATE UNIQUE INDEX "dim_prioridad_nombre_prioridad_key" ON "helpdesk"."dim_prioridad"("nombre_prioridad");

CREATE UNIQUE INDEX "dim_tipo_requerimiento_sp_tipo_req_id_key" ON "helpdesk"."dim_tipo_requerimiento"("sp_tipo_req_id");
CREATE UNIQUE INDEX "uq_dim_tipo_req_natural" ON "helpdesk"."dim_tipo_requerimiento"("id_area", "tipo_requerimiento", "categoria_1", "categoria_2");
CREATE UNIQUE INDEX "uq_dim_tipo_requerimiento_id_tipo_req_id_area" ON "helpdesk"."dim_tipo_requerimiento"("id_tipo_req", "id_area");

CREATE UNIQUE INDEX "fact_ticket_codigo_ticket_key" ON "helpdesk"."fact_ticket"("codigo_ticket");

CREATE UNIQUE INDEX "fact_ticket_evento_sp_event_id_key" ON "helpdesk"."fact_ticket_evento"("sp_event_id");
CREATE UNIQUE INDEX "fact_ticket_evento_event_hash_key" ON "helpdesk"."fact_ticket_evento"("event_hash");

CREATE UNIQUE INDEX "uq_routing_rule_tipo_req" ON "helpdesk"."routing_rule"("id_tipo_req");
CREATE INDEX "ix_routing_rule_activo" ON "helpdesk"."routing_rule"("activo");
CREATE INDEX "ix_routing_rule_tipo_req" ON "helpdesk"."routing_rule"("id_tipo_req");

CREATE UNIQUE INDEX "ticket_legacy_sharepoint_ref_sp_id_key" ON "helpdesk"."ticket_legacy_sharepoint_ref"("sp_id");

-- Único parcial: a lo sumo una operación PENDING/PROCESSING por ticket — patrón bueno
-- del outbox, no se rediseña.
CREATE UNIQUE INDEX "uq_ticket_sync_outbox_pending_operation" ON "helpdesk"."ticket_sync_outbox"("id_ticket", "operation") WHERE (status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text]));
CREATE INDEX "ix_ticket_sync_outbox_status_created" ON "helpdesk"."ticket_sync_outbox"("status", "created_at");
CREATE INDEX "ix_ticket_sync_outbox_ticket" ON "helpdesk"."ticket_sync_outbox"("id_ticket");


-- =====================================================================
-- 5. LLAVES FORÁNEAS (18, confirmadas contra la base real, 10-sep-2026)
-- =====================================================================

ALTER TABLE "core"."cliente_contai_recurso" ADD CONSTRAINT "cliente_contai_recurso_id_cliente_contai_fkey" FOREIGN KEY ("id_cliente_contai") REFERENCES "core"."dim_cliente_contai"("id_cliente_contai") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "core"."dim_personal" ADD CONSTRAINT "dim_personal_id_area_fkey" FOREIGN KEY ("id_area") REFERENCES "core"."dim_area"("id_area") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."dim_tipo_requerimiento" ADD CONSTRAINT "dim_tipo_requerimiento_id_area_fkey" FOREIGN KEY ("id_area") REFERENCES "core"."dim_area"("id_area") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fact_ticket_id_area_destino_fkey" FOREIGN KEY ("id_area_destino") REFERENCES "core"."dim_area"("id_area") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fact_ticket_id_asignado_fkey" FOREIGN KEY ("id_asignado") REFERENCES "core"."dim_personal"("id_personal") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fact_ticket_id_cliente_contai_fkey" FOREIGN KEY ("id_cliente_contai") REFERENCES "core"."dim_cliente_contai"("id_cliente_contai") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fact_ticket_id_estado_fkey" FOREIGN KEY ("id_estado") REFERENCES "helpdesk"."dim_estado"("id_estado") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fact_ticket_id_prioridad_fkey" FOREIGN KEY ("id_prioridad") REFERENCES "helpdesk"."dim_prioridad"("id_prioridad") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fact_ticket_id_solicitante_fkey" FOREIGN KEY ("id_solicitante") REFERENCES "core"."dim_personal"("id_personal") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fact_ticket_id_tipo_req_fkey" FOREIGN KEY ("id_tipo_req") REFERENCES "helpdesk"."dim_tipo_requerimiento"("id_tipo_req") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "fk_fact_ticket_tipo_req_area" FOREIGN KEY ("id_tipo_req", "id_area_destino") REFERENCES "helpdesk"."dim_tipo_requerimiento"("id_tipo_req", "id_area") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."fact_ticket_evento" ADD CONSTRAINT "fact_ticket_evento_id_autor_fkey" FOREIGN KEY ("id_autor") REFERENCES "core"."dim_personal"("id_personal") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "helpdesk"."fact_ticket_evento" ADD CONSTRAINT "fact_ticket_evento_id_ticket_fkey" FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."routing_rule" ADD CONSTRAINT "routing_rule_id_tipo_req_fkey" FOREIGN KEY ("id_tipo_req") REFERENCES "helpdesk"."dim_tipo_requerimiento"("id_tipo_req") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."ticket_codigo_counter" ADD CONSTRAINT "ticket_codigo_counter_id_area_fkey" FOREIGN KEY ("id_area") REFERENCES "core"."dim_area"("id_area") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."ticket_legacy_sharepoint_ref" ADD CONSTRAINT "fk_ticket_legacy_sharepoint_ref_ticket" FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."ticket_sync_outbox" ADD CONSTRAINT "ticket_sync_outbox_id_ticket_fkey" FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket") ON DELETE CASCADE ON UPDATE NO ACTION;


-- =====================================================================
-- 6. CHECK — no representables en el DSL de Prisma
-- =====================================================================
-- Disciplina: cualquier futura migración generada sobre estas tablas debe
-- revisarse a mano para confirmar que no borra estos CHECK sin querer.
-- Ver docs/contexto-canonico.md §4 y docs/estado/operacion.md.

ALTER TABLE "helpdesk"."dim_prioridad" ADD CONSTRAINT "chk_dim_prioridad_dias_sla" CHECK (dias_sla > 0);
ALTER TABLE "helpdesk"."dim_prioridad" ADD CONSTRAINT "chk_dim_prioridad_peso" CHECK (peso_prioridad >= 1);

ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "chk_fact_ticket_calificacion" CHECK ((calificacion IS NULL) OR ((calificacion >= 1) AND (calificacion <= 5)));
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "chk_fact_ticket_fechas_validas" CHECK ((fecha_resolucion IS NULL) OR (fecha_resolucion >= fecha_creacion));
-- Forma simple, committeada: exactamente un origen humano (cliente externo XOR
-- empleado interno). La base tuvo, entre jul-2026 y corte 5, una versión reescrita
-- que aceptaba una tercera vía (id_identidad_correo_solicitante) — retirada junto
-- con el resto del subsistema huérfano; ver docs/legacy/identidad-correo-2026-07.md.
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "chk_fact_ticket_origen_exclusivo" CHECK (((id_cliente_contai IS NOT NULL) AND (id_solicitante IS NULL)) OR ((id_cliente_contai IS NULL) AND (id_solicitante IS NOT NULL)));
ALTER TABLE "helpdesk"."fact_ticket" ADD CONSTRAINT "chk_fact_ticket_origen_sistema" CHECK (origen_sistema = ANY (ARRAY['SHAREPOINT_LEGACY'::text, 'PORTAL_CLIENTE'::text, 'SISTEMA_INTERNO'::text]));

-- Más angosto que sql/elt/07_transform_ticket_evento.sql podría sugerir (le faltan
-- CREACION y CANCELACION_CLIENTE frente al vocabulario que describe
-- specs/tickets.md): confirmado así contra la base real, 10-sep-2026. El ELT actual
-- solo inserta COMENTARIO, así que hoy no tiene efecto práctico. Ampliar el
-- vocabulario es decisión de U6 (modelo de eventos del ticket), no de esta unidad.
ALTER TABLE "helpdesk"."fact_ticket_evento" ADD CONSTRAINT "chk_fact_ticket_evento_tipo" CHECK (tipo_evento = ANY (ARRAY['COMENTARIO'::character varying, 'REASIGNACION'::character varying, 'CAMBIO_ESTADO'::character varying, 'MIGRACION_LEGACY'::character varying]::text[]));

ALTER TABLE "helpdesk"."ticket_codigo_counter" ADD CONSTRAINT "chk_ticket_codigo_counter_anio" CHECK (anio >= 2000);
ALTER TABLE "helpdesk"."ticket_codigo_counter" ADD CONSTRAINT "chk_ticket_codigo_counter_last_number" CHECK (last_number >= 0);

ALTER TABLE "helpdesk"."ticket_sync_outbox" ADD CONSTRAINT "chk_ticket_sync_outbox_target" CHECK (target_system = 'SHAREPOINT');
ALTER TABLE "helpdesk"."ticket_sync_outbox" ADD CONSTRAINT "chk_ticket_sync_outbox_operation" CHECK (operation = ANY (ARRAY['CREATE_TICKET'::text, 'UPDATE_TICKET'::text, 'CANCEL_TICKET'::text]));
ALTER TABLE "helpdesk"."ticket_sync_outbox" ADD CONSTRAINT "chk_ticket_sync_outbox_status" CHECK (status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'SENT'::text, 'FAILED'::text]));
ALTER TABLE "helpdesk"."ticket_sync_outbox" ADD CONSTRAINT "chk_ticket_sync_outbox_attempts" CHECK (attempts >= 0);


-- =====================================================================
-- 7. FUNCIONES DE NEGOCIO — SLA / calendario colombiano
-- =====================================================================
-- Committeadas desde el corte inicial (sql/db/02_functions.sql, commit
-- 8a8047d). Se preservan aquí íntegras porque el baseline debe poder
-- reconstruir el esquema completo, no solo lo tocado en esta unidad.

CREATE OR REPLACE FUNCTION "core"."norm_text"(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(
        BTRIM(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    LOWER(public.unaccent(COALESCE(input_text, ''))),
                    '[^a-z0-9]+',
                    ' ',
                    'g'
                ),
                '\s+',
                ' ',
                'g'
            )
        ),
        ''
    );
$$;

CREATE OR REPLACE FUNCTION "core"."easter_date"(p_year INTEGER)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    a INT; b INT; c INT; d INT; e INT; f INT; g INT; h INT;
    i INT; k INT; l INT; m INT; month INT; day INT;
BEGIN
    a := p_year % 19;
    b := p_year / 100;
    c := p_year % 100;
    d := b / 4;
    e := b % 4;
    f := (b + 8) / 25;
    g := (b - f + 1) / 3;
    h := (19 * a + b - d - g + 15) % 30;
    i := c / 4;
    k := c % 4;
    l := (32 + 2 * e + 2 * i - h - k) % 7;
    m := (a + 11 * h + 22 * l) / 451;
    month := (h + l - 7 * m + 114) / 31;
    day := ((h + l - 7 * m + 114) % 31) + 1;
    RETURN make_date(p_year, month, day);
END;
$$;

CREATE OR REPLACE FUNCTION "core"."next_monday"(p_date DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE EXTRACT(ISODOW FROM p_date)
        WHEN 7 THEN p_date + 1
        ELSE p_date
    END;
$$;

CREATE OR REPLACE FUNCTION "core"."is_colombia_holiday"(p_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM p_date)::INT;
    v_easter DATE := core.easter_date(v_year);
    v_fixed DATE[];
    v_movable DATE[];
BEGIN
    v_fixed := ARRAY[
        make_date(v_year, 1, 1),
        make_date(v_year, 5, 1),
        make_date(v_year, 7, 20),
        make_date(v_year, 8, 7),
        make_date(v_year, 12, 8),
        make_date(v_year, 12, 25)
    ];

    v_movable := ARRAY[
        core.next_monday(make_date(v_year, 1, 6)),
        core.next_monday(make_date(v_year, 3, 19)),
        v_easter - 3,
        v_easter - 2,
        v_easter + 39,
        core.next_monday(v_easter + 39),
        v_easter + 60,
        core.next_monday(v_easter + 60),
        core.next_monday(make_date(v_year, 6, 29)),
        core.next_monday(make_date(v_year, 8, 15)),
        core.next_monday(make_date(v_year, 10, 12)),
        core.next_monday(make_date(v_year, 11, 1)),
        core.next_monday(make_date(v_year, 11, 11))
    ];

    RETURN p_date = ANY (v_fixed) OR p_date = ANY (v_movable);
END;
$$;

CREATE OR REPLACE FUNCTION "core"."is_colombia_business_day"(p_date DATE)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT EXTRACT(ISODOW FROM p_date) < 6
       AND NOT core.is_colombia_holiday(p_date);
$$;

CREATE OR REPLACE FUNCTION "core"."add_colombia_business_days"(
    p_start_date DATE,
    p_days INTEGER
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_current DATE := p_start_date;
    v_remaining INT := p_days;
BEGIN
    WHILE v_remaining > 0 LOOP
        v_current := v_current + 1;

        IF core.is_colombia_business_day(v_current) THEN
            v_remaining := v_remaining - 1;
        END IF;
    END LOOP;

    RETURN v_current;
END;
$$;


-- =====================================================================
-- 8. FUNCIONES Y TRIGGER — codigo_ticket
-- =====================================================================
-- Confirmado activo y correcto contra la base real, 10-sep-2026 (F12,
-- docs/estado/handoff.md corte 5). No es el next_codigo_ticket() de cero
-- argumentos que describe sql/db/02_functions.sql — ese quedó superado sin
-- que nadie lo volcara al repositorio hasta ahora.

CREATE OR REPLACE FUNCTION "helpdesk"."next_codigo_ticket"(
    p_id_area UUID,
    p_fecha_creacion TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
    v_codigo_area TEXT;
    v_anio INTEGER;
    v_next_number INTEGER;
BEGIN
    IF p_id_area IS NULL THEN
        RAISE EXCEPTION
            'Cannot generate codigo_ticket without id_area_destino.';
    END IF;

    IF p_fecha_creacion IS NULL THEN
        RAISE EXCEPTION
            'Cannot generate codigo_ticket without fecha_creacion.';
    END IF;

    SELECT area.codigo_area
    INTO v_codigo_area
    FROM core.dim_area AS area
    WHERE area.id_area = p_id_area;

    IF v_codigo_area IS NULL THEN
        RAISE EXCEPTION
            'No codigo_area is configured for id_area %.',
            p_id_area;
    END IF;

    v_anio := EXTRACT(YEAR FROM p_fecha_creacion)::INTEGER;

    INSERT INTO helpdesk.ticket_codigo_counter (
        id_area,
        anio,
        last_number,
        created_at,
        updated_at
    )
    VALUES (
        p_id_area,
        v_anio,
        1,
        NOW(),
        NOW()
    )
    ON CONFLICT (id_area, anio)
    DO UPDATE SET
        last_number = helpdesk.ticket_codigo_counter.last_number + 1,
        updated_at = NOW()
    RETURNING last_number
    INTO v_next_number;

    RETURN
        v_codigo_area
        || '-'
        || v_anio::TEXT
        || '-'
        || LPAD(v_next_number::TEXT, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION "helpdesk"."set_codigo_ticket"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF (
        NEW.codigo_ticket IS NULL
        OR BTRIM(NEW.codigo_ticket) = ''
    )
    AND NEW.id_area_destino IS NOT NULL
    THEN
        NEW.codigo_ticket := helpdesk.next_codigo_ticket(
            NEW.id_area_destino,
            NEW.fecha_creacion
        );
    END IF;

    RETURN NEW;
END;
$function$;

CREATE TRIGGER "trg_set_codigo_ticket"
BEFORE INSERT OR UPDATE OF "id_area_destino" ON "helpdesk"."fact_ticket"
FOR EACH ROW EXECUTE FUNCTION "helpdesk"."set_codigo_ticket"();
