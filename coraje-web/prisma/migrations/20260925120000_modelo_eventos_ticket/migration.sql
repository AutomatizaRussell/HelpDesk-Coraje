-- =====================================================================
-- U6 · Modelo de eventos del ticket (docs/specs/tickets.md §3, §3.1, §4.1, §6)
-- =====================================================================
-- Todo cambio de estado nace como evento, y el estado del ticket es una
-- proyección escrita en la misma transacción por un escritor único que vive
-- en PostgreSQL: helpdesk.registrar_evento_ticket. La aplicación y la
-- ingesta de n8n pasan por la misma función.
--
-- Esta migración construye el modelo y el escritor, pero NO retira todavía
-- ningún privilegio. El retiro (UPDATE sobre id_estado, UPDATE/DELETE/INSERT
-- sobre fact_ticket_evento, DELETE sobre fact_ticket) va en una migración
-- posterior, que solo se publica cuando la ingesta reescrita está importada
-- en n8n y verificada con una ejecución real (tickets.md §3.1, recuadro
-- «Orden de despliegue obligatorio»). En el orden inverso, la ingesta falla y
-- la base deja de recibir lo que el equipo hace en PowerApps.
--
-- Nada existente se borra ni se reescribe: los eventos legacy reciben sus
-- columnas nuevas por DEFAULT al añadirlas, sin UPDATE sobre el registro.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Precondiciones. Si fallan, la migración aborta sin tocar nada.
-- ---------------------------------------------------------------------
-- La conversión a enum y el CHECK del actor asumen dos hechos medidos
-- contra la base real (V11, 24-sep-2026): los 532 eventos son COMENTARIO y
-- la ingesta nunca ha llenado id_autor. Si alguno dejó de ser cierto, es
-- preferible un error con nombre que una conversión que falla a medias.
DO $precondiciones$
DECLARE
    v_tipos_fuera TEXT;
    v_con_autor INTEGER;
BEGIN
    SELECT string_agg(DISTINCT tipo_evento, ', ')
    INTO v_tipos_fuera
    FROM helpdesk.fact_ticket_evento
    WHERE tipo_evento NOT IN ('COMENTARIO', 'REASIGNACION', 'MIGRACION_LEGACY');

    IF v_tipos_fuera IS NOT NULL THEN
        RAISE EXCEPTION
            'fact_ticket_evento tiene tipos que el catálogo de U6 no admite (tickets.md §6): %',
            v_tipos_fuera;
    END IF;

    SELECT COUNT(*)
    INTO v_con_autor
    FROM helpdesk.fact_ticket_evento
    WHERE id_autor IS NOT NULL;

    IF v_con_autor > 0 THEN
        RAISE EXCEPTION
            'fact_ticket_evento tiene % eventos con id_autor; el CHECK del actor los declararía SISTEMA con autor',
            v_con_autor;
    END IF;
END;
$precondiciones$;


-- ---------------------------------------------------------------------
-- 1. Catálogo de estados de la v1 (tickets.md §4): falta ASIGNADO.
-- ---------------------------------------------------------------------
-- ESPERANDO_SOLICITANTE, EN_PROCESO y RESUELTO quedan fuera de la v1.
INSERT INTO "helpdesk"."dim_estado" ("nombre_estado")
VALUES ('ASIGNADO')
ON CONFLICT ("nombre_estado") DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. Vocabularios cerrados del evento como enum (tickets.md §6).
-- ---------------------------------------------------------------------
-- Un valor nuevo exige ALTER TYPE ... ADD VALUE en su PROPIO archivo de
-- migración: Prisma envuelve cada archivo en una transacción, y un valor
-- añadido no se puede usar dentro de la transacción que lo crea.
CREATE TYPE "helpdesk"."tipo_evento_ticket" AS ENUM (
    'CREACION',
    'REDIRECCION',
    'REASIGNACION',
    'RESPUESTA',
    'RECHAZO',
    'COMENTARIO',
    'MIGRACION_LEGACY',
    'SINCRONIZACION_LEGACY'
);

