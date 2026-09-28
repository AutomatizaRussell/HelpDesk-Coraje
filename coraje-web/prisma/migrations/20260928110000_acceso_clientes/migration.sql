-- =====================================================================
-- U8 · Acceso de clientes y tickets del portal
-- (docs/specs/acceso-clientes.md; docs/specs/tickets.md §4.1 T1/T3, §5, §6;
--  docs/specs/permisos.md §3, §4.1)
-- =====================================================================
-- Decisiones del usuario que esta migración materializa (28-sep-2026):
--   D2  Un contacto ve solo los tickets que él radicó. La autorización se
--       ancla al contacto, y el contacto pertenece a un único cliente.
--   D3  El acceso no vence: termina solo por revocación. Un navegador
--       recordado que pasa 180 días sin uso vuelve a pedir código (la
--       inactividad se evalúa en la aplicación, src/server/portal/).
--   D4  Los correos del portal los envía un workflow del n8n de HelpDesk
--       desde automatizacionmedellin@. Aquí solo queda su auditoría: el
--       código y el enlace de invitación NUNCA se guardan en claro, así que
--       no hay cola de correos con reintento (reintentar exigiría guardar el
--       secreto). Un envío fallido se repite emitiendo un secreto nuevo.
--   Roles: CLASIFICADOR redirige; ADMIN administra accesos.
--
-- Partes:
--   1. Identidad externa en `app` (contacto, correo, autorización,
--      invitación, desafío OTP, dispositivo, auditoría).
--   2. El ticket conoce al contacto que lo radicó; el evento, al cliente
--      como actor.
--   3. Escritor único con actor CLIENTE (cambia de firma: DROP + CREATE).
--   4. Resolución de responsable en una sola función, usada por la
--      creación interna (T2) y por la redirección (T3).
--   5. helpdesk.crear_ticket_cliente (T1) y helpdesk.redirigir_ticket (T3).
--   6. Correos del ticket a un contacto de cliente.
--   7. Catálogo de permisos: ticket.redirigir, portal.acceso.administrar.
--
-- Nada existente se borra. Los tickets y eventos reales no se reescriben:
-- las columnas nuevas nacen vacías y los CHECK nuevos las aceptan vacías.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Precondición: no hay tickets de portal.
-- ---------------------------------------------------------------------
-- El CHECK de la parte 2 exige que un ticket PORTAL_CLIENTE tenga contacto.
-- El único que existió era una prueba y se borró el 25-sep-2026
-- (tickets.md §4.2). Si reapareció alguno, mejor un error con nombre que un
-- CHECK que falla sin decir por qué.
DO $precondiciones$
DECLARE
    v_portal INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_portal
    FROM helpdesk.fact_ticket
    WHERE origen_sistema = 'PORTAL_CLIENTE';

    IF v_portal > 0 THEN
        RAISE EXCEPTION
            'Hay % tickets PORTAL_CLIENTE sin contacto; revisar antes de exigirlo (acceso-clientes.md)',
            v_portal;
    END IF;
END;
$precondiciones$;


-- ---------------------------------------------------------------------
-- 1. Identidad externa (acceso-clientes.md §5)
-- ---------------------------------------------------------------------
-- En `app` y no en `core`: un contacto con acceso al portal es estado
-- propio de la plataforma, no un dato maestro que venga de SharePoint. La
-- ingesta no escribe en `app`.

-- Una persona de un cliente. Pertenece a un solo cliente (D2): el alcance
-- de lo que ve es «lo que yo radiqué», y eso ya implica su empresa.
CREATE TABLE "app"."portal_contacto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_cliente_contai" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "creado_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "portal_contacto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_portal_contacto_nombre" CHECK (BTRIM("nombre") <> ''),
    -- RESTRICT: un cliente con contactos no se borra por accidente.
    CONSTRAINT "portal_contacto_id_cliente_contai_fkey"
        FOREIGN KEY ("id_cliente_contai")
        REFERENCES "core"."dim_cliente_contai"("id_cliente_contai")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "portal_contacto_creado_por_fkey"
        FOREIGN KEY ("creado_por") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "ix_portal_contacto_cliente" ON "app"."portal_contacto" ("id_cliente_contai");

-- Los correos de un contacto. Todos los activos valen igual: no hay correo
-- principal (acceso-clientes.md §4, invariante 2). Se guardan ya
-- normalizados (minúsculas, sin espacios): el CHECK lo exige para que el
-- índice único no se pueda eludir con una mayúscula.
CREATE TABLE "app"."portal_contacto_correo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_contacto" UUID NOT NULL,
    "correo" VARCHAR(254) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "portal_contacto_correo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_portal_contacto_correo_normalizado"
        CHECK ("correo" = LOWER(BTRIM("correo")) AND "correo" LIKE '%_@_%'),
    CONSTRAINT "portal_contacto_correo_id_contacto_fkey"
        FOREIGN KEY ("id_contacto") REFERENCES "app"."portal_contacto"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- Un correo activo identifica a lo sumo a un contacto. Es lo que hace
