-- =================================================================
-- 06_transform_ticket.sql
-- TRANSFORMACIÓN DE TICKETS LEGACY SHAREPOINT -> FACT_TICKET
-- =================================================================
--
-- Objetivo:
--   Transformar registros crudos de staging.sp_helpdesk_raw hacia:
--
--     1. helpdesk.fact_ticket
--        Tabla canónica PostgreSQL-first.
--
--     2. helpdesk.ticket_legacy_sharepoint_ref
--        Tabla puente temporal para preservar relación con SharePoint.
--
-- Principios:
--   - fact_ticket NO depende de SharePoint.
--   - fact_ticket NO contiene consecutivo_sp.
--   - fact_ticket NO contiene titulo_ticket.
--   - Id_Req legacy se conserva como legacy_id_req.
--   - Title de SharePoint se conserva como legacy_title.
--   - sp_id se conserva solo en ticket_legacy_sharepoint_ref.
--   - codigo_ticket lo genera PostgreSQL mediante helpdesk.next_codigo_ticket().
--
-- Requisitos previos:
--   - helpdesk.fact_ticket existe.
--   - helpdesk.ticket_legacy_sharepoint_ref existe.
--   - helpdesk.next_codigo_ticket() existe.
--   - staging.sp_helpdesk_raw ya está cargada.
--   - dimensiones core/helpdesk ya están pobladas.
-- =================================================================


-- =================================================================
-- -1. VALIDACIÓN: BUZONES COMPARTIDOS SIN MARCADOR RESUELTO
-- =================================================================
-- core.dim_personal.correo_corporativo no tiene UNIQUE (docs/specs/tickets.md
-- §7.3): un mismo correo puede tener más de una fila cuando un buzón
-- compartido cambió de ocupante entre cargas. La resolución de más abajo
-- (sección 1, sol/asig) da por hecho que, para cualquier correo duplicado,
-- exactamente una fila está marcada es_responsable_historico_no_identificado
-- y el resto son personas reales identificadas. Si aparece un correo
-- duplicado sin esa marca -o con más de una-, la ambigüedad no tiene una
-- resolución segura definida todavía: aborta en vez de elegir en silencio,
-- mismo criterio que la validación de áreas desconocidas en
-- 01_transform_area.sql.
DO $validate_shared_mailboxes$
DECLARE
    v_unresolved TEXT;
BEGIN
    SELECT string_agg(correo_corporativo, ', ' ORDER BY correo_corporativo)
    INTO v_unresolved
    FROM core.dim_personal
    WHERE correo_corporativo IS NOT NULL
    GROUP BY correo_corporativo
    HAVING COUNT(*) > 1
       AND COUNT(*) FILTER (WHERE es_responsable_historico_no_identificado) <> 1;

    IF v_unresolved IS NOT NULL THEN
        RAISE EXCEPTION
            'core.dim_personal tiene correos compartidos sin marcador histórico único (docs/specs/tickets.md §7.3): %',
            v_unresolved;
    END IF;
END;
$validate_shared_mailboxes$;


-- =================================================================
-- 0. MAPEO TEMPORAL SHAREPOINT -> TICKET
-- =================================================================
-- Este mapa temporal resuelve la identidad canónica del ticket.
--
-- Si el sp_id ya existe en ticket_legacy_sharepoint_ref:
--   reutiliza el id_ticket existente.
--
-- Si el sp_id es nuevo:
--   genera un id_ticket nuevo que luego se insertará en fact_ticket.
--
-- No es una tabla permanente.
-- No contamina el modelo.
-- =================================================================

DROP TABLE IF EXISTS tmp_ticket_legacy_map;

CREATE TEMP TABLE tmp_ticket_legacy_map AS
SELECT
    s.sp_id,
    COALESCE(ref.id_ticket, gen_random_uuid()) AS id_ticket,
    NULLIF(TRIM(s.payload->>'Id_Req'), '') AS legacy_id_req,
    NULLIF(TRIM(s.payload->>'Title'), '') AS legacy_title,
    CAST(s.payload->>'Created' AS TIMESTAMPTZ) AS legacy_created_at
FROM staging.sp_helpdesk_raw s
LEFT JOIN helpdesk.ticket_legacy_sharepoint_ref ref
    ON ref.sp_id = s.sp_id;


-- =================================================================
-- 1. TRANSFORMACIÓN DE LA TABLA DE TICKETS
-- =================================================================
-- Inserta o actualiza tickets canónicos.
--
-- La idempotencia ya no depende de SharePoint ID.
-- La idempotencia usa id_ticket resuelto en tmp_ticket_legacy_map.
--
-- El código visible codigo_ticket NO se inserta explícitamente:
--   lo genera el DEFAULT helpdesk.next_codigo_ticket()
--   cuando el ticket es nuevo.
-- =================================================================

