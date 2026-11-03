-- =====================================================================
-- Retira la acción de rechazar un ticket (decisión del usuario del
-- 30-oct-2026: «eliminar el botón y todo lo relacionado a Rechazar»).
-- =====================================================================
-- Nunca se usó: ningún ticket real terminó RECHAZADO (V9 de tickets.md), y
-- los de prueba se borraron en 20261103120000. La aplicación deja de ofrecer
-- la acción y de tener el comando; aquí se retira el permiso.
--
-- Lo que se conserva a propósito:
--   · el estado RECHAZADO en helpdesk.dim_estado y el evento RECHAZO del
--     escritor único: son vocabulario de la historia, y si PowerApps llegara
--     a rechazar algo antes de apagarse, la ingesta debe poder contarlo;
--   · los tipos de aviso RECHAZO_*: los retira la migración del aprobador,
--     que reescribe el mismo CHECK.
-- =====================================================================

-- La regla antes que la acción: la referencia va de la regla a la acción.
DELETE FROM "app"."permiso_regla" WHERE "codigo_accion" = 'ticket.rechazar';
DELETE FROM "app"."permiso_accion" WHERE "codigo" = 'ticket.rechazar';
