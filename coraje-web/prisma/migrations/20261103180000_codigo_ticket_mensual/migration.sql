-- =====================================================================
-- U29 · Código del ticket por área, año y mes: ADM-202611-1
-- =====================================================================
-- Decisión del usuario del 30-oct y del 03-nov-2026: se mantiene el código
-- del área; después, el año y el mes de creación (AAAAMM); después, un
-- consecutivo por área y mes que empieza en 1 cada mes y crece sin ceros a la
-- izquierda (1, 15, 120). El guion separa los grupos, así que el número no se
-- confunde con el mes.
--
-- El mes es el de Bogotá: un ticket creado el 31 a las 20:00 es de ese mes,
-- aunque en UTC ya sea el siguiente.
--
-- Lo que no cambia:
--   · los códigos ya emitidos (ADM-2026-0123): son únicos y se conservan;
--   · el trigger trg_set_codigo_ticket, que sigue llamando a esta función
--     con la misma firma, también para los tickets que llegan de PowerApps;
--   · la unicidad (fact_ticket_codigo_ticket_key). El formato nuevo tiene seis
--     cifras en el grupo central y el viejo cuatro: no pueden chocar.
--
-- helpdesk.ticket_codigo_counter (área y año) deja de usarse y se conserva:
-- dice hasta qué número llegó cada área con el formato anterior.
-- =====================================================================

CREATE TABLE "helpdesk"."ticket_codigo_mes" (
    "id_area" UUID NOT NULL,
    -- AAAAMM, en hora de Bogotá.
    "periodo" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "ticket_codigo_mes_pkey" PRIMARY KEY ("id_area", "periodo"),
    CONSTRAINT "chk_ticket_codigo_mes_periodo"
        CHECK ("periodo" BETWEEN 200001 AND 999912 AND "periodo" % 100 BETWEEN 1 AND 12),
    CONSTRAINT "chk_ticket_codigo_mes_last_number" CHECK ("last_number" >= 0),
    CONSTRAINT "ticket_codigo_mes_id_area_fkey"
        FOREIGN KEY ("id_area") REFERENCES "core"."dim_area"("id_area")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- La escribe solo la función de abajo, que es SECURITY DEFINER: la llama el
-- trigger de fact_ticket como quien inserta el ticket (coraje_etl en la
-- ingesta), y ningún rol de servicio necesita tocar la tabla directamente.
REVOKE ALL ON "helpdesk"."ticket_codigo_mes" FROM "coraje_runtime", "coraje_etl";

-- Misma firma que la de 20260924120000_corregir_codigo_ticket: el trigger no
-- cambia. Pasa a SECURITY DEFINER, con search_path fijado y todo nombre
-- calificado, por la tabla protegida de arriba. El incremento es un único INSERT ... ON CONFLICT DO UPDATE, que
-- bloquea la fila del área y el mes: dos tickets simultáneos no reciben el
-- mismo número.
CREATE OR REPLACE FUNCTION "helpdesk"."next_codigo_ticket"(
    p_id_area UUID,
    p_fecha_creacion TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_codigo_area TEXT;
    v_periodo INTEGER;
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

    v_periodo := TO_CHAR(p_fecha_creacion AT TIME ZONE 'America/Bogota', 'YYYYMM')::INTEGER;

    INSERT INTO helpdesk.ticket_codigo_mes (id_area, periodo, last_number, created_at, updated_at)
    VALUES (p_id_area, v_periodo, 1, NOW(), NOW())
    ON CONFLICT (id_area, periodo)
    DO UPDATE SET
        last_number = helpdesk.ticket_codigo_mes.last_number + 1,
        updated_at = NOW()
    RETURNING last_number
    INTO v_next_number;

    RETURN v_codigo_area || '-' || v_periodo::TEXT || '-' || v_next_number::TEXT;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."next_codigo_ticket"(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."next_codigo_ticket"(UUID, TIMESTAMPTZ) TO "coraje_runtime", "coraje_etl";