INSERT INTO helpdesk.fact_ticket (
    id_ticket,
    descripcion_problema,
    id_cliente_contai,
    id_solicitante,
    id_area_destino,
    id_asignado,
    id_estado,
    id_prioridad,
    id_tipo_req,
    fecha_creacion,
    fecha_limite,
    fecha_resolucion,
    respuesta_final,
    calificacion,
    origen_sistema
)
SELECT
    ref.id_ticket,

    COALESCE(NULLIF(TRIM(s.payload->>'Requerimiento'), ''), 'Sin descripción') AS descripcion_problema,

    c.id_cliente_contai,

    CASE
        WHEN c.id_cliente_contai IS NOT NULL THEN NULL
        ELSE sol.id_personal
    END AS id_solicitante,

    ad.id_area AS id_area_destino,
    asig.id_personal AS id_asignado,

    COALESCE(est.id_estado, est_default.id_estado) AS id_estado,

    prio.id_prioridad,
    tr.id_tipo_req,

    CAST(s.payload->>'Created' AS TIMESTAMPTZ) AS fecha_creacion,

    TO_DATE(
        NULLIF(TRIM(s.payload->>'Fecha_Max_Respuesta'), ''),
        'DD/MM/YYYY'
    )::TIMESTAMPTZ AS fecha_limite,

    CASE
        WHEN NULLIF(TRIM(s.payload->>'Fecha_Respuesta'), '') IS NULL THEN NULL

        -- Si la fecha de respuesta es anterior al día de creación, es inválida.
        WHEN TO_DATE(
                NULLIF(TRIM(s.payload->>'Fecha_Respuesta'), ''),
                'DD/MM/YYYY'
             ) < CAST(s.payload->>'Created' AS TIMESTAMPTZ)::DATE
        THEN NULL

        -- Si la respuesta fue el mismo día de creación, usamos fecha_creacion.
        -- Esto evita violar el constraint porque SharePoint no trae hora de respuesta.
        WHEN TO_DATE(
                NULLIF(TRIM(s.payload->>'Fecha_Respuesta'), ''),
                'DD/MM/YYYY'
             ) = CAST(s.payload->>'Created' AS TIMESTAMPTZ)::DATE
        THEN CAST(s.payload->>'Created' AS TIMESTAMPTZ)

        -- Si fue en un día posterior, medianoche de ese día ya es válida.
        ELSE TO_DATE(
                NULLIF(TRIM(s.payload->>'Fecha_Respuesta'), ''),
                'DD/MM/YYYY'
             )::TIMESTAMPTZ
    END AS fecha_resolucion,

    NULLIF(TRIM(s.payload->>'Respuesta'), '') AS respuesta_final,

    CAST(
        NULLIF(TRIM(s.payload->>'Calificaci_x00f3_n'), '')
        AS INTEGER
    ) AS calificacion,

    'SHAREPOINT_LEGACY' AS origen_sistema

FROM staging.sp_helpdesk_raw s

INNER JOIN tmp_ticket_legacy_map ref
    ON ref.sp_id = s.sp_id

LEFT JOIN core.dim_cliente_contai c
    ON c.identificacion_fiscal = TRIM(s.payload->>'Nit')

-- Resuelve a una sola fila por correo, incluso cuando el correo es un buzón
-- compartido con más de una fila en dim_personal (docs/specs/tickets.md
-- §7.3). Si hay ambigüedad, el ORDER BY prioriza la fila marcada como
-- responsable histórico no identificado sobre cualquier persona real: la
-- validación de la sección -1 ya garantizó que existe como máximo una. Un
-- correo sin duplicados resuelve a su única fila sin que la marca importe.
LEFT JOIN LATERAL (
    SELECT p.id_personal
    FROM core.dim_personal p
    WHERE p.correo_corporativo = TRIM(LOWER(s.payload->>'Title'))
    ORDER BY p.es_responsable_historico_no_identificado DESC
    LIMIT 1
) sol ON TRUE

LEFT JOIN LATERAL (
    SELECT p.id_personal
    FROM core.dim_personal p
    WHERE p.correo_corporativo = TRIM(LOWER(s.payload->>'AsignadoA'))
    ORDER BY p.es_responsable_historico_no_identificado DESC
    LIMIT 1
) asig ON TRUE