-- determinista el ingreso por correo y código: «¿a quién le mando el
-- código?» tiene una sola respuesta. Consecuencia aceptada: una misma
-- dirección no puede ser contacto de dos clientes a la vez.
CREATE UNIQUE INDEX "ux_portal_contacto_correo_activo"
    ON "app"."portal_contacto_correo" ("correo") WHERE "activo";

CREATE INDEX "ix_portal_contacto_correo_contacto" ON "app"."portal_contacto_correo" ("id_contacto");

-- La concesión de acceso de un contacto. Una sola ACTIVA a la vez; revocar
-- la cierra, y volver a dar acceso crea una nueva con su propia invitación
-- (acceso-clientes.md §8: reactivar no restaura el acceso anterior).
--
-- activada_at se sella al consumir la invitación o al verificar un código,
-- nunca desde el guard. El guard exige activada_at ADEMÁS de un dispositivo
-- válido: la brecha B2 de Impulsa, construida ya cerrada (§6, invariante).
CREATE TABLE "app"."portal_autorizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_contacto" UUID NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    "solo_lectura" BOOLEAN NOT NULL DEFAULT FALSE,
    "activada_at" TIMESTAMPTZ(6),
    "concedida_por" UUID NOT NULL,
    "revocada_at" TIMESTAMPTZ(6),
    "revocada_por" UUID,
    "motivo_revocacion" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "portal_autorizacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_portal_autorizacion_estado" CHECK ("estado" IN ('ACTIVA', 'REVOCADA')),
    CONSTRAINT "chk_portal_autorizacion_revocada"
        CHECK (("estado" = 'REVOCADA') = ("revocada_at" IS NOT NULL)),
    CONSTRAINT "portal_autorizacion_id_contacto_fkey"
        FOREIGN KEY ("id_contacto") REFERENCES "app"."portal_contacto"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "portal_autorizacion_concedida_por_fkey"
        FOREIGN KEY ("concedida_por") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "portal_autorizacion_revocada_por_fkey"
        FOREIGN KEY ("revocada_por") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "ux_portal_autorizacion_activa"
    ON "app"."portal_autorizacion" ("id_contacto") WHERE "estado" = 'ACTIVA';

-- Invitación individual de un solo uso (§6). Solo su hash: el enlace en
-- claro existe únicamente en el correo que la lleva.
CREATE TABLE "app"."portal_invitacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_autorizacion" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "expira_at" TIMESTAMPTZ(6) NOT NULL,
    "consumida_at" TIMESTAMPTZ(6),
    "emitida_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "portal_invitacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_portal_invitacion_estado"
        CHECK ("estado" IN ('PENDIENTE', 'CONSUMIDA', 'REEMPLAZADA', 'REVOCADA')),
    CONSTRAINT "chk_portal_invitacion_consumida"
        CHECK (("estado" = 'CONSUMIDA') = ("consumida_at" IS NOT NULL)),
    CONSTRAINT "portal_invitacion_id_autorizacion_fkey"
        FOREIGN KEY ("id_autorizacion") REFERENCES "app"."portal_autorizacion"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "portal_invitacion_emitida_por_fkey"
        FOREIGN KEY ("emitida_por") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "ux_portal_invitacion_token_hash" ON "app"."portal_invitacion" ("token_hash");

-- Emitir una invitación nueva reemplaza la pendiente: nunca hay dos enlaces
-- vivos para la misma autorización.
CREATE UNIQUE INDEX "ux_portal_invitacion_pendiente"
    ON "app"."portal_invitacion" ("id_autorizacion") WHERE "estado" = 'PENDIENTE';

-- Código de seis dígitos para un navegador nuevo (§6). code_hash es un HMAC
-- con clave del servidor, no un SHA-256 plano: un millón de valores posibles
-- se recorren en milisegundos, así que sin clave el hash no protegería nada.
CREATE TABLE "app"."portal_desafio_otp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_autorizacion" UUID NOT NULL,
    "id_correo" UUID NOT NULL,
    "code_hash" CHAR(64) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "max_intentos" INTEGER NOT NULL,
    "expira_at" TIMESTAMPTZ(6) NOT NULL,
    "verificado_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "portal_desafio_otp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_portal_desafio_otp_estado"
        CHECK ("estado" IN ('ACTIVO', 'VERIFICADO', 'REEMPLAZADO', 'VENCIDO', 'AGOTADO')),
    CONSTRAINT "chk_portal_desafio_otp_intentos"
        CHECK ("intentos" >= 0 AND "max_intentos" > 0 AND "intentos" <= "max_intentos"),
    CONSTRAINT "portal_desafio_otp_id_autorizacion_fkey"
        FOREIGN KEY ("id_autorizacion") REFERENCES "app"."portal_autorizacion"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "portal_desafio_otp_id_correo_fkey"
        FOREIGN KEY ("id_correo") REFERENCES "app"."portal_contacto_correo"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- El límite de emisiones por hora cuenta por autorización y fecha.
