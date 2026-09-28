-- =====================================================================
-- U8 · Valores nuevos de los vocabularios cerrados (solo ADD VALUE)
-- (docs/specs/acceso-clientes.md; docs/specs/tickets.md §6; permisos.md §6)
-- =====================================================================
-- Va sola en su propio archivo por la precaución de tickets.md §6: Prisma
-- envuelve cada migración en una transacción, y un valor añadido con
-- ALTER TYPE ... ADD VALUE no se puede usar dentro de la transacción que lo
-- crea. La migración siguiente (20260928110000_acceso_clientes) ya los usa.
--
-- Solo añade valores: ninguna fila existente cambia y ninguna consulta
-- actual se rompe. Quitar un valor más adelante exigiría recrear el tipo.
-- =====================================================================

-- El cliente pasa a ser actor de eventos: radica sus propios tickets (T1).
-- Hasta U8 no existía dónde referenciarlo (tickets.md §6, decisión del
-- 25-sep-2026, «El cliente no es actor en la v1»).
ALTER TYPE "helpdesk"."tipo_actor_evento" ADD VALUE 'CLIENTE';

-- Dos roles nuevos, decididos por el usuario el 28-sep-2026:
--   CLASIFICADOR  redirige los tickets del portal (T3). No se llama
--                 RECEPCION para no confundirlo con la recepción física de la
--                 firma, que es otra área.
--   ADMIN         administra los accesos de clientes. Separado del anterior:
--                 quien reparte el trabajo no concede acceso externo
--                 («quien prepara no expone», permisos.md §3).
-- Sus reglas se siembran en la migración siguiente.
ALTER TYPE "core"."rol_aplicacion" ADD VALUE 'CLASIFICADOR';
ALTER TYPE "core"."rol_aplicacion" ADD VALUE 'ADMIN';
