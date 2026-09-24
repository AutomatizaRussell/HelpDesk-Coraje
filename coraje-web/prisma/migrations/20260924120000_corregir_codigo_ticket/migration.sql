-- =====================================================================
-- Corrige la generación de codigo_ticket, que tiene detenida la ingesta
-- de SharePoint desde el 14-sep-2026.
-- =====================================================================
-- Dos defectos combinados, ambos en el mecanismo capturado por el
-- baseline (20260910000000_baseline, sección 8):
--
-- 1. El trigger consume un número del contador por cada fila que la
--    ingesta propone, aunque el ticket ya exista. PostgreSQL ejecuta los
--    triggers BEFORE INSERT antes de resolver ON CONFLICT, y la ingesta
--    reenvía todos los tickets de staging en cada ejecución. El contador
--    avanza unas 2.800 posiciones por ejecución sin que nazca ningún
--    ticket: en 2024 y 2025 cada contador vale exactamente diez veces el
--    número de tickets reales de su área.
--
-- 2. LPAD(numero, 4, '0') TRUNCA por la derecha los números de cinco
--    cifras: el 10641 se convierte en '1064'. Cuando el contador de
--    ADM/2026 pasó de 9.999, el código de un ticket nuevo coincidió con
--    ADM-2026-1064, que ya existía, y la sentencia falló. El fallo
--    revierte también el avance del contador, así que cada ejecución
--    siguiente repite exactamente la misma colisión.
--
-- Los códigos ya emitidos NO se tocan: son únicos, aunque tengan huecos.
-- Esta migración solo cambia el mecanismo y reajusta el contador.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. El trigger no genera código para una fila que ya existe.
-- ---------------------------------------------------------------------
-- En un INSERT ... ON CONFLICT (id_ticket) DO UPDATE, la fila propuesta
-- de un ticket existente termina en la rama UPDATE, que no escribe
-- codigo_ticket. Generarle un código solo gastaba un número. La consulta
-- por clave primaria cuesta un acceso a índice por fila.
--
-- La rama UPDATE OF id_area_destino conserva su comportamiento: genera
-- código solo si el ticket aún no tiene uno (ticket radicado sin área que
-- recibe área al redirigirse).
CREATE OR REPLACE FUNCTION "helpdesk"."set_codigo_ticket"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1
        FROM helpdesk.fact_ticket AS existing
        WHERE existing.id_ticket = NEW.id_ticket
    ) THEN
        RETURN NEW;
    END IF;

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


-- ---------------------------------------------------------------------
-- 2. El número se rellena a cuatro cifras como mínimo, nunca se trunca.
-- ---------------------------------------------------------------------
-- Idéntica al baseline salvo el RETURN: el ancho de LPAD es el mayor
-- entre 4 y la longitud real del número.
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
        || LPAD(
            v_next_number::TEXT,
            GREATEST(4, LENGTH(v_next_number::TEXT)),
            '0'
        );
END;
$function$;


-- ---------------------------------------------------------------------
-- 3. Cada contador vuelve al mayor número realmente emitido.
-- ---------------------------------------------------------------------
-- El número se lee del propio código (<area>-<año>-<número>), porque es
-- con el código con lo que choca la restricción UNIQUE, y no del área o
-- la fecha actuales del ticket. Un contador sin códigos emitidos no se
-- toca. Ningún código existente es mayor que el nuevo valor, así que el
-- siguiente número generado no puede colisionar.
UPDATE helpdesk.ticket_codigo_counter AS counter
SET
    last_number = issued.max_number,
    updated_at = NOW()
FROM (
    SELECT
        area.id_area,
        split_part(ticket.codigo_ticket, '-', 2)::INTEGER AS anio,
        MAX(split_part(ticket.codigo_ticket, '-', 3)::INTEGER) AS max_number
    FROM helpdesk.fact_ticket AS ticket
    JOIN core.dim_area AS area
        ON area.codigo_area = split_part(ticket.codigo_ticket, '-', 1)
    WHERE ticket.codigo_ticket ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
    GROUP BY area.id_area, split_part(ticket.codigo_ticket, '-', 2)
) AS issued
WHERE counter.id_area = issued.id_area
  AND counter.anio = issued.anio;