CREATE INDEX "ix_portal_desafio_otp_autorizacion"
    ON "app"."portal_desafio_otp" ("id_autorizacion", "created_at");

-- Navegador recordado. Cuelga de la AUTORIZACIÓN, no del contacto: un
-- dispositivo que se activó para una autorización no puede entrar a otra
-- que nunca activó, aunque sea del mismo contacto (B2 de Impulsa, cerrada
-- por construcción en vez de por una comprobación adicional). Revocar la
-- autorización deja a todos sus dispositivos sin nada a lo que entrar.
--
-- No hay vencimiento absoluto (D3). ultimo_uso_at alimenta la regla de
-- inactividad de 180 días, que evalúa la aplicación en cada lectura.
CREATE TABLE "app"."portal_dispositivo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_autorizacion" UUID NOT NULL,
    "credential_hash" CHAR(64) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    "ultimo_uso_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "revocado_at" TIMESTAMPTZ(6),
    "user_agent" VARCHAR(400),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "portal_dispositivo_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_portal_dispositivo_estado" CHECK ("estado" IN ('ACTIVO', 'REVOCADO')),
    CONSTRAINT "chk_portal_dispositivo_revocado"
        CHECK (("estado" = 'REVOCADO') = ("revocado_at" IS NOT NULL)),
    CONSTRAINT "portal_dispositivo_id_autorizacion_fkey"
        FOREIGN KEY ("id_autorizacion") REFERENCES "app"."portal_autorizacion"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "ux_portal_dispositivo_credential_hash" ON "app"."portal_dispositivo" ("credential_hash");
CREATE INDEX "ix_portal_dispositivo_autorizacion" ON "app"."portal_dispositivo" ("id_autorizacion");

-- Auditoría del acceso externo (§9). Solo crece: coraje_runtime no tiene
-- UPDATE ni DELETE. Nunca lleva el código ni el enlace: metadata guarda
-- identificadores, no secretos.
--
-- id_personal es el empleado que actuó (alta, invitación, revocación); los
-- eventos del propio cliente lo dejan vacío.
CREATE TABLE "app"."portal_auditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "evento" VARCHAR(60) NOT NULL,
    "resultado" VARCHAR(20) NOT NULL,
    "id_contacto" UUID,
    "id_autorizacion" UUID,
    "id_personal" UUID,
    "motivo" VARCHAR(500),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "portal_auditoria_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_portal_auditoria_resultado" CHECK ("resultado" IN ('EXITO', 'FALLO')),
    CONSTRAINT "portal_auditoria_id_contacto_fkey"
        FOREIGN KEY ("id_contacto") REFERENCES "app"."portal_contacto"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "portal_auditoria_id_autorizacion_fkey"
        FOREIGN KEY ("id_autorizacion") REFERENCES "app"."portal_autorizacion"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "portal_auditoria_id_personal_fkey"
        FOREIGN KEY ("id_personal") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "ix_portal_auditoria_contacto" ON "app"."portal_auditoria" ("id_contacto", "created_at");
CREATE INDEX "ix_portal_auditoria_autorizacion" ON "app"."portal_auditoria" ("id_autorizacion", "created_at");

-- Sin DELETE en ninguna: revocar es un estado, no un borrado, y la historia
-- del acceso es evidencia.
GRANT SELECT, INSERT, UPDATE ON
    "app"."portal_contacto",
    "app"."portal_contacto_correo",
    "app"."portal_autorizacion",
    "app"."portal_invitacion",
    "app"."portal_desafio_otp",
    "app"."portal_dispositivo"
TO "coraje_runtime";

GRANT SELECT, INSERT ON "app"."portal_auditoria" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. El ticket conoce a su contacto; el evento, al cliente como actor
-- ---------------------------------------------------------------------
-- chk_fact_ticket_origen_exclusivo (baseline) sigue igual: un ticket de
-- portal tiene id_cliente_contai y no id_solicitante. id_contacto_portal
-- dice QUIÉN de ese cliente lo radicó, que es lo que D2 necesita.
ALTER TABLE "helpdesk"."fact_ticket"
    ADD COLUMN "id_contacto_portal" UUID;

