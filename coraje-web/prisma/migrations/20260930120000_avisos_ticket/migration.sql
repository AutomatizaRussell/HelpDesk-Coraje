-- =====================================================================
-- Avisos del ticket: centro de notificaciones (U15, docs/specs/tickets.md §12)
-- =====================================================================
-- Decisiones del usuario del 30-sep-2026:
--
--   1. Los empleados dejan de recibir un correo por cada acción. Cada aviso
--      llega a la campana de HelpDesk. Los contactos de clientes siguen
--      recibiendo su correo como hasta ahora (ticket_notificacion).
--
--   2. Dos clases, como en Impulsa:
--        ATENCION  pide una acción y queda abierta hasta que se actúa:
--                  un ticket que te llega (crear, reasignar, redirigir) y
--                  una validación que te piden.
--        NOVEDAD   solo informa; se marca leída.
--
--   3. Un pendiente de ATENCION que sigue abierto más de un día hábil se
--      escala por correo, uno por persona y día, desde el buzón sin dueño
--      automatizacionmedellin@ (el mismo del portal, D4). Lo dispara la
--      programación diaria de n8n; no hay proceso nuevo.
--
-- Diferencia con Impulsa, a propósito: allí un pendiente (attention item)
-- tiene varios destinatarios y cada entrega es otra fila. Aquí cada
-- pendiente tiene exactamente uno —el responsable o el validador—, así que
-- basta una sola tabla con la clase en la fila.
--
-- Qué cierra un pendiente lo decide la base, no la aplicación (sección 3):
-- así se cierra también cuando el cambio llega aceptado desde PowerApps
-- (U9), que no pasa por ningún comando de la aplicación.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Avisos
-- ---------------------------------------------------------------------
-- El título y el detalle no se guardan: se derivan del tipo, del ticket y
-- del evento al leer (ticket-notice-content.ts). Guardarlos duplicaría lo
-- que el evento ya dice.
--
-- tipo y clase: la lista de tipos y su clase tienen que coincidir con
-- NOTICE_CLASS de src/server/notifications/ticket-notice-kinds.ts. Una
-- prueba de contrato lee esta migración y lo comprueba.
--
-- id_suplantador — SUPLANTACIÓN, bloque temporal: quien actuó de verdad si
-- estaba suplantando. El aviso llega igual a la campana del destinatario,
-- pero no se escala: un correo de prueba no debe llegarle a un compañero.
CREATE TABLE "helpdesk"."ticket_aviso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_ticket" UUID NOT NULL,
    "id_evento" UUID NOT NULL,
    "id_destinatario" UUID NOT NULL,
    "id_autor" UUID NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "clase" VARCHAR(10) NOT NULL,
    "id_suplantador" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "leido_at" TIMESTAMPTZ(6),
    "resuelto_at" TIMESTAMPTZ(6),

    CONSTRAINT "ticket_aviso_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_ticket_aviso_tipo" CHECK ("tipo" IN (
        'CREACION_RESPONSABLE',
        'REASIGNACION_RESPONSABLE',
        'REDIRECCION_RESPONSABLE',
        'SOLICITUD_VALIDACION',
        'REASIGNACION_SOLICITANTE',
        'RESPUESTA_SOLICITANTE',
        'RECHAZO_SOLICITANTE',
        'OBSERVADOR_AGREGADO',
        'RESPUESTA_OBSERVADOR',
        'RECHAZO_OBSERVADOR',
        'COMENTARIO_SOLICITANTE_RESPONSABLE'
    )),
    -- La clase se deriva del tipo. Se guarda para que los índices parciales
    -- y el trigger filtren sin repetir la lista, y este CHECK impide que las
    -- dos digan cosas distintas.
    CONSTRAINT "chk_ticket_aviso_clase" CHECK (
        "clase" = CASE WHEN "tipo" IN (
            'CREACION_RESPONSABLE',
            'REASIGNACION_RESPONSABLE',
            'REDIRECCION_RESPONSABLE',
            'SOLICITUD_VALIDACION'
        ) THEN 'ATENCION' ELSE 'NOVEDAD' END
    ),
    -- Una novedad no se resuelve: se lee.
    CONSTRAINT "chk_ticket_aviso_resuelto" CHECK ("clase" = 'ATENCION' OR "resuelto_at" IS NULL),
    -- Nadie necesita que le avisen de lo que acaba de hacer.
    CONSTRAINT "chk_ticket_aviso_no_propio" CHECK ("id_destinatario" <> "id_autor"),
    -- RESTRICT, igual que los eventos: un ticket con historia no se borra.
    CONSTRAINT "ticket_aviso_id_ticket_fkey"
        FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_aviso_id_evento_fkey"
        FOREIGN KEY ("id_evento") REFERENCES "helpdesk"."fact_ticket_evento"("id_evento")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_aviso_id_destinatario_fkey"
        FOREIGN KEY ("id_destinatario") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_aviso_id_autor_fkey"
        FOREIGN KEY ("id_autor") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_aviso_id_suplantador_fkey"
        FOREIGN KEY ("id_suplantador") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- «Novedades» de una persona, lo más reciente primero.
