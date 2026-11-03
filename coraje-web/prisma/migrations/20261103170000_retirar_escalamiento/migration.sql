-- =====================================================================
-- U29 · Retira el escalamiento diario de avisos (U15)
-- =====================================================================
-- Decisión del usuario del 30-oct-2026: «que el correo de 1 día hábil
-- después ya no ocurra; solo los mencionados». Los correos a empleados son
-- ahora cuatro, uno por momento (crear, observador, aprobación, cierre:
-- ticket-mail-content.ts), y salen con la acción, no de una revisión diaria.
--
-- Se retiran la tabla del registro por persona y día y sus dos funciones.
-- La aplicación ya no tiene la ruta que las llamaba ni n8n el workflow
-- «HELPDESK - Escalar avisos V2». Los avisos de la campana no cambian: sus
-- índices de atención los sigue usando la vista.
--
-- Datos: aviso_escalamiento solo registra qué correo de escalamiento salió a
-- quién y qué día. No es historia del ticket.
-- =====================================================================

-- Primero la que reclama, que llama a la otra.
DROP FUNCTION "helpdesk"."reclamar_escalamientos_avisos"();
DROP FUNCTION "helpdesk"."aviso_escalable"("helpdesk"."ticket_aviso", DATE);
DROP TABLE "helpdesk"."aviso_escalamiento";