ALTER TABLE "helpdesk"."fact_ticket"
    ADD CONSTRAINT "fact_ticket_id_contacto_portal_fkey"
        FOREIGN KEY ("id_contacto_portal") REFERENCES "app"."portal_contacto"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Un ticket es del portal si y solo si tiene contacto. Efecto útil además
-- del obvio: si una ingesta futura intentara reescribir el origen de un
-- ticket del portal a SHAREPOINT_LEGACY (sincronizacion-sharepoint.md §4.1),
-- fallaría aquí en vez de borrar su procedencia en silencio.
ALTER TABLE "helpdesk"."fact_ticket"
    ADD CONSTRAINT "chk_fact_ticket_origen_portal"
        CHECK (("origen_sistema" = 'PORTAL_CLIENTE') = ("id_contacto_portal" IS NOT NULL));

-- La vista del cliente lista sus tickets por contacto.
CREATE INDEX "ix_fact_ticket_contacto_portal"
    ON "helpdesk"."fact_ticket" ("id_contacto_portal", "fecha_creacion")
    WHERE "id_contacto_portal" IS NOT NULL;

-- La cola de clasificación: tickets del portal que todavía no tienen área.
CREATE INDEX "ix_fact_ticket_portal_sin_clasificar"
    ON "helpdesk"."fact_ticket" ("fecha_creacion")
    WHERE "origen_sistema" = 'PORTAL_CLIENTE' AND "id_area_destino" IS NULL;

-- id_contacto_portal NO se añade a la concesión de UPDATE por columna de la
-- fase 2 de U6: quién radicó un ticket no cambia después, y solo
-- helpdesk.crear_ticket_cliente (SECURITY DEFINER) lo escribe al insertar.
-- event-model.contract.test.mts lo declara como columna protegida.

ALTER TABLE "helpdesk"."fact_ticket_evento"
    ADD COLUMN "id_contacto_autor" UUID;

ALTER TABLE "helpdesk"."fact_ticket_evento"
    ADD CONSTRAINT "fact_ticket_evento_id_contacto_autor_fkey"
        FOREIGN KEY ("id_contacto_autor") REFERENCES "app"."portal_contacto"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Cada actor, con exactamente su columna. Los eventos existentes son
-- EMPLEADO con id_autor o SISTEMA sin él, y ninguno tiene contacto: todos
-- cumplen la versión nueva sin tocar una fila.
ALTER TABLE "helpdesk"."fact_ticket_evento"
    DROP CONSTRAINT "chk_fact_ticket_evento_actor";

ALTER TABLE "helpdesk"."fact_ticket_evento"
    ADD CONSTRAINT "chk_fact_ticket_evento_actor" CHECK (
        ("tipo_actor" = 'EMPLEADO' AND "id_autor" IS NOT NULL AND "id_contacto_autor" IS NULL)
        OR ("tipo_actor" = 'SISTEMA' AND "id_autor" IS NULL AND "id_contacto_autor" IS NULL)
        OR ("tipo_actor" = 'CLIENTE' AND "id_autor" IS NULL AND "id_contacto_autor" IS NOT NULL)
    );


-- ---------------------------------------------------------------------
-- 3. Escritor único con actor CLIENTE (tickets.md §3.1, §6)
-- ---------------------------------------------------------------------
-- La firma cambia (un parámetro más), y PostgreSQL no admite CREATE OR
-- REPLACE con otra firma: se borra y se crea, como anticipaba tickets.md §6.
--
-- Compatibilidad con la ingesta viva: n8n llama con argumentos NOMBRADOS
-- (p_id_ticket => …) y nunca pasa el parámetro nuevo, que va al final con
-- DEFAULT NULL. La misma llamada resuelve a la función nueva sin reimportar
-- el workflow. crear_ticket_interno llama por posición con 7 argumentos:
-- también resuelve. Solo existe una función con este nombre en todo momento,
-- así que no hay ambigüedad de sobrecarga.
--
-- Cambios de comportamiento respecto de 20260925120000, y solo estos:
--   · actor CLIENTE: exige p_id_contacto_autor y ningún id_autor;
--   · en la v1 el cliente solo produce CREACION, y su ticket nace ABIERTO
--     (T1): toda otra acción la ejecuta un empleado (§4.1).
DROP FUNCTION "helpdesk"."registrar_evento_ticket"(
    UUID, "helpdesk"."tipo_evento_ticket", "helpdesk"."tipo_actor_evento", UUID,
    "helpdesk"."visibilidad_evento", TEXT, TEXT, TEXT, TIMESTAMPTZ
);