-- PROYECTOS Y TI no es un área canónica (sql/elt/01_transform_area.sql): sus
-- tickets se resuelven contra ADMINISTRACIÓN, que es donde vive su catálogo de
-- tipo_requerimiento.
LEFT JOIN core.dim_area ad
    ON core.norm_text(ad.nombre_area) = CASE
        WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'proyectos y ti'
        THEN 'administracion'
        ELSE core.norm_text(s.payload->>'OData__x00c1_rea_Destino')
    END

LEFT JOIN helpdesk.dim_estado est
    ON core.norm_text(s.payload->>'Estado') = core.norm_text(est.nombre_estado)

LEFT JOIN helpdesk.dim_estado est_default
    ON est_default.nombre_estado = 'ABIERTO'

-- Normalización específica para resolver valores legacy de HelpDeskBd
-- contra el catálogo actual de TipoReqHD. Toda comparación es contra el
-- resultado de core.norm_text() (minúsculas, sin tildes) — un literal en
-- mayúsculas aquí nunca coincide y la rama cae en silencio al ELSE.
--
-- Reconciliado desde la copia embebida en n8n (nodo "PG - Transform 06
-- Tickets Legacy", n8n/CORAJE - INCREMENTAL COMPLETO - SharePoint to
-- PostgreSQL.json) — hallazgo F11, docs/estado/handoff.md. La versión
-- anterior de este bloque comparaba contra literales en MAYÚSCULAS
-- ('ADMINISTRACION', 'PROYECTOS Y TI'...) que jamás coincidían con la salida
-- de norm_text(): todo ticket legacy de AUTOMATIZACIÓN/TI/IMPUESTOS caía sin
-- reclasificar y quedaba sin id_tipo_req resuelto contra el catálogo. No era
-- una versión "menos completa" que la de n8n — era una versión inerte.
--
-- Casos detectados:
--
-- 1. ADMINISTRACIÓN, tipo AUTOMATIZACIÓN o TI:
--    Tickets antiguos traen:
--      Tipo_Requerimiento = AUTOMATIZACIÓN / TI
--      Categoría1         = APLICACIÓN / SOPORTE / HARDWARE / SOFTWARE / REDES
--
--    Pero el catálogo actual espera:
--      Tipo_Requerimiento = PROYECTOS Y TI
--      Categoría1         = AUTOMATIZACIÓN / TI
--      Categoría2         = APLICACIÓN / SOPORTE / HARDWARE / SOFTWARE / REDES
--
-- 2. ADMINISTRACIÓN, tipo ya PROYECTOS Y TI:
--    Algunos tickets ya traen el tipo correcto pero con categoría 1/2
--    mezcladas de forma inconsistente. Se reparten entre AUTOMATIZACIÓN y TI
--    según categoría 2 (o, si categoría 1 ya quedó en TI, según si
--    categoría 2 pertenece al catálogo antiguo de AUTOMATIZACIÓN):
--      Categoría2 APLICACIÓN/SOPORTE/MEJORAS                  -> categoría 1 AUTOMATIZACIÓN
--      Categoría2 HARDWARE/SOFTWARE/REDES                     -> categoría 1 TI
--      Categoría1 TI y Categoría2 APLICACIÓN/SOPORTE/MEJORAS  -> categoría 1 AUTOMATIZACIÓN
--
-- 3. REVISORÍA:
--    Tickets antiguos traen:
--      Tipo_Requerimiento = IMPUESTOS CONSULTA / IMPUESTOS
--
--    Pero el catálogo actual espera:
--      Tipo_Requerimiento = IMPUESTOS ASESORATE
--
-- 4. ADMINISTRACIÓN-RECEPCIÓN / OTROS:
--    Ticket trae categoría OTROS, pero catálogo tiene categoría NULL.
--
-- 5. REVISORÍA / OTROS:
--    Ticket puede venir sin categoría, pero catálogo tiene categoría OTROS.
LEFT JOIN LATERAL (
    SELECT
        CASE
            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') IN ('automatizacion', 'ti')
            THEN 'proyectos y ti'

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') = 'proyectos y ti'
            THEN 'proyectos y ti'

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'revisoria'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') IN ('impuestos consulta', 'impuestos')
            THEN 'impuestos asesorate'

            ELSE core.norm_text(s.payload->>'Tipo_Requerimiento')
        END AS tipo_requerimiento_match,

        CASE
            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') IN ('automatizacion', 'ti')
            THEN core.norm_text(s.payload->>'Tipo_Requerimiento')

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') = 'proyectos y ti'
             AND core.norm_text(s.payload->>'Categor_x00ed_a2') IN ('aplicacion', 'soporte', 'mejoras')
            THEN 'automatizacion'

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') = 'proyectos y ti'
             AND core.norm_text(s.payload->>'Categor_x00ed_a2') IN ('hardware', 'software', 'redes')
            THEN 'ti'

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') = 'proyectos y ti'
             AND core.norm_text(s.payload->>'Categor_x00ed_a1') = 'ti'
             AND core.norm_text(s.payload->>'Categor_x00ed_a2') IN ('aplicacion', 'soporte', 'mejoras')
            THEN 'automatizacion'

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion-recepcion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') = 'otros'
             AND core.norm_text(s.payload->>'Categor_x00ed_a1') = 'otros'
            THEN NULL

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'revisoria'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') IN ('impuestos consulta', 'impuestos')
            THEN core.norm_text(s.payload->>'Categor_x00ed_a1')

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'revisoria'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') = 'otros'
             AND core.norm_text(s.payload->>'Categor_x00ed_a1') IS NULL
            THEN 'otros'

            ELSE core.norm_text(s.payload->>'Categor_x00ed_a1')
        END AS categoria_1_match,

        CASE
            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') IN ('automatizacion', 'ti')
            THEN core.norm_text(s.payload->>'Categor_x00ed_a1')

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'administracion'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') = 'proyectos y ti'
             AND core.norm_text(s.payload->>'Categor_x00ed_a2') IS NOT NULL
            THEN core.norm_text(s.payload->>'Categor_x00ed_a2')

            WHEN core.norm_text(s.payload->>'OData__x00c1_rea_Destino') = 'revisoria'
             AND core.norm_text(s.payload->>'Tipo_Requerimiento') IN ('impuestos consulta', 'impuestos')
            THEN NULL

            ELSE core.norm_text(s.payload->>'Categor_x00ed_a2')
        END AS categoria_2_match
) tipo_legacy ON TRUE

