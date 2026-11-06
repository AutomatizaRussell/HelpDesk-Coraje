-- =====================================================================
-- U39 · Indicadores: una fila por ticket con lo que mide el Power BI
-- (docs/specs/indicadores.md)
-- =====================================================================
-- El Power BI «IND HELPDESK» calcula sus medidas sobre la lista HelpDeskBd.
-- Esta vista calcula lo mismo, ticket por ticket, sobre fact_ticket. Las
-- consultas del panel agregan sobre ella con los filtros de quien consulta:
-- la base hace la agregación, la aplicación no trae tickets a memoria.
--
-- La lógica se copia tal cual (decisión del usuario, 05-nov-2026), incluida
-- la escala de oportunidad, que se redefinirá después. Por eso esta versión
-- cuenta DÍAS CALENDARIO, como el DAX: primero se concilia contra el Power
-- BI y después se pasa a días hábiles (indicadores.md §4).
--
-- Traducción de cada columna del DAX:
--   Fecha_Solicitud     -> fecha_creacion, como fecha de Bogotá
--   Fecha_Max_Respuesta -> fecha_limite, como fecha de Bogotá
--   Fecha_Respuesta     -> fecha_resolucion, como fecha de Bogotá
--   Respuesta <> ""     -> respuesta_final IS NOT NULL (la 06 guarda
--                          NULLIF(TRIM(Respuesta), ''), así que es la misma
--                          condición)
--   Estado = "Cerrado"  -> nombre_estado = 'CERRADO'
--   Prioridad «Alta (1 día)» / «Media (3 días)» / «Baja (5 días)» ->
--                          nombre_prioridad ALTA / MEDIA / BAJA
--
-- Blancos del DAX (hipótesis H1, indicadores.md §3). En DAX, un DATEDIFF con
-- una fecha en blanco da blanco, y un blanco comparado con un número vale 0.
-- Aquí eso es COALESCE(…, 0) en cada comparación. Si la conciliación contra
-- el Power BI muestra lo contrario, se corrige aquí.
--
-- La vista no filtra por origen: quien consulta elige. Mientras PowerApps
-- siga en uso, el panel lee solo SHAREPOINT_LEGACY.
--
-- Costo: se evalúa en cada consulta, sin materializar. Sobre unos 3.100
-- tickets es un recorrido completo trivial; materializarla exigiría un
-- proceso que la refresque (CLAUDE.md, economía de recursos). Se mide con
-- EXPLAIN ANALYZE si el panel se siente lento, no antes.
-- =====================================================================

