-- =====================================================================
-- U11 · Seguimiento del ticket: observadores, solicitud de validación y
-- comentario del solicitante (docs/specs/tickets.md §11, permisos.md §4.4)
-- =====================================================================
-- Conceptos tomados del prototipo de la persona encargada de TI
-- (helpdesk_santi/, 03-sep-2026), no su diseño:
--
--   1. helpdesk.ticket_observador: personas que siguen un ticket sin
--      atenderlo. Personas reales del directorio, nunca etiquetas de rol
--      («Jefe de área»): una etiqueta no dice a quién avisar
--      (tickets.md §11, permisos.md §10).
--   2. helpdesk.ticket_validacion: a quién se le pidió validar, por evento.
--      El evento lleva el texto; esta tabla lleva el destinatario, que la
--      historia no puede guardar en una columna propia.
--   3. El escritor único gana cuatro ramas: añadir y retirar observador,
--      solicitar validación y el comentario del solicitante. Ninguna cambia
--      el estado (tickets.md §4.1).
--   4. Tres acciones nuevas del catálogo, sembradas para los tres roles.
--
-- Lo que NO hace, a propósito:
--   · La solicitud de validación no bloquea ni tiene respuesta de aprobar o
--     rechazar (decisión del 24-sep-2026; el prototipo tampoco la tiene).
--   · Un observador no puede ejecutar ninguna acción: ve el ticket y recibe
--     avisos. Eso lo decide la aplicación en scope.ts, no una columna.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Observadores
-- ---------------------------------------------------------------------
-- Una fila por persona que sigue el ticket hoy. Es estado vigente, no
-- historia: quién la añadió y quién la retiró queda en los eventos
-- OBSERVADOR_AGREGADO / OBSERVADOR_RETIRADO, que la aplicación escribe en la
-- misma transacción que la fila (ticket-commands.ts).
--
-- RESTRICT sobre el ticket, como fact_ticket_evento: un ticket con
-- seguimiento no se borra por accidente.
CREATE TABLE "helpdesk"."ticket_observador" (
    "id_ticket" UUID NOT NULL,
    "id_personal" UUID NOT NULL,
    "agregado_por" UUID NOT NULL,
    "agregado_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "ticket_observador_pkey" PRIMARY KEY ("id_ticket", "id_personal"),
    CONSTRAINT "ticket_observador_id_ticket_fkey"
        FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_observador_id_personal_fkey"
        FOREIGN KEY ("id_personal") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_observador_agregado_por_fkey"
        FOREIGN KEY ("agregado_por") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- La vista «Tickets que sigo» y el alcance de consulta buscan por persona;
-- la clave primaria ya cubre la búsqueda por ticket.
CREATE INDEX "ix_ticket_observador_persona" ON "helpdesk"."ticket_observador" ("id_personal");

-- ALTER DEFAULT PRIVILEGES concede DML completo a los dos roles en cada
-- tabla nueva (operacion.md, F6). La aplicación añade y retira filas; nadie
-- las edita, y la ingesta no tiene nada que hacer aquí.
REVOKE ALL ON "helpdesk"."ticket_observador" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT, DELETE ON "helpdesk"."ticket_observador" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. Destinatario de cada solicitud de validación
-- ---------------------------------------------------------------------
-- Una fila por evento SOLICITUD_VALIDACION. Solo crece: una solicitud
-- hecha no se deshace, igual que el evento que la registra.
CREATE TABLE "helpdesk"."ticket_validacion" (
    "id_evento" UUID NOT NULL,
    "id_ticket" UUID NOT NULL,
    "id_destinatario" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "ticket_validacion_pkey" PRIMARY KEY ("id_evento"),
    CONSTRAINT "ticket_validacion_id_evento_fkey"
        FOREIGN KEY ("id_evento") REFERENCES "helpdesk"."fact_ticket_evento"("id_evento")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_validacion_id_ticket_fkey"
        FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_validacion_id_destinatario_fkey"
        FOREIGN KEY ("id_destinatario") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- «Me pidieron validar»: por destinatario, lo más reciente primero.
CREATE INDEX "ix_ticket_validacion_destinatario" ON "helpdesk"."ticket_validacion" ("id_destinatario", "created_at" DESC);

REVOKE ALL ON "helpdesk"."ticket_validacion" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT ON "helpdesk"."ticket_validacion" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 3. Escritor único con las cuatro ramas nuevas (tickets.md §3.1, §6)
-- ---------------------------------------------------------------------
-- Misma firma que la versión de 20260928110000_acceso_clientes: CREATE OR
-- REPLACE conserva sus permisos, y la ingesta de n8n, que llama con
-- argumentos nombrados, no nota el cambio. Cambios de comportamiento, y
-- solo estos:
--   · lee también id_solicitante del ticket bloqueado;
--   · OBSERVADOR_AGREGADO, OBSERVADOR_RETIRADO y SOLICITUD_VALIDACION: los
--     escribe un EMPLEADO, son INTERNO, no cambian el estado y solo caben en
--     un ticket abierto (seguir o pedir validación de algo terminado no
--     tiene destino);
--   · COMENTARIO_SOLICITANTE: lo escribe el EMPLEADO que radicó el ticket,
--     lo ve el solicitante (AMBOS), no cambia el estado y solo cabe en un
--     ticket abierto. Que el autor sea el solicitante lo comprueba la base,
--     no solo el alcance de la aplicación: es lo que da sentido al tipo.
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
-- 4. Tres acciones del catálogo (permisos.md §3, §4.4, §10)
-- ---------------------------------------------------------------------
-- Cada una es propia y no se disuelve en otra existente (permisos.md §10):
-- seguir un ticket no es consultarlo, pedir validación no es autorización
-- excepcional, y escribir en el ticket propio no es responderlo.
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('ticket.observador.gestionar', 'Gestionar observadores',
     'Añadir o retirar personas que siguen un ticket sin atenderlo. Un observador ve el ticket y recibe avisos, sin ninguna acción.'),
    ('ticket.validacion.solicitar', 'Solicitar validación',
     'Pedir a una persona concreta que confirme algo del ticket, con un comentario. No bloquea el ticket ni exige justificación.'),
    ('ticket.solicitante.comentar', 'Comentar como solicitante',
     'Escribir en un ticket propio abierto sin cerrarlo: el equipo lo ve y la persona responsable recibe aviso.');

-- Los tres roles de la v1 trabajan como agentes y reciben las mismas reglas
-- (copia, no herencia: permisos.md §4.2).
--   · gestionar observadores y solicitar validación: AREA, igual que la nota
--     interna. El responsable y su área deciden a quién involucrar. Quien
--     radica elige observadores al crear el ticket, bajo ticket.crear.
--   · comentar como solicitante: PROPIO, y para esta acción «propio»
--     significa haberlo radicado (scope.ts). La base lo vuelve a exigir en
--     la rama COMENTARIO_SOLICITANTE del escritor.
INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance")
SELECT rol."rol", accion."codigo", accion."alcance"::"app"."alcance_permiso"
FROM (VALUES ('AGENTE'::"core"."rol_aplicacion"), ('CLASIFICADOR'), ('ADMIN')) AS rol("rol")
CROSS JOIN (VALUES
    ('ticket.observador.gestionar', 'AREA'),
    ('ticket.validacion.solicitar', 'AREA'),
    ('ticket.solicitante.comentar', 'PROPIO')
) AS accion("codigo", "alcance");
