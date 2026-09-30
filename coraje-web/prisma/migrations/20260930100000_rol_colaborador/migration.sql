-- =====================================================================
-- Rol COLABORADOR y visibilidad por recepción (docs/specs/permisos.md §4.5)
-- =====================================================================
-- Decisión del usuario del 30-sep-2026:
--
--   1. AGENTE pasa a llamarse COLABORADOR. Era un valor provisional de U3,
--      no un rol del legacy: PowerApps no tenía roles. RENAME VALUE conserva
--      cada fila que lo usa (dim_personal, permiso_regla), así que nadie
--      pierde acceso y ninguna regla cambia de dueño.
--
--   2. El alcance AREA deja de significar «el área a la que pertenezco» y
--      pasa a significar «lo que recibo según el enrutamiento». Ese cambio
--      vive en src/server/authorization/scope.ts; en la base no cambia
--      ningún valor. La consecuencia: un COLABORADOR que no recibe nada ve
--      solo lo suyo, y el encargado de un área ve toda su área.
--
--   3. ADMIN consulta todos los tickets de todas las áreas (TOTAL). Solo
--      consultar: responder, reasignar o rechazar siguen exigiendo ser el
--      responsable, igual que para cualquiera.
--
-- Nada se borra: una renombración de valor y una actualización de regla.
-- =====================================================================

ALTER TYPE "core"."rol_aplicacion" RENAME VALUE 'AGENTE' TO 'COLABORADOR';

UPDATE "app"."permiso_regla"
SET "alcance" = 'TOTAL', "updated_at" = NOW()
WHERE "rol" = 'ADMIN' AND "codigo_accion" = 'ticket.consultar';