-- El cliente no es actor en la v1: no hay dónde referenciarlo mientras
-- specs/acceso-clientes.md siga bloqueado.
CREATE TYPE "helpdesk"."tipo_actor_evento" AS ENUM (
    'EMPLEADO',
    'SISTEMA'
);

-- El equipo ve INTERNO y AMBOS; el cliente, CLIENTE y AMBOS.
CREATE TYPE "helpdesk"."visibilidad_evento" AS ENUM (
    'INTERNO',
    'CLIENTE',
    'AMBOS'
);


-- ---------------------------------------------------------------------
-- 3. tipo_evento pasa de VARCHAR + CHECK al enum.
-- ---------------------------------------------------------------------
-- CAMBIO_ESTADO desaparece: el cambio queda en id_estado_anterior /
-- id_estado_nuevo, y el tipo dice qué acto lo produjo. La precondición 0
-- garantiza que ninguna fila lo usa.
ALTER TABLE "helpdesk"."fact_ticket_evento"
    DROP CONSTRAINT "chk_fact_ticket_evento_tipo";

ALTER TABLE "helpdesk"."fact_ticket_evento"
    ALTER COLUMN "tipo_evento" TYPE "helpdesk"."tipo_evento_ticket"
    USING "tipo_evento"::TEXT::"helpdesk"."tipo_evento_ticket";


-- ---------------------------------------------------------------------
-- 4. Campos que faltaban (tickets.md §6): actor, visibilidad, estados.
-- ---------------------------------------------------------------------
-- Los DEFAULT de tipo_actor y visibilidad son TEMPORALES y cumplen dos
-- funciones: rellenan los eventos legacy con SISTEMA / INTERNO (decisión de
-- §6) sin un UPDATE sobre el registro, y mantienen viva la ingesta antigua
-- entre este despliegue y la importación del workflow nuevo, porque sus
-- INSERT no nombran estas columnas.
-- Condición de eliminación: la migración de retiro de privilegios los
-- quita. A partir de ahí, el escritor único es el único que inserta y
-- siempre declara ambos valores.
ALTER TABLE "helpdesk"."fact_ticket_evento"
    ADD COLUMN "tipo_actor" "helpdesk"."tipo_actor_evento" NOT NULL DEFAULT 'SISTEMA',
    ADD COLUMN "visibilidad" "helpdesk"."visibilidad_evento" NOT NULL DEFAULT 'INTERNO',
    ADD COLUMN "id_estado_anterior" UUID,
    ADD COLUMN "id_estado_nuevo" UUID;

-- EMPLEADO exige autor; SISTEMA lo exige vacío. Impulsa guarda el tipo y
-- una columna por actor sin atarlos; aquí la base impide la combinación
-- incoherente desde el principio.
ALTER TABLE "helpdesk"."fact_ticket_evento"
    ADD CONSTRAINT "chk_fact_ticket_evento_actor" CHECK (
        ("tipo_actor" = 'EMPLEADO' AND "id_autor" IS NOT NULL)
        OR ("tipo_actor" = 'SISTEMA' AND "id_autor" IS NULL)
    );

ALTER TABLE "helpdesk"."fact_ticket_evento"
    ADD CONSTRAINT "fact_ticket_evento_id_estado_anterior_fkey"
        FOREIGN KEY ("id_estado_anterior")
        REFERENCES "helpdesk"."dim_estado"("id_estado")
        ON DELETE NO ACTION ON UPDATE NO ACTION,
    ADD CONSTRAINT "fact_ticket_evento_id_estado_nuevo_fkey"
        FOREIGN KEY ("id_estado_nuevo")
        REFERENCES "helpdesk"."dim_estado"("id_estado")
        ON DELETE NO ACTION ON UPDATE NO ACTION;