CREATE FUNCTION "helpdesk"."registrar_evento_ticket"(
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

REVOKE ALL ON FUNCTION "helpdesk"."registrar_evento_ticket"(
    UUID, "helpdesk"."tipo_evento_ticket", "helpdesk"."tipo_actor_evento", UUID,
    "helpdesk"."visibilidad_evento", TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "helpdesk"."registrar_evento_ticket"(
    UUID, "helpdesk"."tipo_evento_ticket", "helpdesk"."tipo_actor_evento", UUID,
    "helpdesk"."visibilidad_evento", TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID
) TO "coraje_runtime", "coraje_etl";


-- ---------------------------------------------------------------------
-- 4. Una sola regla de enrutamiento (T2 y T3)
-- ---------------------------------------------------------------------
-- Hasta aquí la regla vivía dentro de crear_ticket_interno. La redirección
-- necesita exactamente la misma —el tipo decide el área, routing_rule o
-- encargado_recepcion decide la persona—, y dos copias acabarían
-- divergiendo. Se extrae sin cambiar su comportamiento: mismos pasos, mismos
-- errores HD_… (que src/server/tickets/ticket-errors.ts traduce).
CREATE FUNCTION "helpdesk"."resolver_responsable_tipo"(p_id_tipo_req UUID)
RETURNS TABLE (id_area UUID, id_responsable UUID, correo_encargado TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
    v_id_area UUID;
    v_correo TEXT;
    v_id_responsable UUID;
    v_rol TEXT;
BEGIN
    SELECT tipo.id_area,
           LOWER(BTRIM(COALESCE(regla.encargado_interno, area.encargado_recepcion)))
    INTO v_id_area, v_correo
    FROM helpdesk.dim_tipo_requerimiento AS tipo
    JOIN core.dim_area AS area
        ON area.id_area = tipo.id_area
    LEFT JOIN helpdesk.routing_rule AS regla
        ON regla.id_tipo_req = tipo.id_tipo_req
       AND regla.activo
    WHERE tipo.id_tipo_req = p_id_tipo_req;

    IF v_id_area IS NULL THEN
        RAISE EXCEPTION 'resolver_responsable_tipo: el tipo de requerimiento % no existe', p_id_tipo_req;
    END IF;

    IF NULLIF(v_correo, '') IS NULL THEN
        RAISE EXCEPTION 'resolver_responsable_tipo: HD_SIN_RESPONSABLE el área no tiene responsable de recepción';
    END IF;

    SELECT persona.id_personal, persona.rol_aplicacion::TEXT
    INTO v_id_responsable, v_rol
    FROM core.dim_personal AS persona
    WHERE LOWER(persona.correo_corporativo) = v_correo
      AND persona.estado_activo
      AND NOT persona.es_responsable_historico_no_identificado;

    IF v_id_responsable IS NULL THEN
        RAISE EXCEPTION 'resolver_responsable_tipo: HD_RESPONSABLE_INACTIVO el responsable % no es una persona activa', v_correo;
    END IF;

    IF v_rol IS NULL THEN
        RAISE EXCEPTION 'resolver_responsable_tipo: HD_RESPONSABLE_SIN_ACCESO el responsable % no tiene acceso a HelpDesk', v_correo;
    END IF;

    RETURN QUERY SELECT v_id_area, v_id_responsable, v_correo;
END;
$function$;

-- Solo la llaman las dos funciones de abajo, que corren como su dueño.
REVOKE ALL ON FUNCTION "helpdesk"."resolver_responsable_tipo"(UUID) FROM PUBLIC;

-- crear_ticket_interno pasa a usarla. Misma firma, mismo resultado: solo se
-- reemplaza la copia de la regla por la llamada. Todo lo demás es idéntico a
-- 20260926100000_permisos_y_creacion_ticket.
CREATE OR REPLACE FUNCTION "helpdesk"."crear_ticket_interno"(
    p_id_solicitante UUID,
    p_id_tipo_req UUID,
    p_prioridad TEXT,
    p_descripcion TEXT
)
RETURNS TABLE (id_ticket UUID, codigo_ticket TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
    v_id_area UUID;
    v_correo_encargado TEXT;
    v_id_responsable UUID;
    v_id_prioridad UUID;
    v_dias_sla INTEGER;
    v_id_estado UUID;
    v_hoy_bogota DATE;
    v_id_ticket UUID;
    v_codigo TEXT;
BEGIN
    IF p_id_solicitante IS NULL OR p_id_tipo_req IS NULL OR p_prioridad IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_interno: solicitante, tipo de requerimiento y prioridad son obligatorios';
    END IF;

    IF NULLIF(BTRIM(p_descripcion), '') IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_interno: la descripción no puede estar vacía';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM core.dim_personal AS persona
        WHERE persona.id_personal = p_id_solicitante
          AND persona.estado_activo
    ) THEN
        RAISE EXCEPTION 'crear_ticket_interno: el solicitante % no es una persona activa', p_id_solicitante;
    END IF;

    SELECT resuelto.id_area, resuelto.id_responsable, resuelto.correo_encargado
    INTO v_id_area, v_id_responsable, v_correo_encargado
    FROM helpdesk.resolver_responsable_tipo(p_id_tipo_req) AS resuelto;

    SELECT prioridad.id_prioridad, prioridad.dias_sla
    INTO v_id_prioridad, v_dias_sla
    FROM helpdesk.dim_prioridad AS prioridad
    WHERE prioridad.nombre_prioridad = p_prioridad;

    IF v_id_prioridad IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_interno: la prioridad % no existe', p_prioridad;
    END IF;

    SELECT estado.id_estado INTO v_id_estado
    FROM helpdesk.dim_estado AS estado
    WHERE estado.nombre_estado = 'ASIGNADO';

    v_hoy_bogota := (NOW() AT TIME ZONE 'America/Bogota')::DATE;

    INSERT INTO helpdesk.fact_ticket AS ticket (
        descripcion_problema,
        id_solicitante,
        id_area_destino,
        id_asignado,
        id_estado,
        id_prioridad,
        id_tipo_req,
        fecha_creacion,
        fecha_limite,
        origen_sistema,
        encargado_interno
    )
    VALUES (
        BTRIM(p_descripcion),
        p_id_solicitante,
        v_id_area,
        v_id_responsable,
        v_id_estado,
        v_id_prioridad,
        p_id_tipo_req,
        NOW(),
        (core.add_colombia_business_days(v_hoy_bogota, v_dias_sla) + TIME '23:59:59')
            AT TIME ZONE 'America/Bogota',
        'SISTEMA_INTERNO',
        v_correo_encargado
    )
    RETURNING ticket.id_ticket, ticket.codigo_ticket INTO v_id_ticket, v_codigo;

    PERFORM helpdesk.registrar_evento_ticket(
        v_id_ticket,
        'CREACION'::helpdesk.tipo_evento_ticket,
        'EMPLEADO'::helpdesk.tipo_actor_evento,
        p_id_solicitante,
        'AMBOS'::helpdesk.visibilidad_evento,
        BTRIM(p_descripcion),
        'ASIGNADO'
    );

    RETURN QUERY SELECT v_id_ticket, v_codigo;
END;
$function$;


-- ---------------------------------------------------------------------
-- 5a. T1 · Un contacto de cliente radica un ticket
-- ---------------------------------------------------------------------
-- El ticket nace ABIERTO, sin área, sin responsable, sin prioridad y sin
-- plazo: el plazo de los tickets de clientes empieza al redirigir, no al
-- radicar (tickets.md §5). Sin área tampoco tiene código todavía: el
-- trigger trg_set_codigo_ticket lo genera cuando la redirección fija el
-- área.
--
-- La autorización (¿tiene este navegador un acceso activado, vigente y no
-- de solo lectura?) la decide la aplicación antes de llamar, con el guard
-- del portal (src/server/portal/portal-access.ts): la función no conoce el
-- navegador. Lo que sí comprueba aquí es lo que ninguna llamada debería
-- poder saltarse: que el contacto y su cliente sigan activos.
CREATE FUNCTION "helpdesk"."crear_ticket_cliente"(
    p_id_contacto UUID,
    p_descripcion TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_id_cliente UUID;
    v_id_estado UUID;
    v_id_ticket UUID;
BEGIN
    IF p_id_contacto IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_cliente: el contacto es obligatorio';
    END IF;

    IF NULLIF(BTRIM(p_descripcion), '') IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_cliente: la descripción no puede estar vacía';
    END IF;

    SELECT contacto.id_cliente_contai
    INTO v_id_cliente
    FROM app.portal_contacto AS contacto
    JOIN core.dim_cliente_contai AS cliente
        ON cliente.id_cliente_contai = contacto.id_cliente_contai
    WHERE contacto.id = p_id_contacto
      AND contacto.activo
      AND cliente.estado_cliente;

    IF v_id_cliente IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_cliente: HD_CONTACTO_INACTIVO el contacto % o su cliente no están activos', p_id_contacto;
    END IF;

    SELECT estado.id_estado INTO v_id_estado
    FROM helpdesk.dim_estado AS estado
    WHERE estado.nombre_estado = 'ABIERTO';

    INSERT INTO helpdesk.fact_ticket AS ticket (
        descripcion_problema,
        id_cliente_contai,
        id_contacto_portal,
        id_estado,
        fecha_creacion,
        origen_sistema
    )
    VALUES (
        BTRIM(p_descripcion),
        v_id_cliente,
        p_id_contacto,
        v_id_estado,
        NOW(),
        'PORTAL_CLIENTE'
    )
    RETURNING ticket.id_ticket INTO v_id_ticket;

    -- AMBOS: la descripción la escribió el cliente y es suya.
    PERFORM helpdesk.registrar_evento_ticket(
        p_id_ticket => v_id_ticket,
        p_tipo_evento => 'CREACION'::helpdesk.tipo_evento_ticket,
        p_tipo_actor => 'CLIENTE'::helpdesk.tipo_actor_evento,
        p_id_autor => NULL,
        p_visibilidad => 'AMBOS'::helpdesk.visibilidad_evento,
        p_contenido => BTRIM(p_descripcion),
        p_estado_nuevo => 'ABIERTO',
        p_id_contacto_autor => p_id_contacto
    );

    RETURN v_id_ticket;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."crear_ticket_cliente"(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."crear_ticket_cliente"(UUID, TEXT) TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 5b. T3 · Redirigir un ticket del portal
-- ---------------------------------------------------------------------
-- Quien clasifica elige el tipo de requerimiento; el tipo decide el área y
-- la regla de enrutamiento decide la persona, igual que al crear un ticket
-- interno. Es lo que hacía la antigua /redireccion
-- (src/features/redireccion/actions.ts), con dos diferencias deliberadas:
--   · el responsable se resuelve a una persona activa con acceso, no a un
--     correo en texto que nadie mira (tickets.md §7.2);
--   · NO se encola CREATE_TICKET hacia SharePoint. Qué sistema manda sobre
--     un ticket del portal es U9 (sincronizacion-sharepoint.md §4.1): hasta
--     entonces, estos tickets viven solo en HelpDesk, igual que los
--     internos de U7. Enviarlos a PowerApps los expondría a que la ingesta
--     les reescriba el origen y el estado.
--
-- Plazo: 3 días hábiles fijos desde hoy en Bogotá, al final de ese día
-- (tickets.md §5, requisito de la firma). Es un valor del negocio, no una
-- prioridad: por eso va aquí y no en dim_prioridad.
--
-- La autorización (¿puede esta persona redirigir?) la decide la aplicación
-- antes de llamar, con ticket.redirigir. La función bloquea la fila y
-- vuelve a comprobar que el ticket sigue sin clasificar: dos personas que
-- redirigen a la vez no pueden clasificarlo dos veces.
CREATE FUNCTION "helpdesk"."redirigir_ticket"(
    p_id_ticket UUID,
    p_id_personal UUID,
    p_id_tipo_req UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    c_dias_cliente CONSTANT INTEGER := 3;
    v_origen TEXT;
    v_estado TEXT;
    v_id_area_actual UUID;
    v_id_area UUID;
    v_id_responsable UUID;
    v_correo_encargado TEXT;
    v_nombre_area TEXT;
    v_nombre_tipo TEXT;
    v_nombre_responsable TEXT;
    v_hoy_bogota DATE;
BEGIN
    IF p_id_ticket IS NULL OR p_id_personal IS NULL OR p_id_tipo_req IS NULL THEN
        RAISE EXCEPTION 'redirigir_ticket: ticket, persona y tipo de requerimiento son obligatorios';
    END IF;

    SELECT ticket.origen_sistema, estado.nombre_estado, ticket.id_area_destino
    INTO v_origen, v_estado, v_id_area_actual
    FROM helpdesk.fact_ticket AS ticket
    JOIN helpdesk.dim_estado AS estado
        ON estado.id_estado = ticket.id_estado
    WHERE ticket.id_ticket = p_id_ticket
    FOR UPDATE OF ticket;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'redirigir_ticket: el ticket % no existe', p_id_ticket;
    END IF;

    IF v_origen <> 'PORTAL_CLIENTE' OR v_estado <> 'ABIERTO' OR v_id_area_actual IS NOT NULL THEN
        RAISE EXCEPTION 'redirigir_ticket: HD_NO_REDIRIGIBLE el ticket % ya fue clasificado o no es del portal', p_id_ticket;
    END IF;

    SELECT resuelto.id_area, resuelto.id_responsable, resuelto.correo_encargado
    INTO v_id_area, v_id_responsable, v_correo_encargado
    FROM helpdesk.resolver_responsable_tipo(p_id_tipo_req) AS resuelto;

    SELECT area.nombre_area, tipo.tipo_requerimiento
    INTO v_nombre_area, v_nombre_tipo
    FROM helpdesk.dim_tipo_requerimiento AS tipo
    JOIN core.dim_area AS area ON area.id_area = tipo.id_area
    WHERE tipo.id_tipo_req = p_id_tipo_req;

    SELECT persona.nombre_completo INTO v_nombre_responsable
    FROM core.dim_personal AS persona
    WHERE persona.id_personal = v_id_responsable;

    v_hoy_bogota := (NOW() AT TIME ZONE 'America/Bogota')::DATE;

    -- Área y responsable antes del evento: el escritor exige que un ticket
    -- ASIGNADO los tenga. Fijar id_area_destino dispara el trigger que
    -- genera codigo_ticket.
    UPDATE helpdesk.fact_ticket
    SET id_area_destino = v_id_area,
        id_tipo_req = p_id_tipo_req,
        id_asignado = v_id_responsable,
        encargado_interno = v_correo_encargado,
        fecha_limite = (core.add_colombia_business_days(v_hoy_bogota, c_dias_cliente) + TIME '23:59:59')
            AT TIME ZONE 'America/Bogota',
        ultima_actualizacion = NOW()
    WHERE id_ticket = p_id_ticket;

    -- INTERNO: la clasificación es trabajo del equipo. El cliente ve en su
    -- ticket que pasó a estar en atención.
    RETURN helpdesk.registrar_evento_ticket(
        p_id_ticket => p_id_ticket,
        p_tipo_evento => 'REDIRECCION'::helpdesk.tipo_evento_ticket,
        p_tipo_actor => 'EMPLEADO'::helpdesk.tipo_actor_evento,
        p_id_autor => p_id_personal,
        p_visibilidad => 'INTERNO'::helpdesk.visibilidad_evento,
        p_contenido => 'Redirigido a ' || v_nombre_area || ' · ' || v_nombre_tipo
                       || '. Responsable: ' || v_nombre_responsable || '.',
        p_estado_nuevo => 'ASIGNADO'
    );
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."redirigir_ticket"(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."redirigir_ticket"(UUID, UUID, UUID) TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 6. Correos del ticket a un contacto de cliente (D6)
-- ---------------------------------------------------------------------
-- Responder o rechazar un ticket del portal avisa al contacto que lo
-- radicó, desde la cuenta de quien actúa, como con un solicitante interno.
-- El destinatario es un empleado o un contacto, nunca los dos ni ninguno.
ALTER TABLE "helpdesk"."ticket_notificacion"
    ALTER COLUMN "id_destinatario" DROP NOT NULL;

ALTER TABLE "helpdesk"."ticket_notificacion"
    ADD COLUMN "id_contacto_destinatario" UUID;

ALTER TABLE "helpdesk"."ticket_notificacion"
    ADD CONSTRAINT "ticket_notificacion_id_contacto_destinatario_fkey"
        FOREIGN KEY ("id_contacto_destinatario") REFERENCES "app"."portal_contacto"("id")
        ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "helpdesk"."ticket_notificacion"
    ADD CONSTRAINT "chk_ticket_notificacion_destinatario"
        CHECK (("id_destinatario" IS NULL) <> ("id_contacto_destinatario" IS NULL));


-- ---------------------------------------------------------------------
-- 7. Catálogo de permisos (permisos.md §3, §4.1)
-- ---------------------------------------------------------------------
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('ticket.redirigir', 'Redirigir ticket de cliente',
     'Clasificar un ticket del portal: fija área, tipo y responsable, y empieza el plazo de 3 días hábiles (T3).'),
    ('portal.acceso.administrar', 'Administrar accesos de clientes',
     'Dar de alta contactos de cliente, invitarlos al portal y revocar su acceso.');

-- Los dos roles nuevos trabajan también como agentes: parten de una copia
-- de las reglas de AGENTE y suman lo suyo. Es una copia, no una herencia:
-- un cambio posterior a las reglas de AGENTE no les llega solo, y la
-- migración que lo haga tiene que decidir si también aplica a ellos.
INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance")
SELECT 'CLASIFICADOR'::"core"."rol_aplicacion", regla."codigo_accion", regla."alcance"
FROM "app"."permiso_regla" AS regla
WHERE regla."rol" = 'AGENTE';

INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance")
SELECT 'ADMIN'::"core"."rol_aplicacion", regla."codigo_accion", regla."alcance"
FROM "app"."permiso_regla" AS regla
WHERE regla."rol" = 'AGENTE';

-- TOTAL porque un ticket sin clasificar no tiene responsable ni área: no hay
-- «propio» ni «de mi área» que lo cubra (src/server/authorization/scope.ts).
-- Administrar accesos no se evalúa sobre un ticket; TOTAL dice «cualquier
-- cliente», que es lo que significa en la v1.
INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance") VALUES
    ('CLASIFICADOR', 'ticket.redirigir', 'TOTAL'),
    ('ADMIN', 'portal.acceso.administrar', 'TOTAL');
