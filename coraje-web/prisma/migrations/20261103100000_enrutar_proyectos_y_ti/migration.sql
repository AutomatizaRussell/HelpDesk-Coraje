-- =====================================================================
-- Todo ticket del tipo «proyectos y ti» entra por Alex Bolaños.
-- =====================================================================
-- En PowerApps, Tipo_Requerimiento = "PROYECTOS Y TI" va a un correo fijo
-- en la fórmula de Nuevo, sin mirar la categoría
-- (reglas-negocio-powerapps.md §5 y §13.5). Aquí esa excepción vive como
-- filas de helpdesk.routing_rule, una por tipo del catálogo, y la carga
-- inicial la dejó a medias:
--
--   · categoría «automatizacion» -> alexbolanos@rbcol.co  (correcto)
--   · categoría «ti»             -> ti.gct@rbcol.co       (desvío sin decisión)
--   · categoría «otros»          -> sin regla: caía en el encargado de
--                                   ADMINISTRACIÓN (mayrajaramillo@rbcol.co)
--
-- Decisión del usuario del 03-nov-2026: todo lo de automatización y TI pasa
-- primero por Alex, que lo reparte reasignando (tickets.md §4.3).
--
-- Efecto lateral, buscado: la visibilidad por recepción (U13,
-- src/server/authorization/recepcion.ts) sale de la misma regla, así que
-- ti.gct deja de recibir en su bandeja los tickets nuevos de «ti» y Alex
-- pasa a recibirlos. Los tickets ya creados conservan su responsable.
--
-- Es un dato de configuración, no una transformación: ni la ingesta ni otra
-- migración escriben routing_rule. Un tipo nuevo de «proyectos y ti» que
-- llegue después desde TipoReqHD no tendrá regla y caerá en el encargado del
-- área; riesgo aceptado, porque el catálogo pasa a ser de HelpDesk al
-- retirar PowerApps.
--
-- Idempotente: reescribe las reglas existentes y crea las que faltan.
-- =====================================================================

INSERT INTO "helpdesk"."routing_rule" (
    "id_tipo_req",
    "encargado_interno",
    "descripcion",
    "activo"
)
SELECT
    tipo.id_tipo_req,
    'alexbolanos@rbcol.co',
    'PROYECTOS Y TI entra por Alex Bolaños, como en PowerApps (decisión del 03-nov-2026).',
    TRUE
FROM "helpdesk"."dim_tipo_requerimiento" AS tipo
WHERE LOWER(BTRIM(tipo.tipo_requerimiento)) = 'proyectos y ti'
ON CONFLICT ("id_tipo_req")
DO UPDATE SET
    "encargado_interno" = EXCLUDED."encargado_interno",
    "descripcion" = EXCLUDED."descripcion",
    "activo" = TRUE,
    "updated_at" = NOW();