CREATE INDEX "ix_ticket_aviso_destinatario"
    ON "helpdesk"."ticket_aviso" ("id_destinatario", "created_at" DESC);

-- El número de la campana, en cada página: solo lo no leído.
CREATE INDEX "ix_ticket_aviso_no_leido"
    ON "helpdesk"."ticket_aviso" ("id_destinatario")
    WHERE "leido_at" IS NULL;

-- «Requiere tu atención» y el escalamiento diario: solo lo abierto.
CREATE INDEX "ix_ticket_aviso_atencion_abierta"
    ON "helpdesk"."ticket_aviso" ("id_destinatario", "created_at")
    WHERE "clase" = 'ATENCION' AND "resuelto_at" IS NULL;

-- El trigger de la sección 3 busca lo abierto de un ticket.
CREATE INDEX "ix_ticket_aviso_atencion_ticket"
    ON "helpdesk"."ticket_aviso" ("id_ticket")
    WHERE "clase" = 'ATENCION' AND "resuelto_at" IS NULL;

-- ALTER DEFAULT PRIVILEGES concede DML completo a los dos roles en cada
-- tabla nueva (operacion.md, F6). La aplicación crea avisos y los marca
-- leídos; resuelto_at solo lo escribe el trigger, que es SECURITY DEFINER.
-- La ingesta no tiene nada que hacer aquí.
REVOKE ALL ON "helpdesk"."ticket_aviso" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT ON "helpdesk"."ticket_aviso" TO "coraje_runtime";
GRANT UPDATE ("leido_at") ON "helpdesk"."ticket_aviso" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. Escalamiento por correo
-- ---------------------------------------------------------------------
-- Una fila por persona y día (Bogotá). La unicidad es la idempotencia: si
-- la programación diaria corre dos veces, o n8n reintenta, la segunda
-- pasada no crea otra fila y solo reclama lo que no salió.
--
-- estado:
--   PENDIENTE  creada, todavía sin enviar.
--   ENVIANDO   reclamada por un envío en curso. Si el envío muere aquí, se
--              puede reclamar de nuevo pasados 15 minutos.
--   ENVIADO    n8n confirmó el envío.
--   FALLIDO    n8n o Graph lo rechazaron; ultimo_error dice por qué.
--   OMITIDO    al reclamarla ya no quedaba ningún pendiente escalable (se
--              cerraron entre un intento y el reintento): no se envía nada.
CREATE TABLE "helpdesk"."aviso_escalamiento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_personal" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "avisos" INTEGER NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "enviado_at" TIMESTAMPTZ(6),

    CONSTRAINT "aviso_escalamiento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_aviso_escalamiento_persona_fecha" UNIQUE ("id_personal", "fecha"),
    CONSTRAINT "chk_aviso_escalamiento_estado"
        CHECK ("estado" IN ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO', 'OMITIDO')),
    CONSTRAINT "chk_aviso_escalamiento_avisos" CHECK ("avisos" > 0),
    CONSTRAINT "chk_aviso_escalamiento_intentos" CHECK ("intentos" >= 0),
    CONSTRAINT "aviso_escalamiento_id_personal_fkey"
        FOREIGN KEY ("id_personal") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- Sin DELETE: lo que se escaló es evidencia, como los correos del ticket.
REVOKE ALL ON "helpdesk"."aviso_escalamiento" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT, UPDATE ON "helpdesk"."aviso_escalamiento" TO "coraje_runtime";

-- Qué aviso se escala: un pendiente de ATENCION abierto desde hace más de
-- un día hábil. «Más de un día hábil» es que entre el día en que llegó y
-- hoy haya pasado un día hábil completo: llegó el lunes → se escala el
-- miércoles; llegó el viernes → el martes. Un aviso de prueba (creado
-- suplantando) no se escala nunca.
--
-- Es la única definición de la regla: la usan la selección de personas y la
-- lista que va en el correo, para que el correo diga exactamente por qué
-- llegó. SQL puro y STABLE, así que el planificador la inlinea.
CREATE FUNCTION "helpdesk"."aviso_escalable"(p_aviso "helpdesk"."ticket_aviso", p_hoy DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $function$
    SELECT p_aviso.clase = 'ATENCION'
       AND p_aviso.resuelto_at IS NULL
       AND p_aviso.id_suplantador IS NULL
       AND core.add_colombia_business_days((p_aviso.created_at AT TIME ZONE 'America/Bogota')::DATE, 2) <= p_hoy
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."aviso_escalable"("helpdesk"."ticket_aviso", DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."aviso_escalable"("helpdesk"."ticket_aviso", DATE) TO "coraje_runtime";

-- A quién se escala hoy, ya reclamado (ENVIANDO), con los avisos que van en
-- su correo. Solo en días hábiles: un correo de trabajo el sábado es ruido.
-- Quién entra: una persona activa, con correo, con al menos un aviso
-- escalable.
--
-- La fila del día se crea una vez (ON CONFLICT DO NOTHING); lo que se
-- reclama después es lo que todavía no salió. Así una segunda pasada el
-- mismo día no repite un correo enviado y sí reintenta uno fallido.
CREATE FUNCTION "helpdesk"."reclamar_escalamientos_avisos"()
RETURNS TABLE (
    id_escalamiento UUID,
    id_personal UUID,
    correo TEXT,
    nombre TEXT,
    id_avisos UUID[]
)
LANGUAGE plpgsql
AS $function$
-- Las columnas de salida se llaman como columnas de las tablas: ante la
-- duda, que plpgsql lea la columna y no la variable.
#variable_conflict use_column
DECLARE
    v_hoy DATE := (NOW() AT TIME ZONE 'America/Bogota')::DATE;
BEGIN
    IF NOT core.is_colombia_business_day(v_hoy) THEN
        RETURN;
    END IF;

    -- Las dos primeras condiciones repiten las de aviso_escalable para que
    -- el planificador use el índice parcial de lo abierto.
    INSERT INTO helpdesk.aviso_escalamiento (id_personal, fecha, avisos)
    SELECT aviso.id_destinatario, v_hoy, COUNT(*)::INTEGER
    FROM helpdesk.ticket_aviso AS aviso
    JOIN core.dim_personal AS persona
        ON persona.id_personal = aviso.id_destinatario
    WHERE aviso.clase = 'ATENCION'
      AND aviso.resuelto_at IS NULL
      AND helpdesk.aviso_escalable(aviso, v_hoy)
      AND persona.estado_activo
      AND NULLIF(BTRIM(persona.correo_corporativo), '') IS NOT NULL
    GROUP BY aviso.id_destinatario
    ON CONFLICT ON CONSTRAINT uq_aviso_escalamiento_persona_fecha DO NOTHING;

    -- id_avisos se lee al reclamar: si un pendiente se cerró entre la
    -- primera pasada y un reintento, ya no va en el correo. Si se cerraron
    -- todos, el arreglo llega vacío y la aplicación no envía nada.
    RETURN QUERY
    UPDATE helpdesk.aviso_escalamiento AS escalamiento
    SET estado = 'ENVIANDO', intentos = escalamiento.intentos + 1, updated_at = NOW()
    FROM core.dim_personal AS persona
    WHERE persona.id_personal = escalamiento.id_personal
      AND escalamiento.fecha = v_hoy
      AND (
          escalamiento.estado IN ('PENDIENTE', 'FALLIDO')
          OR (escalamiento.estado = 'ENVIANDO' AND escalamiento.updated_at < NOW() - INTERVAL '15 minutes')
      )
    RETURNING
        escalamiento.id,
        escalamiento.id_personal,
        BTRIM(persona.correo_corporativo)::TEXT,
        persona.nombre_completo::TEXT,
        ARRAY(
            SELECT aviso.id
            FROM helpdesk.ticket_aviso AS aviso
            WHERE aviso.id_destinatario = escalamiento.id_personal
              AND aviso.clase = 'ATENCION'
              AND aviso.resuelto_at IS NULL
              AND helpdesk.aviso_escalable(aviso, v_hoy)
            ORDER BY aviso.created_at
        );
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."reclamar_escalamientos_avisos"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."reclamar_escalamientos_avisos"() TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 3. Qué cierra un pendiente
-- ---------------------------------------------------------------------
-- Dos reglas, sobre la proyección del ticket:
--   · el ticket termina (CERRADO o RECHAZADO) → se cierra todo lo que
--     pedía atención en él, incluidas las validaciones: en la v1 no hay
--     respuesta del validador, y un ticket terminado ya no espera nada;
--   · cambia el responsable → se cierra lo que le pedía atender el ticket
--     a quien deja de serlo. Su validación, si la tenía, sigue abierta.
--
-- AFTER UPDATE con WHEN: la ingesta reescribe todos los tickets en cada
-- pasada, y el WHEN descarta sin llamar a la función las filas en las que
-- no cambió ni el estado ni el responsable.
--
-- SECURITY DEFINER: resuelto_at no es escribible por los roles que cambian
-- tickets (coraje_runtime, y coraje_etl cuando acepta un cambio de
-- PowerApps). Solo esta regla lo escribe.
CREATE FUNCTION "helpdesk"."resolver_avisos_ticket"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
    IF NEW.id_estado IS DISTINCT FROM OLD.id_estado AND EXISTS (
        SELECT 1
        FROM helpdesk.dim_estado AS estado
        WHERE estado.id_estado = NEW.id_estado
          AND estado.nombre_estado IN ('CERRADO', 'RECHAZADO')
    ) THEN
        UPDATE helpdesk.ticket_aviso
        SET resuelto_at = NOW()
        WHERE id_ticket = NEW.id_ticket
          AND clase = 'ATENCION'
          AND resuelto_at IS NULL;
        RETURN NULL;
    END IF;

    IF NEW.id_asignado IS DISTINCT FROM OLD.id_asignado AND OLD.id_asignado IS NOT NULL THEN
        UPDATE helpdesk.ticket_aviso
        SET resuelto_at = NOW()
        WHERE id_ticket = NEW.id_ticket
          AND id_destinatario = OLD.id_asignado
          AND tipo IN ('CREACION_RESPONSABLE', 'REASIGNACION_RESPONSABLE', 'REDIRECCION_RESPONSABLE')
          AND resuelto_at IS NULL;
    END IF;

    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."resolver_avisos_ticket"() FROM PUBLIC;

CREATE TRIGGER "trg_resolver_avisos_ticket"
AFTER UPDATE OF "id_estado", "id_asignado" ON "helpdesk"."fact_ticket"
FOR EACH ROW
WHEN (OLD."id_estado" IS DISTINCT FROM NEW."id_estado" OR OLD."id_asignado" IS DISTINCT FROM NEW."id_asignado")
EXECUTE FUNCTION "helpdesk"."resolver_avisos_ticket"();


-- ---------------------------------------------------------------------
-- 4. Permiso
-- ---------------------------------------------------------------------
-- Cada empleado ve sus propios avisos y nada más: PROPIO para los tres
-- roles (copia, no herencia: permisos.md §4.2).
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('aviso.consultar', 'Consultar avisos',
     'Ver los avisos propios en la campana y en la página de avisos, y marcarlos como leídos.');

INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance")
SELECT rol."rol", 'aviso.consultar', 'PROPIO'::"app"."alcance_permiso"
FROM (VALUES ('COLABORADOR'::"core"."rol_aplicacion"), ('CLASIFICADOR'), ('ADMIN')) AS rol("rol");
