-- =====================================================================
-- U29 · Todos los tickets pasan al código por mes: ADM-202611-1
-- =====================================================================
-- Decisión del usuario del 03-nov-2026: el formato de 20261103180000 no es
-- solo para lo nuevo; «debe cambiar todos los tickets que ya existen». Se
-- renumeran todos los tickets con área, los de PowerApps incluidos, con la
-- misma regla que next_codigo_ticket:
--   área - AAAAMM del mes de creación en Bogotá - consecutivo del área en ese
--   mes, por orden de creación (y por id, si dos coinciden en el instante).
--
-- Lo que se pierde, aceptado por el usuario: el código anterior
-- (ADM-2026-0123) deja de existir. No lo guarda ninguna otra tabla salvo el
-- informe de tipos sin mapear de la ingesta, que lo vuelve a copiar de
-- fact_ticket en cada pasada, y los asuntos de correos ya enviados, que se
-- quedan como salieron. El identificador de PowerApps (Id_Req) no cambia.
--
-- Unicidad: el formato nuevo tiene seis cifras en el grupo central y el viejo
-- cuatro, y dentro de un área y un mes el consecutivo no se repite, así que
-- el UPDATE no puede chocar con fact_ticket_codigo_ticket_key en ninguna fila.
--
-- Los contadores de ticket_codigo_mes quedan en el último número asignado de
-- cada área y mes: el siguiente ticket continúa la serie.
-- =====================================================================

-- Nadie crea tickets mientras se renumera (la ingesta de n8n podría correr
-- a la vez); se libera al terminar la transacción de la migración.
LOCK TABLE "helpdesk"."fact_ticket" IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE "tmp_codigo_nuevo" ON COMMIT DROP AS
SELECT
    ticket.id_ticket,
    ticket.id_area_destino AS id_area,
    TO_CHAR(ticket.fecha_creacion AT TIME ZONE 'America/Bogota', 'YYYYMM')::INTEGER AS periodo,
    area.codigo_area,
    ROW_NUMBER() OVER (
        PARTITION BY ticket.id_area_destino, TO_CHAR(ticket.fecha_creacion AT TIME ZONE 'America/Bogota', 'YYYYMM')
        ORDER BY ticket.fecha_creacion, ticket.id_ticket
    )::INTEGER AS numero
FROM "helpdesk"."fact_ticket" AS ticket
JOIN "core"."dim_area" AS area
    ON area.id_area = ticket.id_area_destino;

UPDATE "helpdesk"."fact_ticket" AS ticket
SET codigo_ticket = nuevo.codigo_area || '-' || nuevo.periodo::TEXT || '-' || nuevo.numero::TEXT
FROM tmp_codigo_nuevo AS nuevo
WHERE ticket.id_ticket = nuevo.id_ticket;

-- Los contadores: exactamente lo asignado. Un área y mes sin tickets no
-- tiene fila, y su primer ticket empezará en 1.
DELETE FROM "helpdesk"."ticket_codigo_mes";
INSERT INTO "helpdesk"."ticket_codigo_mes" ("id_area", "periodo", "last_number")
SELECT id_area, periodo, MAX(numero)
FROM tmp_codigo_nuevo
GROUP BY id_area, periodo;

-- Comprobación: ningún ticket con área se quedó con el formato anterior.
DO $comprobar$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "helpdesk"."fact_ticket"
        WHERE id_area_destino IS NOT NULL
          AND codigo_ticket !~ '^[A-Z0-9]+-[0-9]{6}-[0-9]+$'
    ) THEN
        RAISE EXCEPTION 'recodificar_tickets: quedaron tickets con área sin el código nuevo';
    END IF;
END;
$comprobar$;
