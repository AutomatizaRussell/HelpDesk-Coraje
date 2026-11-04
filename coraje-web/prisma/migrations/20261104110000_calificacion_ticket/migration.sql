-- =====================================================================
-- U34 · Calificación del ticket (docs/specs/tickets.md §15)
-- =====================================================================
-- Decisiones del usuario del 04-nov-2026, sobre el legacy de PowerApps
-- (legacy/reglas-negocio-powerapps.md §8) y las del 03-sep-2026 (§13):
--   · califica solo quien radicó el ticket, una sola vez, de 1 a 5;
--   · solo un ticket CERRADO, sin plazo para hacerlo;
--   · con 1 o 2 estrellas el comentario es obligatorio;
--   · solo los tickets nacidos en HelpDesk: los de PowerApps son de
--     SharePoint hasta el corte, y la ingesta escribe su calificación;
--   · calificar no cambia el estado ni es requisito de nada.
--
-- Quién escribe qué:
--   · helpdesk.calificar_ticket valida el número y el comentario, escribe el
--     evento por el escritor único y proyecta fact_ticket.calificacion, todo
--     en una llamada. Es la única forma de calificar desde la aplicación.
--   · la rama CALIFICACION del escritor decide quién, cuándo y cuántas
--     veces; el índice parcial lo garantiza también frente a dos
--     calificaciones simultáneas.
--   · coraje_runtime pierde el UPDATE directo de la columna: una calificación
--     sin su evento ya no se puede escribir. coraje_etl lo conserva, porque
--     la ingesta copia la de los tickets de PowerApps.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Una sola calificación por ticket
-- ---------------------------------------------------------------------
-- El escritor ya lo comprueba bajo el bloqueo de la fila del ticket; el
-- índice es la garantía que no depende de que nadie olvide ese bloqueo.
CREATE UNIQUE INDEX "ux_fact_ticket_evento_calificacion"
    ON "helpdesk"."fact_ticket_evento" ("id_ticket")
    WHERE "tipo_evento" = 'CALIFICACION';