CREATE VIEW "helpdesk"."v_indicador_ticket" AS
WITH base AS (
    SELECT
        ticket.id_ticket,
        ticket.codigo_ticket,
        ref.legacy_id_req,
        ticket.origen_sistema,
        ticket.id_area_destino,
        ticket.id_area_remite,
        ticket.id_solicitante,
        ticket.id_asignado,
        ticket.id_tipo_req,
        ticket.id_estado,
        estado.nombre_estado,
        prioridad.nombre_prioridad,
        ticket.calificacion,
        ticket.respuesta_final IS NOT NULL AS respondido,
        (ticket.fecha_creacion   AT TIME ZONE 'America/Bogota')::DATE AS fecha_solicitud,
        (ticket.fecha_limite     AT TIME ZONE 'America/Bogota')::DATE AS fecha_max_respuesta,
        (ticket.fecha_resolucion AT TIME ZONE 'America/Bogota')::DATE AS fecha_respuesta
    FROM helpdesk.fact_ticket AS ticket
    JOIN helpdesk.dim_estado AS estado
        ON estado.id_estado = ticket.id_estado
    LEFT JOIN helpdesk.dim_prioridad AS prioridad
        ON prioridad.id_prioridad = ticket.id_prioridad
    LEFT JOIN helpdesk.ticket_legacy_sharepoint_ref AS ref
        ON ref.id_ticket = ticket.id_ticket
),
diferencias AS (
    SELECT
        base.*,
        -- [dias respuesta] = DATEDIFF(Fecha_Max_Respuesta, Fecha_Respuesta, DAY).
        -- NULL si falta una de las dos; COALESCE(…, 0) al comparar (H1).
        base.fecha_respuesta - base.fecha_max_respuesta AS dias_respuesta,
        -- DATEDIFF(Fecha_Respuesta, Fecha_Solicitud + k, DAY), k = 0..3: la
        -- rama Media compara contra la fecha de solicitud, no contra el límite.
        COALESCE(base.fecha_solicitud + 0 - base.fecha_respuesta, 0) AS desde_solicitud_0,
        COALESCE(base.fecha_solicitud + 1 - base.fecha_respuesta, 0) AS desde_solicitud_1,
        COALESCE(base.fecha_solicitud + 2 - base.fecha_respuesta, 0) AS desde_solicitud_2,
        COALESCE(base.fecha_solicitud + 3 - base.fecha_respuesta, 0) AS desde_solicitud_3
    FROM base
),
clasificados AS (
    SELECT
        diferencias.*,
        -- [Califica oportunidad respuesta], rama por rama y en el mismo orden
        -- del IF anidado: la primera condición que se cumple gana. Las
        -- incoherencias de la escala (un día tarde en Alta vale más que a
        -- tiempo en Baja) son del original y se conservan a propósito.
        CASE
            WHEN diferencias.nombre_estado <> 'CERRADO' THEN 'Ticket abierto'
            WHEN diferencias.nombre_prioridad = 'ALTA'
             AND COALESCE(diferencias.dias_respuesta, 0) <= 0 THEN '1.Excelente'
            WHEN diferencias.nombre_prioridad = 'ALTA'
             AND COALESCE(diferencias.dias_respuesta, 0) = 1 THEN '2.Sobresaliente'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND (diferencias.desde_solicitud_1 = 0 OR diferencias.desde_solicitud_0 = 0) THEN '1.Excelente'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND (diferencias.desde_solicitud_2 = 0 OR COALESCE(diferencias.dias_respuesta, 0) = -2) THEN '2.Sobresaliente'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND diferencias.desde_solicitud_3 = 0 THEN '3.Regular'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND COALESCE(diferencias.dias_respuesta, 0) IN (-1, 0) THEN '3.Regular'
            -- El original dice «<= -5 || <= -3», que equivale a <= -3.
            WHEN diferencias.nombre_prioridad = 'BAJA'
             AND COALESCE(diferencias.dias_respuesta, 0) <= -3 THEN '1.Excelente'
            WHEN diferencias.nombre_prioridad = 'BAJA'
             AND COALESCE(diferencias.dias_respuesta, 0) <= -2 THEN '2.Sobresaliente'
            -- «<= -1 || = 0» sobre enteros equivale a <= 0.
            WHEN diferencias.nombre_prioridad = 'BAJA'
             AND COALESCE(diferencias.dias_respuesta, 0) <= 0 THEN '3.Regular'
            ELSE '4.Deficiente'
        END AS categoria_oportunidad
    FROM diferencias
)
SELECT
    clasificados.id_ticket,
    clasificados.codigo_ticket,
    clasificados.legacy_id_req,
    clasificados.origen_sistema,
    clasificados.id_area_destino,
    clasificados.id_area_remite,
    clasificados.id_solicitante,
    clasificados.id_asignado,
    clasificados.id_tipo_req,
    clasificados.id_estado,
    clasificados.nombre_estado,
    clasificados.nombre_prioridad,
    clasificados.calificacion,
    clasificados.respondido,
    clasificados.fecha_solicitud,
    EXTRACT(YEAR  FROM clasificados.fecha_solicitud)::INTEGER AS anio,
    EXTRACT(MONTH FROM clasificados.fecha_solicitud)::INTEGER AS mes,
    clasificados.fecha_max_respuesta,
    clasificados.fecha_respuesta,
    clasificados.dias_respuesta,
    clasificados.categoria_oportunidad,
    -- [Porcentaje calificación]. Un ticket abierto con el plazo pasado vale 0;
    -- uno abierto en plazo no entra en el promedio (NULL). «Hoy» es el de
    -- Bogotá al consultar, no el de la última actualización del Power BI.
    -- Sin fecha límite, el DAX compara contra un blanco (0) y lo da por
    -- vencido (H1).
    CASE
        WHEN clasificados.categoria_oportunidad = 'Ticket abierto'
         AND (NOW() AT TIME ZONE 'America/Bogota')::DATE
             > COALESCE(clasificados.fecha_max_respuesta, DATE '1899-12-30') THEN 0
        WHEN clasificados.categoria_oportunidad = '1.Excelente'     THEN 1
        WHEN clasificados.categoria_oportunidad = '2.Sobresaliente' THEN 0.75
        WHEN clasificados.categoria_oportunidad = '3.Regular'       THEN 0.5
        WHEN clasificados.categoria_oportunidad = '4.Deficiente'    THEN 0.25
    END::NUMERIC(3, 2) AS porcentaje_oportunidad
FROM clasificados;

-- La aplicación y la conciliación (operacion.md) leen la vista; nadie escribe
-- en ella. Se concede aquí y no por los privilegios por defecto de F6, que se
-- configuraron fuera de las migraciones: así la concesión queda versionada.
GRANT SELECT ON "helpdesk"."v_indicador_ticket" TO "coraje_runtime", "coraje_etl";
