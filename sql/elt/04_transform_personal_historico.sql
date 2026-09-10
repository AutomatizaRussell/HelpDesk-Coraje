-- =================================================================
-- RECUPERACIÓN DE EMPLEADOS HISTÓRICOS DESDE LOS TICKETS (INFERIDOS)
-- =================================================================
-- Toda fila que este script inserta es, por definición, un correo que
-- aparece en tickets legacy sin una persona ya conocida en dim_personal. Si
-- ese correo *sí* existe ya (con otro sp_personal_id, p. ej. porque hoy lo
-- ocupa alguien activo), el filtro de más abajo evita duplicar la fila, pero
-- no evita el caso real que motivó docs/specs/tickets.md §7.3: un buzón
-- compartido cuyo ocupante cambió entre que se generaron los tickets legacy
-- y que se sincronizó el directorio activo. Por eso cada fila que este
-- script sí llega a insertar se marca como responsable histórico no
-- identificado: nunca representa a la persona que ocupa el correo hoy,
-- siempre a alguien real pero sin nombre recuperable.
INSERT INTO core.dim_personal (
    nombre_completo,
    correo_corporativo,
    cargo,
    estado_activo,
    es_responsable_historico_no_identificado
)
SELECT
    UPPER(SPLIT_PART(correo_fantasma, '@', 1)) AS nombre_completo,
    correo_fantasma AS correo_corporativo,
    'EX-EMPLEADO (RECUPERADO DEL HISTORIAL)' AS cargo,
    FALSE AS estado_activo,
    TRUE AS es_responsable_historico_no_identificado
FROM (
    -- Extraemos todos los correos únicos de los Solicitantes y Asignados en los tickets
    SELECT TRIM(LOWER(payload->>'Title')) AS correo_fantasma FROM staging.sp_helpdesk_raw
    UNION
    SELECT TRIM(LOWER(payload->>'AsignadoA')) FROM staging.sp_helpdesk_raw
) lista_correos
WHERE correo_fantasma IS NOT NULL 
  AND correo_fantasma LIKE '%@%.%' -- Validación básica de que sí es un correo
  -- El filtro mágico: Solo inserta los que NO existan ya en tu dimensión de personal
  AND correo_fantasma NOT IN (
      SELECT correo_corporativo 
      FROM core.dim_personal 
      WHERE correo_corporativo IS NOT NULL
  );