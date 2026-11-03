-- =====================================================================
-- U29 · Aprobación del ticket (docs/specs/tickets.md §11.2)
-- =====================================================================
-- Decisión del usuario del 30-oct y del 03-nov-2026: quien antes «validaba»
-- es un aprobador. El ticket no se cierra hasta que apruebe o no apruebe; si
-- no aprueba, el ticket sigue abierto con el mismo responsable y la negativa
-- queda en la historia con su motivo. Quien la pidió puede retirarla. El
-- aprobador ya no se vuelve observador: ve el ticket por ser aprobador.
--
-- helpdesk.ticket_validacion conserva su nombre: es la tabla de solicitudes
-- de aprobación, y renombrarla no compra nada. Lo mismo SOLICITUD_VALIDACION.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Resultado de cada solicitud
-- ---------------------------------------------------------------------
-- Pendiente = resultado NULL. Las tres columnas van juntas o ninguna: una
-- respuesta sin su evento, o un evento sin fecha, no se pueden escribir.
ALTER TABLE "helpdesk"."ticket_validacion"
    ADD COLUMN "resultado" VARCHAR(20),
    ADD COLUMN "id_evento_respuesta" UUID,
    ADD COLUMN "respondida_at" TIMESTAMPTZ(6),
    ADD CONSTRAINT "chk_ticket_validacion_resultado"
        CHECK ("resultado" IS NULL OR "resultado" IN ('APROBADA', 'NO_APROBADA', 'RETIRADA')),
    ADD CONSTRAINT "chk_ticket_validacion_respuesta" CHECK (
        ("resultado" IS NULL) = ("id_evento_respuesta" IS NULL)
        AND ("resultado" IS NULL) = ("respondida_at" IS NULL)
    ),
    -- Un evento responde una sola solicitud.
    ADD CONSTRAINT "uq_ticket_validacion_evento_respuesta" UNIQUE ("id_evento_respuesta"),
    ADD CONSTRAINT "ticket_validacion_id_evento_respuesta_fkey"
        FOREIGN KEY ("id_evento_respuesta") REFERENCES "helpdesk"."fact_ticket_evento"("id_evento")
        ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Una sola aprobación pendiente por ticket: el bloqueo del cierre se explica
-- con una persona, no con una lista.
CREATE UNIQUE INDEX "ux_ticket_validacion_pendiente"
    ON "helpdesk"."ticket_validacion" ("id_ticket")
    WHERE "resultado" IS NULL;

-- Responder es la única escritura nueva, y solo de estas columnas.
GRANT UPDATE ("resultado", "id_evento_respuesta", "respondida_at") ON "helpdesk"."ticket_validacion" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. Escritor único con las tres ramas de la respuesta
-- ---------------------------------------------------------------------
-- Copia de la versión de 20260928150000_seguimiento_ticket con tres cambios:
--   · RESPUESTA falla con una aprobación pendiente (HD_APROBACION_PENDIENTE);
--   · APROBACION_OTORGADA y APROBACION_DENEGADA: las escribe la persona a
--     quien se pidió, mientras está pendiente;
--   · APROBACION_RETIRADA: el responsable o quien la pidió.
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
           ticket.id_solicitante
    INTO v_id_estado_actual, v_estado_actual, v_id_area, v_id_asignado, v_id_solicitante
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
-- 3. Responder cierra el aviso del aprobador
-- ---------------------------------------------------------------------
-- El mismo patrón que trg_resolver_avisos_ticket: lo que deja de pedir una
-- acción lo cierra la base, no cada comando. SECURITY DEFINER porque
-- coraje_runtime solo puede marcar avisos como leídos.
CREATE FUNCTION "helpdesk"."resolver_aviso_aprobacion"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
    IF OLD.resultado IS NULL AND NEW.resultado IS NOT NULL THEN
        UPDATE helpdesk.ticket_aviso
        SET resuelto_at = NOW()
        WHERE id_evento = NEW.id_evento
          AND id_destinatario = NEW.id_destinatario
          AND tipo = 'SOLICITUD_VALIDACION'
          AND resuelto_at IS NULL;
    END IF;
    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."resolver_aviso_aprobacion"() FROM PUBLIC;

CREATE TRIGGER "trg_resolver_aviso_aprobacion"
AFTER UPDATE OF "resultado" ON "helpdesk"."ticket_validacion"
FOR EACH ROW EXECUTE FUNCTION "helpdesk"."resolver_aviso_aprobacion"();


-- ---------------------------------------------------------------------
-- 4. Tipos de aviso: sin rechazo, con la respuesta de la aprobación
-- ---------------------------------------------------------------------
-- RECHAZO_SOLICITANTE y RECHAZO_OBSERVADOR se van con el rechazo
-- (20261103140000); no quedan filas con ellos (los tickets de prueba se
-- borraron en 20261103120000). APROBACION_OTORGADA y APROBACION_DENEGADA
-- informan a quien pidió la aprobación y al responsable: son novedades.
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
        'APROBACION_DENEGADA'
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
-- 5. Permiso de responder una aprobación
-- ---------------------------------------------------------------------
-- PROPIO para todo rol que consulta tickets: «propio» es ser la persona a
-- quien se pidió (scope.ts). A quién se le puede pedir lo limita
-- FOLLOWER_WHERE: activo y con rol.
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('ticket.aprobacion.responder', 'Responder una aprobación',
     'Aprobar o no aprobar lo que el responsable de un ticket le pidió aprobar.');

INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance")
SELECT DISTINCT regla."rol", 'ticket.aprobacion.responder', 'PROPIO'::"app"."alcance_permiso"
FROM "app"."permiso_regla" AS regla
WHERE regla."codigo_accion" = 'ticket.consultar';