-- ---------------------------------------------------------------------
-- 2. Escritor único con la rama CALIFICACION
-- ---------------------------------------------------------------------
-- Copia de la versión de 20261103160000_aprobacion_ticket con dos cambios:
--   · lee también el origen del ticket (v_origen);
--   · rama CALIFICACION: de un EMPLEADO, visible para ambos, sin cambio de
--     estado, solo quien radicó, solo CERRADO, solo un ticket de HelpDesk y
--     una sola vez.
-- Misma firma: CREATE OR REPLACE conserva los permisos.
CREATE OR REPLACE FUNCTION "helpdesk"."registrar_evento_ticket"(
    p_id_ticket UUID,
    p_tipo_evento "helpdesk"."tipo_evento_ticket",
    p_tipo_actor "helpdesk"."tipo_actor_evento",
    p_id_autor UUID,
    p_visibilidad "helpdesk"."visibilidad_evento",
    p_contenido TEXT,
    p_estado_nuevo TEXT DEFAULT NULL,
    p_event_hash TEXT DEFAULT NULL,
    p_fecha_registro TIMESTAMPTZ DEFAULT NULL,
    p_id_contacto_autor UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_id_estado_actual UUID;
    v_estado_actual TEXT;
    v_id_area UUID;
    v_id_asignado UUID;
    v_id_solicitante UUID;
    v_origen TEXT;
    v_id_estado_nuevo UUID;
    v_tiene_inicio BOOLEAN;
    v_id_evento UUID;
BEGIN
    IF p_id_ticket IS NULL OR p_tipo_evento IS NULL OR p_tipo_actor IS NULL
       OR p_visibilidad IS NULL THEN
        RAISE EXCEPTION 'registrar_evento_ticket: ticket, tipo, actor y visibilidad son obligatorios';
    END IF;

    IF NULLIF(BTRIM(p_contenido), '') IS NULL THEN
        RAISE EXCEPTION 'registrar_evento_ticket: el contenido del evento no puede estar vacío';
    END IF;

    -- Cada actor, con su columna y solo con ella. El CHECK de la tabla dice
    -- lo mismo; el mensaje con nombre ahorra leer su definición.
    IF p_tipo_actor = 'EMPLEADO' AND (p_id_autor IS NULL OR p_id_contacto_autor IS NOT NULL) THEN
        RAISE EXCEPTION 'registrar_evento_ticket: un evento de EMPLEADO exige id_autor y ningún contacto';
    END IF;

    IF p_tipo_actor = 'SISTEMA' AND (p_id_autor IS NOT NULL OR p_id_contacto_autor IS NOT NULL) THEN
        RAISE EXCEPTION 'registrar_evento_ticket: un evento de SISTEMA no lleva autor';
    END IF;

    IF p_tipo_actor = 'CLIENTE' AND (p_id_contacto_autor IS NULL OR p_id_autor IS NOT NULL) THEN
        RAISE EXCEPTION 'registrar_evento_ticket: un evento de CLIENTE exige id_contacto_autor y ningún id_autor';
    END IF;

    IF p_fecha_registro IS NOT NULL AND p_tipo_actor <> 'SISTEMA' THEN
        RAISE EXCEPTION 'registrar_evento_ticket: solo un evento de SISTEMA puede declarar su fecha';
    END IF;

    -- En la v1 el cliente solo radica (tickets.md §4.1): ninguna otra
    -- transición la ejecuta él.
    IF p_tipo_actor = 'CLIENTE' AND p_tipo_evento <> 'CREACION' THEN
        RAISE EXCEPTION 'registrar_evento_ticket: en la v1 un CLIENTE solo produce CREACION, no %', p_tipo_evento;
    END IF;

    -- El bloqueo serializa las escrituras concurrentes sobre el mismo ticket:
    -- dos transiciones simultáneas no pueden partir ambas del mismo estado.
    SELECT ticket.id_estado, estado.nombre_estado, ticket.id_area_destino, ticket.id_asignado,
           ticket.id_solicitante, ticket.origen_sistema
    INTO v_id_estado_actual, v_estado_actual, v_id_area, v_id_asignado, v_id_solicitante, v_origen
    FROM helpdesk.fact_ticket AS ticket
    JOIN helpdesk.dim_estado AS estado
        ON estado.id_estado = ticket.id_estado
    WHERE ticket.id_ticket = p_id_ticket
    FOR UPDATE OF ticket;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'registrar_evento_ticket: el ticket % no existe', p_id_ticket;
    END IF;

    IF p_event_hash IS NOT NULL AND EXISTS (
        SELECT 1 FROM helpdesk.fact_ticket_evento AS evento
        WHERE evento.event_hash = p_event_hash
    ) THEN
        RETURN NULL;
    END IF;

    IF p_estado_nuevo IS NOT NULL THEN
        SELECT estado.id_estado
        INTO v_id_estado_nuevo
        FROM helpdesk.dim_estado AS estado
        WHERE estado.nombre_estado = p_estado_nuevo;

        IF v_id_estado_nuevo IS NULL THEN
            RAISE EXCEPTION 'registrar_evento_ticket: el estado % no existe en dim_estado', p_estado_nuevo;
        END IF;
    END IF;

    v_tiene_inicio := EXISTS (
        SELECT 1 FROM helpdesk.fact_ticket_evento AS evento
        WHERE evento.id_ticket = p_id_ticket
          AND evento.tipo_evento IN ('CREACION', 'MIGRACION_LEGACY')
    );

    IF p_tipo_evento IN ('CREACION', 'MIGRACION_LEGACY') THEN
        IF v_tiene_inicio THEN
            RAISE EXCEPTION 'registrar_evento_ticket: el ticket % ya tiene evento de inicio', p_id_ticket;
        END IF;
        IF p_estado_nuevo IS NULL THEN
            RAISE EXCEPTION 'registrar_evento_ticket: % exige el estado inicial', p_tipo_evento;
        END IF;
    ELSIF NOT v_tiene_inicio THEN
        RAISE EXCEPTION 'registrar_evento_ticket: el ticket % no tiene evento de inicio; % no puede ser el primero',
            p_id_ticket, p_tipo_evento;
    END IF;

    CASE p_tipo_evento
        WHEN 'CREACION' THEN
            -- T1 / T2. El ticket se insertó en esta misma transacción con su
            -- estado inicial; el evento lo declara, no lo cambia.
            IF p_estado_nuevo NOT IN ('ABIERTO', 'ASIGNADO') THEN
                RAISE EXCEPTION 'registrar_evento_ticket: un ticket nace ABIERTO o ASIGNADO, no %', p_estado_nuevo;
            END IF;
            -- T1: lo que radica un cliente espera clasificación.
            IF p_tipo_actor = 'CLIENTE' AND p_estado_nuevo <> 'ABIERTO' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: un ticket de cliente nace ABIERTO, no %', p_estado_nuevo;
            END IF;
            IF v_id_estado_nuevo <> v_id_estado_actual THEN
                RAISE EXCEPTION 'registrar_evento_ticket: CREACION declara % pero el ticket se insertó en %',
                    p_estado_nuevo, v_estado_actual;
            END IF;

        WHEN 'MIGRACION_LEGACY' THEN
            IF p_tipo_actor <> 'SISTEMA' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: MIGRACION_LEGACY solo la escribe el SISTEMA';
            END IF;

        WHEN 'SINCRONIZACION_LEGACY' THEN
            IF p_tipo_actor <> 'SISTEMA' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: SINCRONIZACION_LEGACY solo la escribe el SISTEMA';
            END IF;
            IF p_estado_nuevo IS NULL OR v_id_estado_nuevo = v_id_estado_actual THEN
                RAISE EXCEPTION 'registrar_evento_ticket: SINCRONIZACION_LEGACY exige un estado distinto del actual (%)',
                    v_estado_actual;
            END IF;

        WHEN 'REDIRECCION' THEN
            -- T3: ABIERTO -> ASIGNADO.
            IF v_estado_actual <> 'ABIERTO' OR p_estado_nuevo IS DISTINCT FROM 'ASIGNADO' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: REDIRECCION va de ABIERTO a ASIGNADO (actual %, pedido %)',
                    v_estado_actual, p_estado_nuevo;
            END IF;

        WHEN 'REASIGNACION' THEN
            IF v_estado_actual <> 'ASIGNADO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: REASIGNACION exige un ticket ASIGNADO y no cambia su estado';
            END IF;
            IF v_id_asignado IS NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: REASIGNACION sin responsable en el ticket';
            END IF;

        WHEN 'RESPUESTA' THEN
            IF v_estado_actual <> 'ASIGNADO' OR p_estado_nuevo IS DISTINCT FROM 'CERRADO' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: RESPUESTA va de ASIGNADO a CERRADO (actual %, pedido %)',
                    v_estado_actual, p_estado_nuevo;
            END IF;
            -- U29: con una aprobación pendiente, el ticket no se cierra. La
            -- aplicación ya no ofrece el botón; esto es lo que lo garantiza.
            IF EXISTS (
                SELECT 1 FROM helpdesk.ticket_validacion AS aprobacion
                WHERE aprobacion.id_ticket = p_id_ticket AND aprobacion.resultado IS NULL
            ) THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_APROBACION_PENDIENTE el ticket % espera una aprobación', p_id_ticket;
            END IF;

        WHEN 'RECHAZO' THEN
            IF v_estado_actual NOT IN ('ABIERTO', 'ASIGNADO') OR p_estado_nuevo IS DISTINCT FROM 'RECHAZADO' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: RECHAZO va de ABIERTO o ASIGNADO a RECHAZADO (actual %, pedido %)',
                    v_estado_actual, p_estado_nuevo;
            END IF;

        WHEN 'COMENTARIO' THEN
            IF p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: un COMENTARIO no cambia el estado';
            END IF;

        -- U11 (tickets.md §11). Las tres ramas de seguimiento dicen casi lo
        -- mismo y se escriben por separado a propósito: cada tipo tiene su
        -- rama con nombre (event-model.contract.test.mts lo exige), y un
        -- cambio futuro en una no arrastra a las otras sin que nadie lo
        -- decida.
        WHEN 'OBSERVADOR_AGREGADO' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'INTERNO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: OBSERVADOR_AGREGADO es de un EMPLEADO, INTERNO y sin cambio de estado';
            END IF;
            IF v_estado_actual NOT IN ('ABIERTO', 'ASIGNADO') THEN
                RAISE EXCEPTION 'registrar_evento_ticket: no se añaden observadores a un ticket %', v_estado_actual;
            END IF;

        WHEN 'OBSERVADOR_RETIRADO' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'INTERNO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: OBSERVADOR_RETIRADO es de un EMPLEADO, INTERNO y sin cambio de estado';
            END IF;
            IF v_estado_actual NOT IN ('ABIERTO', 'ASIGNADO') THEN
                RAISE EXCEPTION 'registrar_evento_ticket: no se retiran observadores de un ticket %', v_estado_actual;
            END IF;

        WHEN 'SOLICITUD_VALIDACION' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'INTERNO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: SOLICITUD_VALIDACION es de un EMPLEADO, INTERNO y sin cambio de estado';
            END IF;
            IF v_estado_actual NOT IN ('ABIERTO', 'ASIGNADO') THEN
                RAISE EXCEPTION 'registrar_evento_ticket: no se pide validación en un ticket %', v_estado_actual;
            END IF;

        -- U29 (tickets.md §11.2). Responder una aprobación: solo la persona a
        -- quien se pidió, y solo mientras está pendiente. Que el evento y la
        -- fila de ticket_validacion digan lo mismo lo garantiza el comando, en
        -- la misma transacción; quién puede escribirlo, esta rama.
        WHEN 'APROBACION_OTORGADA' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'INTERNO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: APROBACION_OTORGADA es de un EMPLEADO, INTERNO y sin cambio de estado';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM helpdesk.ticket_validacion AS aprobacion
                WHERE aprobacion.id_ticket = p_id_ticket
                  AND aprobacion.id_destinatario = p_id_autor
                  AND aprobacion.resultado IS NULL
            ) THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_SIN_APROBACION_PENDIENTE nadie le pidió aprobar el ticket % a quien responde', p_id_ticket;
            END IF;

        WHEN 'APROBACION_DENEGADA' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'INTERNO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: APROBACION_DENEGADA es de un EMPLEADO, INTERNO y sin cambio de estado';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM helpdesk.ticket_validacion AS aprobacion
                WHERE aprobacion.id_ticket = p_id_ticket
                  AND aprobacion.id_destinatario = p_id_autor
                  AND aprobacion.resultado IS NULL
            ) THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_SIN_APROBACION_PENDIENTE nadie le pidió aprobar el ticket % a quien responde', p_id_ticket;
            END IF;

        -- La retira el responsable o quien la pidió: los dos pueden haberse
        -- equivocado de persona.
        WHEN 'APROBACION_RETIRADA' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'INTERNO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: APROBACION_RETIRADA es de un EMPLEADO, INTERNO y sin cambio de estado';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM helpdesk.ticket_validacion AS aprobacion
                JOIN helpdesk.fact_ticket_evento AS solicitud ON solicitud.id_evento = aprobacion.id_evento
                WHERE aprobacion.id_ticket = p_id_ticket
                  AND aprobacion.resultado IS NULL
                  AND (solicitud.id_autor = p_id_autor OR v_id_asignado = p_id_autor)
            ) THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_SIN_APROBACION_PENDIENTE el ticket % no tiene una aprobación que esta persona pueda retirar', p_id_ticket;
            END IF;

        WHEN 'COMENTARIO_SOLICITANTE' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'AMBOS' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: COMENTARIO_SOLICITANTE es de un EMPLEADO, visible para ambos y sin cambio de estado';
            END IF;
            IF v_id_solicitante IS NULL OR p_id_autor IS DISTINCT FROM v_id_solicitante THEN
                RAISE EXCEPTION 'registrar_evento_ticket: COMENTARIO_SOLICITANTE solo lo escribe quien radicó el ticket %', p_id_ticket;
            END IF;
            IF v_estado_actual NOT IN ('ABIERTO', 'ASIGNADO') THEN
                RAISE EXCEPTION 'registrar_evento_ticket: un ticket % ya no admite comentarios del solicitante', v_estado_actual;
            END IF;

        -- U34 (tickets.md §15). El número y el comentario los valida
        -- helpdesk.calificar_ticket, que también proyecta la columna; aquí,
        -- quién, cuándo y cuántas veces.
        WHEN 'CALIFICACION' THEN
            IF p_tipo_actor <> 'EMPLEADO' OR p_visibilidad <> 'AMBOS' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: CALIFICACION es de un EMPLEADO, visible para ambos y sin cambio de estado';
            END IF;
            IF v_id_solicitante IS NULL OR p_id_autor IS DISTINCT FROM v_id_solicitante THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_CALIFICACION_NO_SOLICITANTE solo califica quien radicó el ticket %', p_id_ticket;
            END IF;
            IF v_estado_actual <> 'CERRADO' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_CALIFICACION_NO_CERRADO un ticket % no se califica', v_estado_actual;
            END IF;
            -- Los de PowerApps son de SharePoint hasta el corte, y la ingesta
            -- escribe su calificación (sincronizacion-sharepoint.md §4.3).
            -- Misma lista que OPERABLE_ORIGINS (ticket-state.ts).
            IF v_origen NOT IN ('SISTEMA_INTERNO', 'PORTAL_CLIENTE') THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_CALIFICACION_LEGACY el ticket % se califica en PowerApps', p_id_ticket;
            END IF;
            IF EXISTS (
                SELECT 1 FROM helpdesk.fact_ticket_evento AS evento
                WHERE evento.id_ticket = p_id_ticket AND evento.tipo_evento = 'CALIFICACION'
            ) THEN
                RAISE EXCEPTION 'registrar_evento_ticket: HD_YA_CALIFICADO el ticket % ya tiene calificación', p_id_ticket;
            END IF;
    END CASE;

    IF p_estado_nuevo = 'ASIGNADO' AND (v_id_area IS NULL OR v_id_asignado IS NULL) THEN
        RAISE EXCEPTION 'registrar_evento_ticket: el ticket % no puede quedar ASIGNADO sin área y responsable',
            p_id_ticket;
    END IF;

    INSERT INTO helpdesk.fact_ticket_evento (
        event_hash,
        id_ticket,
        id_autor,
        id_contacto_autor,
        tipo_evento,
        tipo_actor,
        visibilidad,
        id_estado_anterior,
        id_estado_nuevo,
        contenido,
        fecha_registro
    )
    VALUES (
        p_event_hash,
        p_id_ticket,
        p_id_autor,
        p_id_contacto_autor,
        p_tipo_evento,
        p_tipo_actor,
        p_visibilidad,
        CASE WHEN v_id_estado_nuevo IS NULL OR p_tipo_evento = 'CREACION' THEN NULL ELSE v_id_estado_actual END,
        v_id_estado_nuevo,
        p_contenido,
        COALESCE(p_fecha_registro, NOW())
    )
    ON CONFLICT (event_hash) DO NOTHING
    RETURNING id_evento INTO v_id_evento;

    IF v_id_evento IS NULL THEN
        RETURN NULL;
    END IF;

    IF v_id_estado_nuevo IS NOT NULL AND v_id_estado_nuevo <> v_id_estado_actual THEN
        UPDATE helpdesk.fact_ticket
        SET id_estado = v_id_estado_nuevo,
            ultima_actualizacion = NOW()
        WHERE id_ticket = p_id_ticket;
    END IF;

    RETURN v_id_evento;