-- ---------------------------------------------------------------------
-- 5. Un ticket con historial no se puede borrar (tickets.md §3.1).
-- ---------------------------------------------------------------------
-- Con ON DELETE CASCADE, borrar el ticket se llevaba sus eventos, y
-- PostgreSQL ejecuta la cascada con los permisos del dueño de la tabla: el
-- retiro de DELETE sobre fact_ticket_evento no lo habría impedido. Con
-- RESTRICT, ni siquiera un superusuario borra un ticket que tiene eventos
-- sin borrar antes, a propósito, su historial.
ALTER TABLE "helpdesk"."fact_ticket_evento"
    DROP CONSTRAINT "fact_ticket_evento_id_ticket_fkey";

ALTER TABLE "helpdesk"."fact_ticket_evento"
    ADD CONSTRAINT "fact_ticket_evento_id_ticket_fkey"
        FOREIGN KEY ("id_ticket")
        REFERENCES "helpdesk"."fact_ticket"("id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION;

-- La historia de un ticket se lee siempre por id_ticket en orden de fecha,
-- y el escritor consulta por id_ticket en cada llamada. Hasta hoy la FK no
-- tenía índice.
CREATE INDEX "ix_fact_ticket_evento_ticket_fecha"
    ON "helpdesk"."fact_ticket_evento" ("id_ticket", "fecha_registro");


-- ---------------------------------------------------------------------
-- 6. Escritor único (tickets.md §3, §3.1, §4.1).
-- ---------------------------------------------------------------------
-- Única vía por la que nace un evento y, con él, cambia el estado. Escribe
-- el evento y la proyección (fact_ticket.id_estado) en la misma transacción
-- que la llamada: si una falla, fallan las dos.
--
-- SECURITY DEFINER: corre con los privilegios de su dueño (coraje_migrator,
-- dueño de las tablas). Cuando la migración de retiro quite a
-- coraje_runtime y coraje_etl el UPDATE sobre id_estado y la escritura
-- directa sobre fact_ticket_evento, esta función seguirá pudiendo hacerlo y
-- ellos no. search_path fijado y todo nombre calificado: una función
-- SECURITY DEFINER con search_path abierto deja que quien la llama suplante
-- objetos con los suyos.
--
-- Parámetros:
--   p_estado_nuevo    nombre en dim_estado, o NULL si el evento no cambia el
--                     estado (COMENTARIO, REASIGNACION).
--   p_event_hash      identidad idempotente de la ingesta legacy. Si ya
--                     existe un evento con ese hash, no escribe nada y
--                     devuelve NULL.
--   p_fecha_registro  solo para actor SISTEMA (la ingesta fecha los eventos
--                     legacy con el Modified de SharePoint). Un empleado no
--                     puede fechar un evento en el pasado ni en el futuro.
--
-- Devuelve el id del evento creado, o NULL si el hash ya existía.
--
-- Qué NO hace: fijar área ni responsable. Quien redirige o reasigna escribe
-- id_area_destino / id_asignado en la misma transacción ANTES de llamar, y
-- el escritor exige que un ticket ASIGNADO tenga ambos.
CREATE FUNCTION "helpdesk"."registrar_evento_ticket"(
    p_id_ticket UUID,
    p_tipo_evento "helpdesk"."tipo_evento_ticket",
    p_tipo_actor "helpdesk"."tipo_actor_evento",
    p_id_autor UUID,
    p_visibilidad "helpdesk"."visibilidad_evento",
    p_contenido TEXT,
    p_estado_nuevo TEXT DEFAULT NULL,
    p_event_hash TEXT DEFAULT NULL,
    p_fecha_registro TIMESTAMPTZ DEFAULT NULL
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
    v_id_estado_nuevo UUID;
    v_tiene_inicio BOOLEAN;
    v_id_evento UUID;
BEGIN
    -- Parámetros obligatorios. El CHECK del actor también lo impide, pero un
    -- mensaje con nombre ahorra leer la definición del constraint.
    IF p_id_ticket IS NULL OR p_tipo_evento IS NULL OR p_tipo_actor IS NULL
       OR p_visibilidad IS NULL THEN
        RAISE EXCEPTION 'registrar_evento_ticket: ticket, tipo, actor y visibilidad son obligatorios';
    END IF;

    IF NULLIF(BTRIM(p_contenido), '') IS NULL THEN
        RAISE EXCEPTION 'registrar_evento_ticket: el contenido del evento no puede estar vacío';
    END IF;

    IF p_tipo_actor = 'EMPLEADO' AND p_id_autor IS NULL THEN
        RAISE EXCEPTION 'registrar_evento_ticket: un evento de EMPLEADO exige id_autor';
    END IF;

    IF p_tipo_actor = 'SISTEMA' AND p_id_autor IS NOT NULL THEN
        RAISE EXCEPTION 'registrar_evento_ticket: un evento de SISTEMA no lleva id_autor';
    END IF;

    IF p_fecha_registro IS NOT NULL AND p_tipo_actor <> 'SISTEMA' THEN
        RAISE EXCEPTION 'registrar_evento_ticket: solo un evento de SISTEMA puede declarar su fecha';
    END IF;

    -- El bloqueo serializa las escrituras concurrentes sobre el mismo ticket:
    -- dos transiciones simultáneas no pueden partir ambas del mismo estado.
    SELECT ticket.id_estado, estado.nombre_estado, ticket.id_area_destino, ticket.id_asignado
    INTO v_id_estado_actual, v_estado_actual, v_id_area, v_id_asignado
    FROM helpdesk.fact_ticket AS ticket
    JOIN helpdesk.dim_estado AS estado
        ON estado.id_estado = ticket.id_estado
    WHERE ticket.id_ticket = p_id_ticket
    FOR UPDATE OF ticket;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'registrar_evento_ticket: el ticket % no existe', p_id_ticket;
    END IF;

    -- Idempotencia de la ingesta: el mismo hecho legacy no se registra dos
    -- veces. Se comprueba después del bloqueo para que dos ejecuciones
    -- simultáneas no pasen ambas por aquí (el ON CONFLICT de abajo cubre el
    -- resto).
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

    -- Un ticket tiene historia reconstruible solo si su primer evento dice
    -- con qué estado empezó: CREACION para los nuevos, MIGRACION_LEGACY para
    -- los que vienen de SharePoint.
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

    -- Transiciones de la v1 (tickets.md §4.1). CERRADO y RECHAZADO son
    -- terminales: ninguna acción de la aplicación sale de ellos.
    CASE p_tipo_evento
        WHEN 'CREACION' THEN
            -- T1 / T2. El ticket se insertó en esta misma transacción con su
            -- estado inicial; el evento lo declara, no lo cambia.
            IF p_estado_nuevo NOT IN ('ABIERTO', 'ASIGNADO') THEN
                RAISE EXCEPTION 'registrar_evento_ticket: un ticket nace ABIERTO o ASIGNADO, no %', p_estado_nuevo;
            END IF;
            IF v_id_estado_nuevo <> v_id_estado_actual THEN
                RAISE EXCEPTION 'registrar_evento_ticket: CREACION declara % pero el ticket se insertó en %',
                    p_estado_nuevo, v_estado_actual;
            END IF;

        WHEN 'MIGRACION_LEGACY' THEN
            -- Estado inicial de un ticket de SharePoint, traducido por datos
            -- (tickets.md §4.2). Corrige la proyección si iba desfasada.
            IF p_tipo_actor <> 'SISTEMA' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: MIGRACION_LEGACY solo la escribe el SISTEMA';
            END IF;

        WHEN 'SINCRONIZACION_LEGACY' THEN
            -- La ingesta observa en SharePoint un estado distinto. Qué sistema
            -- gana en un conflicto es U9; aquí solo se garantiza que el cambio
            -- queda con su evento. Admite cualquier transición porque refleja
            -- lo que ya ocurrió en PowerApps.
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
            -- T4: otra persona de la misma área; el estado no cambia.
            IF v_estado_actual <> 'ASIGNADO' OR p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: REASIGNACION exige un ticket ASIGNADO y no cambia su estado';
            END IF;
            IF v_id_asignado IS NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: REASIGNACION sin responsable en el ticket';
            END IF;

        WHEN 'RESPUESTA' THEN
            -- T7: responder cierra, como en el legacy.
            IF v_estado_actual <> 'ASIGNADO' OR p_estado_nuevo IS DISTINCT FROM 'CERRADO' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: RESPUESTA va de ASIGNADO a CERRADO (actual %, pedido %)',
                    v_estado_actual, p_estado_nuevo;
            END IF;

        WHEN 'RECHAZO' THEN
            -- T8: el contenido es el motivo, obligatorio (comprobado arriba).
            IF v_estado_actual NOT IN ('ABIERTO', 'ASIGNADO') OR p_estado_nuevo IS DISTINCT FROM 'RECHAZADO' THEN
                RAISE EXCEPTION 'registrar_evento_ticket: RECHAZO va de ABIERTO o ASIGNADO a RECHAZADO (actual %, pedido %)',
                    v_estado_actual, p_estado_nuevo;
            END IF;

        WHEN 'COMENTARIO' THEN
            -- Nota interna o comentario legacy: nunca cambia el estado.
            IF p_estado_nuevo IS NOT NULL THEN
                RAISE EXCEPTION 'registrar_evento_ticket: un COMENTARIO no cambia el estado';
            END IF;
    END CASE;

    -- Invariante del estado ASIGNADO, venga de donde venga: tiene área y
    -- responsable. Sin esto, «asignado» sería una etiqueta sin dueño.
    IF p_estado_nuevo = 'ASIGNADO' AND (v_id_area IS NULL OR v_id_asignado IS NULL) THEN
        RAISE EXCEPTION 'registrar_evento_ticket: el ticket % no puede quedar ASIGNADO sin área y responsable',
            p_id_ticket;
    END IF;

    INSERT INTO helpdesk.fact_ticket_evento (
        event_hash,
        id_ticket,
        id_autor,
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
        p_tipo_evento,
        p_tipo_actor,
        p_visibilidad,
        -- Sin cambio de estado, ninguno de los dos campos se llena: la
        -- historia de estados se reconstruye solo con las filas que los
        -- tienen.
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

    -- La proyección, en la misma transacción que su evento.
    IF v_id_estado_nuevo IS NOT NULL AND v_id_estado_nuevo <> v_id_estado_actual THEN
        UPDATE helpdesk.fact_ticket
        SET id_estado = v_id_estado_nuevo,
            ultima_actualizacion = NOW()
        WHERE id_ticket = p_id_ticket;
    END IF;

    RETURN v_id_evento;
END;
$function$;

-- PostgreSQL concede EXECUTE a PUBLIC en toda función nueva. Solo los dos
-- roles de servicio pueden llamar al escritor.
REVOKE ALL ON FUNCTION "helpdesk"."registrar_evento_ticket"(
    UUID, "helpdesk"."tipo_evento_ticket", "helpdesk"."tipo_actor_evento", UUID,
    "helpdesk"."visibilidad_evento", TEXT, TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "helpdesk"."registrar_evento_ticket"(
    UUID, "helpdesk"."tipo_evento_ticket", "helpdesk"."tipo_actor_evento", UUID,
    "helpdesk"."visibilidad_evento", TEXT, TEXT, TEXT, TIMESTAMPTZ
) TO "coraje_runtime", "coraje_etl";
