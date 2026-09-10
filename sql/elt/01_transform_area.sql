-- ============================================================
-- Transformación: RecibeHelpdesk -> core.dim_area
-- ============================================================
-- PROYECTOS Y TI se excluye deliberadamente como área canónica. Sus tipos de
-- requerimiento se siguen clasificando bajo ADMINISTRACIÓN.
--
-- codigo_area es explícito y estable. Un área de origen desconocida aborta la
-- transformación en vez de insertarse en silencio con un código nulo o inferido.
-- ============================================================

DO $validate_source_areas$
DECLARE
    v_unknown_areas TEXT;
BEGIN
    SELECT string_agg(source_area, ', ' ORDER BY source_area)
    INTO v_unknown_areas
    FROM (
        SELECT DISTINCT TRIM(UPPER(payload->>'Area')) AS source_area
        FROM staging.sp_recibe_helpdesk_raw
        WHERE payload->>'Area' IS NOT NULL
          AND core.norm_text(payload->>'Area') <> 'proyectos y ti'
          AND core.norm_text(payload->>'Area') NOT IN (
              'administracion',
              'administracion recepcion',
              'bpo',
              'contabilidad',
              'impuestos',
              'legal',
              'revisoria'
          )
    ) AS unknown;

    IF v_unknown_areas IS NOT NULL THEN
        RAISE EXCEPTION
            'RecibeHelpdesk contiene áreas canónicas desconocidas: %',
            v_unknown_areas;
    END IF;
END;
$validate_source_areas$;

WITH source_rows AS (
    SELECT
        sp_id,
        core.norm_text(payload->>'Area') AS area_norm,
        NULLIF(TRIM(LOWER(payload->>'Recibe')), '') AS encargado_recepcion
    FROM staging.sp_recibe_helpdesk_raw
    WHERE payload->>'Area' IS NOT NULL
      AND core.norm_text(payload->>'Area') <> 'proyectos y ti'
),
canonical AS (
    SELECT
        MIN(sp_id) AS sp_area_id,
        CASE area_norm
            WHEN 'administracion' THEN 'ADMINISTRACIÓN'
            WHEN 'administracion recepcion' THEN 'ADMINISTRACIÓN-RECEPCIÓN'
            WHEN 'bpo' THEN 'BPO'
            WHEN 'contabilidad' THEN 'CONTABILIDAD'
            WHEN 'impuestos' THEN 'IMPUESTOS'
            WHEN 'legal' THEN 'LEGAL'
            WHEN 'revisoria' THEN 'REVISORÍA'
        END AS nombre_area,
        CASE area_norm
            WHEN 'administracion' THEN 'ADM'
            WHEN 'administracion recepcion' THEN 'ADR'
            WHEN 'bpo' THEN 'BPO'
            WHEN 'contabilidad' THEN 'CON'
            WHEN 'impuestos' THEN 'IMP'
            WHEN 'legal' THEN 'LEG'
            WHEN 'revisoria' THEN 'REV'
        END AS codigo_area,
        MIN(encargado_recepcion) AS encargado_recepcion
    FROM source_rows
    GROUP BY area_norm
),
upserted AS (
    INSERT INTO core.dim_area (
        sp_area_id,
        nombre_area,
        codigo_area,
        encargado_recepcion
    )
    SELECT
        sp_area_id,
        nombre_area,
        codigo_area,
        encargado_recepcion
    FROM canonical
    ON CONFLICT (nombre_area)
    DO UPDATE SET
        sp_area_id = EXCLUDED.sp_area_id,
        codigo_area = EXCLUDED.codigo_area,
        encargado_recepcion = EXCLUDED.encargado_recepcion,
        updated_at = NOW()
    RETURNING id_area
)
SELECT
    '01_transform_area'::TEXT AS transform_step,
    (SELECT COUNT(*) FROM canonical)::INTEGER AS canonical_areas,
    (SELECT COUNT(*) FROM upserted)::INTEGER AS upserted_areas,
    NOW() AS finished_at;