LEFT JOIN helpdesk.dim_tipo_requerimiento tr
    ON tr.id_area = ad.id_area
   AND core.norm_text(tr.tipo_requerimiento) = tipo_legacy.tipo_requerimiento_match
   AND COALESCE(core.norm_text(tr.categoria_1), '') = COALESCE(tipo_legacy.categoria_1_match, '')
   AND COALESCE(core.norm_text(tr.categoria_2), '') = COALESCE(tipo_legacy.categoria_2_match, '')

LEFT JOIN helpdesk.dim_prioridad prio
    ON UPPER(s.payload->>'Prioridad') LIKE '%' || prio.nombre_prioridad || '%'

WHERE
    (
        c.id_cliente_contai IS NOT NULL
        OR sol.id_personal IS NOT NULL
    )

ON CONFLICT (id_ticket)
DO UPDATE SET
    descripcion_problema = EXCLUDED.descripcion_problema,
    id_cliente_contai = EXCLUDED.id_cliente_contai,
    id_solicitante = EXCLUDED.id_solicitante,
    id_area_destino = EXCLUDED.id_area_destino,
    id_asignado = EXCLUDED.id_asignado,
    id_estado = EXCLUDED.id_estado,
    id_prioridad = EXCLUDED.id_prioridad,
    id_tipo_req = EXCLUDED.id_tipo_req,
    fecha_creacion = EXCLUDED.fecha_creacion,
    fecha_limite = EXCLUDED.fecha_limite,
    fecha_resolucion = EXCLUDED.fecha_resolucion,
    respuesta_final = EXCLUDED.respuesta_final,
    calificacion = EXCLUDED.calificacion,
    origen_sistema = EXCLUDED.origen_sistema,
    ultima_actualizacion = NOW();


-- =================================================================
-- 2. PERSISTIR REFERENCIA LEGACY SHAREPOINT
-- =================================================================
-- Solo se persisten referencias legacy para tickets que sí quedaron
-- insertados o actualizados en helpdesk.fact_ticket.
--
-- Esto evita referencias huérfanas.
-- =================================================================

INSERT INTO helpdesk.ticket_legacy_sharepoint_ref (
    id_ticket,
    sp_id,
    legacy_id_req,
    legacy_title,
    legacy_created_at
)
SELECT
    m.id_ticket,
    m.sp_id,
    m.legacy_id_req,
    m.legacy_title,
    m.legacy_created_at
FROM tmp_ticket_legacy_map m
INNER JOIN helpdesk.fact_ticket f
    ON f.id_ticket = m.id_ticket
ON CONFLICT (sp_id)
DO UPDATE SET
    id_ticket = EXCLUDED.id_ticket,
    legacy_id_req = EXCLUDED.legacy_id_req,
    legacy_title = EXCLUDED.legacy_title,
    legacy_created_at = EXCLUDED.legacy_created_at,
    updated_at = NOW();