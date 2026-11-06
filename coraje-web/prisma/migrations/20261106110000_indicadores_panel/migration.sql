-- =====================================================================
-- U39 · Panel de indicadores: blancos del DAX y permiso del panel
-- (docs/specs/indicadores.md §3 y §6, I4)
-- =====================================================================
-- 1. La vista pasa de H1 a H2. 20261106100000 suponía que un DATEDIFF con
--    una fecha en blanco da blanco, y que el blanco vale 0 al comparar. La
--    regla documentada de DAX (SQLBI, «Blank handling in DAX») es otra: el
--    blanco se convierte al tipo que pide la expresión, y DATEDIFF pide
--    fechas. El blanco es entonces el día 0 de DAX, el 30-dic-1899, y la
--    diferencia es de decenas de miles de días, nunca 0. Afecta a 6 tickets
--    legacy (2 cerrados sin fecha de respuesta, 4 sin fecha límite).
--
--    Las columnas de la vista no cambian, ni en nombre ni en tipo ni en
--    orden: CREATE OR REPLACE VIEW no admite otra cosa, y las consultas del
--    panel no se enteran. `dias_respuesta` sigue siendo la diferencia real,
--    NULL si falta una fecha; la del DAX es interna (`dias_dax`).
--
-- 2. Permiso `indicadores.ver`, alcance TOTAL para los tres roles. Es
--    provisional y deliberado (decisión del usuario, 06-nov-2026): no hay
--    usuarios reales, y el panel tiene que mostrar todo para compararse con
--    el Power BI. U40 lo reemplaza por la visibilidad por nivel fijado en el
--    ticket. El alcance vive aquí, no en el código: cambiarlo es otra
--    migración, sin tocar el panel.
-- =====================================================================

CREATE OR REPLACE VIEW "helpdesk"."v_indicador_ticket" AS
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
        -- Diferencia real, para mostrar: NULL si falta una de las dos fechas.
        base.fecha_respuesta - base.fecha_max_respuesta AS dias_respuesta,
        -- [dias respuesta] como lo calcula el DAX (H2): una fecha en blanco es
        -- el día 0 de DAX, el 30-dic-1899. Solo para clasificar.
        COALESCE(base.fecha_respuesta, DATE '1899-12-30')
            - COALESCE(base.fecha_max_respuesta, DATE '1899-12-30') AS dias_dax,
        -- DATEDIFF(Fecha_Respuesta, Fecha_Solicitud + k, DAY), k = 0..3: la
        -- rama Media compara contra la fecha de solicitud, no contra el límite.
        base.fecha_solicitud + 0 - COALESCE(base.fecha_respuesta, DATE '1899-12-30') AS desde_solicitud_0,
        base.fecha_solicitud + 1 - COALESCE(base.fecha_respuesta, DATE '1899-12-30') AS desde_solicitud_1,
        base.fecha_solicitud + 2 - COALESCE(base.fecha_respuesta, DATE '1899-12-30') AS desde_solicitud_2,
        base.fecha_solicitud + 3 - COALESCE(base.fecha_respuesta, DATE '1899-12-30') AS desde_solicitud_3
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
             AND diferencias.dias_dax <= 0 THEN '1.Excelente'
            WHEN diferencias.nombre_prioridad = 'ALTA'
             AND diferencias.dias_dax = 1 THEN '2.Sobresaliente'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND (diferencias.desde_solicitud_1 = 0 OR diferencias.desde_solicitud_0 = 0) THEN '1.Excelente'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND (diferencias.desde_solicitud_2 = 0 OR diferencias.dias_dax = -2) THEN '2.Sobresaliente'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND diferencias.desde_solicitud_3 = 0 THEN '3.Regular'
            WHEN diferencias.nombre_prioridad = 'MEDIA'
             AND diferencias.dias_dax IN (-1, 0) THEN '3.Regular'
            -- El original dice «<= -5 || <= -3», que equivale a <= -3.
            WHEN diferencias.nombre_prioridad = 'BAJA'
             AND diferencias.dias_dax <= -3 THEN '1.Excelente'
            WHEN diferencias.nombre_prioridad = 'BAJA'
             AND diferencias.dias_dax <= -2 THEN '2.Sobresaliente'
            -- «<= -1 || = 0» sobre enteros equivale a <= 0.
            WHEN diferencias.nombre_prioridad = 'BAJA'
             AND diferencias.dias_dax <= 0 THEN '3.Regular'
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
    -- Sin fecha límite, el DAX compara contra un blanco, que vale 0 y en una
    -- fecha es el 30-dic-1899: lo da por vencido (H2, igual que antes).
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

-- ---------------------------------------------------------------------
-- Permiso del panel
-- ---------------------------------------------------------------------
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('indicadores.ver', 'Ver indicadores',
     'Ver el panel de indicadores: volumen, oportunidad de respuesta y calidad de los tickets.');

INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance") VALUES
    ('COLABORADOR', 'indicadores.ver', 'TOTAL'),
    ('REDIRECTOR',  'indicadores.ver', 'TOTAL'),
    ('ADMIN',       'indicadores.ver', 'TOTAL');
