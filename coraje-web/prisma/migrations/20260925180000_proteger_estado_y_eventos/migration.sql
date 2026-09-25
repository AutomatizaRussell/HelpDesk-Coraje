-- =====================================================================
-- U6, fase 2 · La base hace cumplir el escritor único (docs/specs/tickets.md §3.1)
-- =====================================================================
-- Desde aquí, coraje_runtime (web) y coraje_etl (n8n) solo pueden cambiar
-- el estado de un ticket o escribir un evento llamando a
-- helpdesk.registrar_evento_ticket, que es SECURITY DEFINER.
--
-- Precondición cumplida antes de publicar esta migración (orden obligatorio
-- de §3.1): la ingesta reescrita está importada en n8n y verificada con dos
-- ejecuciones reales el 25-sep-2026 (2.898 MIGRACION_LEGACY, cero tickets
-- sin evento de inicio, cero desfasados, segunda ejecución sin eventos
-- nuevos). Ya no inserta en fact_ticket_evento ni asigna id_estado.
--
-- coraje_app (superusuario, solo emergencias humanas) no se ve afectado:
-- un superusuario ignora los privilegios. Lo que lo frena es la FK RESTRICT
-- de la fase 1, que impide borrar un ticket con historial.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Nadie cambia id_estado sin pasar por el escritor.
-- ---------------------------------------------------------------------
-- Un REVOKE UPDATE (id_estado) NO bastaría: el UPDATE concedido sobre la
-- tabla cubre todas sus columnas, y un REVOKE de columna no lo anula. Se
-- retira el UPDATE de tabla y se concede columna por columna, sin id_estado.
-- Una columna que se añada después a fact_ticket NO será actualizable por
-- estos roles hasta que una migración la conceda explícitamente.
--
-- La lista incluye todo lo que la ingesta (ON CONFLICT DO UPDATE de la
-- transformación 06, regla de mapeo de tipo) y la redirección actual
-- (features/redireccion/actions.ts) escriben hoy.
REVOKE UPDATE ON "helpdesk"."fact_ticket" FROM "coraje_runtime", "coraje_etl";

GRANT UPDATE (
    "id_ticket",
    "codigo_ticket",
    "descripcion_problema",
    "id_cliente_contai",
    "id_solicitante",
    "id_area_destino",
    "id_asignado",
    "id_prioridad",
    "id_tipo_req",
    "fecha_creacion",
    "fecha_limite",
    "fecha_resolucion",
    "respuesta_final",
    "calificacion",
    "origen_sistema",
    "ultima_actualizacion",
    "encargado_interno"
) ON "helpdesk"."fact_ticket" TO "coraje_runtime", "coraje_etl";


-- ---------------------------------------------------------------------
-- 2. Un ticket no se borra (en la v1 se rechaza, T8).
-- ---------------------------------------------------------------------
-- TRUNCATE también: un TRUNCATE ... CASCADE vaciaría el registro de eventos
-- sin que la FK RESTRICT lo impida.
REVOKE DELETE, TRUNCATE ON "helpdesk"."fact_ticket" FROM "coraje_runtime", "coraje_etl";


-- ---------------------------------------------------------------------
-- 3. El registro de eventos solo crece, y solo a través del escritor.
-- ---------------------------------------------------------------------
-- Sin INSERT directo (§3, regla 2: un evento insertado a mano podría
-- declarar un cambio de estado que la proyección no tuvo), sin UPDATE ni
-- DELETE (regla 1: solo INSERT), sin TRUNCATE. SELECT se conserva: la
-- aplicación lee la historia.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "helpdesk"."fact_ticket_evento"
    FROM "coraje_runtime", "coraje_etl";


-- ---------------------------------------------------------------------
-- 4. Fin de los DEFAULT temporales de la fase 1.
-- ---------------------------------------------------------------------
-- Existían para rellenar los eventos legacy y para que la ingesta antigua
-- siguiera viva hasta importar la nueva. El escritor declara siempre actor y
-- visibilidad: un valor por defecto aquí solo serviría para ocultar un
-- INSERT que no debería existir.
ALTER TABLE "helpdesk"."fact_ticket_evento"
    ALTER COLUMN "tipo_actor" DROP DEFAULT,
    ALTER COLUMN "visibilidad" DROP DEFAULT;