END;
$function$;


-- ---------------------------------------------------------------------
-- 3. Calificar: evento y proyección en una sola llamada
-- ---------------------------------------------------------------------
-- El evento guarda el número en su texto para que la historia se lea sola;
-- la columna lo guarda como dato para contar y promediar en SQL. Que digan lo
-- mismo lo garantiza que solo esta función escribe las dos.
--
-- Los fallos que la persona puede entender llevan un prefijo HD_ que la
-- aplicación traduce (ticket-errors.ts); el resto son defectos.
CREATE FUNCTION "helpdesk"."calificar_ticket"(
    p_id_ticket UUID,
    p_id_autor UUID,
    p_calificacion INTEGER,
    p_comentario TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_comentario TEXT := NULLIF(BTRIM(p_comentario), '');
    v_id_evento UUID;
BEGIN
    IF p_id_ticket IS NULL OR p_id_autor IS NULL OR p_calificacion IS NULL THEN
        RAISE EXCEPTION 'calificar_ticket: ticket, persona y calificación son obligatorios';
    END IF;

    -- Decisión del 03-sep-2026: el rango se valida en servidor, no solo en el
    -- control de estrellas como hacía PowerApps.
    IF p_calificacion NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'calificar_ticket: HD_CALIFICACION_FUERA_DE_RANGO % no está entre 1 y 5', p_calificacion;
    END IF;

    -- Una calificación baja sin motivo no le dice al equipo qué corregir.
    IF p_calificacion <= 2 AND v_comentario IS NULL THEN
        RAISE EXCEPTION 'calificar_ticket: HD_CALIFICACION_SIN_COMENTARIO una calificación de % exige comentario', p_calificacion;
    END IF;

    -- El escritor bloquea el ticket y decide quién, cuándo y cuántas veces.
    v_id_evento := helpdesk.registrar_evento_ticket(
        p_id_ticket,
        'CALIFICACION',
        'EMPLEADO',
        p_id_autor,
        'AMBOS',
        'Calificó la atención con ' || p_calificacion || ' de 5.'
            || COALESCE(E'\n\n' || v_comentario, '')
    );

    -- La fila ya está bloqueada por el escritor. Sin evento previo, la
    -- columna está vacía en un ticket de HelpDesk: si no lo está, algo la
    -- escribió por fuera y no se pisa.
    UPDATE helpdesk.fact_ticket
    SET calificacion = p_calificacion
    WHERE id_ticket = p_id_ticket
      AND calificacion IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'calificar_ticket: HD_YA_CALIFICADO el ticket % ya tiene calificación', p_id_ticket;
    END IF;

    RETURN v_id_evento;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."calificar_ticket"(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."calificar_ticket"(UUID, UUID, INTEGER, TEXT) TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 4. La aplicación ya no escribe la calificación directamente
-- ---------------------------------------------------------------------
-- Un REVOKE de tabla retira también los UPDATE por columna. Se vuelve a
-- conceder la lista de 20260925180000_proteger_estado_y_eventos sin
-- calificacion, y solo a coraje_runtime: coraje_etl conserva la suya.
REVOKE UPDATE ON "helpdesk"."fact_ticket" FROM "coraje_runtime";

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
    "origen_sistema",
    "ultima_actualizacion",
    "encargado_interno"
) ON "helpdesk"."fact_ticket" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 5. Aviso al responsable
-- ---------------------------------------------------------------------
-- Una novedad en la campana de quien atendió el ticket, sin correo: los
-- correos son los cuatro de U29 (tickets.md §12.1).
ALTER TABLE "helpdesk"."ticket_aviso"
    DROP CONSTRAINT "chk_ticket_aviso_tipo",
    DROP CONSTRAINT "chk_ticket_aviso_clase";

ALTER TABLE "helpdesk"."ticket_aviso"
    ADD CONSTRAINT "chk_ticket_aviso_tipo" CHECK ("tipo" IN (
        'CREACION_RESPONSABLE',
        'REASIGNACION_RESPONSABLE',
        'REDIRECCION_RESPONSABLE',
        'SOLICITUD_VALIDACION',
        'REASIGNACION_SOLICITANTE',
        'RESPUESTA_SOLICITANTE',
        'OBSERVADOR_AGREGADO',
        'RESPUESTA_OBSERVADOR',
        'COMENTARIO_SOLICITANTE_RESPONSABLE',
        'APROBACION_OTORGADA',
        'APROBACION_DENEGADA',
        'CALIFICACION_RESPONSABLE'
    )),
    ADD CONSTRAINT "chk_ticket_aviso_clase" CHECK (
        "clase" = CASE WHEN "tipo" IN (
            'CREACION_RESPONSABLE',
            'REASIGNACION_RESPONSABLE',
            'REDIRECCION_RESPONSABLE',
            'SOLICITUD_VALIDACION'
        ) THEN 'ATENCION' ELSE 'NOVEDAD' END
    );


-- ---------------------------------------------------------------------
-- 6. Permiso de calificar
-- ---------------------------------------------------------------------
-- PROPIO para todo rol que consulta tickets: «propio» es haberlo radicado
-- (scope.ts). Ningún rol lo tiene con otro alcance: calificar en nombre de
-- otra persona no existe, y la rama del escritor lo impide igual.
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('ticket.calificar', 'Calificar un ticket',
     'Calificar de 1 a 5 la atención de un ticket cerrado que la persona radicó.');

INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance")
SELECT DISTINCT regla."rol", 'ticket.calificar', 'PROPIO'::"app"."alcance_permiso"
FROM "app"."permiso_regla" AS regla
WHERE regla."codigo_accion" = 'ticket.consultar';
