-- =====================================================================
-- U7 · Catálogo de permisos y creación de tickets internos
-- (docs/specs/permisos.md §1, §3, §4; docs/specs/tickets.md §3.1, §4.1)
-- =====================================================================
-- Dos piezas, en la misma migración porque la segunda depende de que la
-- aplicación ya no pueda insertar tickets por su cuenta:
--
-- 1. El catálogo de acciones y sus reglas por rol, en PostgreSQL: la única
--    fuente operativa de quién puede hacer qué (permisos.md §1). El código
--    consulta la regla; nunca compara roles.
--
-- 2. helpdesk.crear_ticket_interno: la única vía por la que la aplicación
--    crea un ticket. Inserta el ticket y su evento CREACION en la misma
--    transacción, y a coraje_runtime se le retira el INSERT directo sobre
--    fact_ticket. Cierra el hueco conocido de U6: un INSERT podía fijar el
--    estado inicial sin evento.
--
-- coraje_etl conserva su INSERT: la ingesta crea el ticket legacy y su
-- MIGRACION_LEGACY en la misma ejecución (tickets.md §3.1). Ese camino muere
-- con la retirada de SharePoint.
--
-- Nada existente se modifica ni se borra: solo se crean tablas, filas de
-- catálogo y una función, y se retira un privilegio que la aplicación ya no
-- usa (el portal que insertaba tickets se eliminó en U4).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Catálogo de permisos (permisos.md §3, §4)
-- ---------------------------------------------------------------------
-- El alcance responde «sobre qué» (permisos.md §4). Su significado exacto
-- por acción vive en un solo sitio, src/server/authorization/scope.ts:
--   PROPIO  el ticket es de la persona. Para actuar, es su responsable;
--           para consultar, además, lo radicó ella.
--   AREA    PROPIO, más los tickets cuya área destino es la de la persona.
--   TOTAL   cualquier ticket. Ningún rol lo tiene en la v1.
-- Sin fila de regla, la acción está denegada: no hay rama que conceda por
-- defecto.
CREATE TYPE "app"."alcance_permiso" AS ENUM ('PROPIO', 'AREA', 'TOTAL');

CREATE TABLE "app"."permiso_accion" (
    "codigo" VARCHAR(80) NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "permiso_accion_pkey" PRIMARY KEY ("codigo")
);

CREATE TABLE "app"."permiso_regla" (
    "rol" "core"."rol_aplicacion" NOT NULL,
    "codigo_accion" VARCHAR(80) NOT NULL,
    "alcance" "app"."alcance_permiso" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "permiso_regla_pkey" PRIMARY KEY ("rol", "codigo_accion"),
    CONSTRAINT "permiso_regla_codigo_accion_fkey"
        FOREIGN KEY ("codigo_accion")
        REFERENCES "app"."permiso_accion"("codigo")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

-- Acciones de la v1 que tienen transición o efecto construido (tickets.md
-- §4.1). Redirigir (T3) no está: solo lo producen los tickets de clientes, y
-- llega con U8. Observadores, solicitud de validación y calificación tampoco:
-- se añaden con su entrega.
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('ticket.consultar', 'Consultar tickets',
     'Ver un ticket, su historia y la bandeja que lo contiene.'),
    ('ticket.crear', 'Crear ticket',
     'Radicar un ticket propio hacia un área (T2).'),
    ('ticket.reasignar', 'Reasignar responsable',
     'Pasar un ticket asignado a otra persona de la misma área, sin reiniciar el plazo (T4).'),
    ('ticket.responder', 'Responder y cerrar',
     'Responder al solicitante; responder cierra el ticket, como en el legacy (T7).'),
    ('ticket.rechazar', 'Rechazar',
     'Declarar que el ticket no se atiende, con motivo obligatorio (T8).'),
    ('ticket.nota_interna', 'Registrar nota interna',
     'Añadir una nota que el solicitante no ve. No cambia el estado.'),
    ('ticket.notificacion.reenviar', 'Reenviar notificación',
     'Volver a enviar un correo del ticket que falló.');

-- AGENTE es el único rol de la v1 (permisos.md §6). Quien actúa sobre un
-- ticket es su responsable, como en el legacy (reglas-negocio-powerapps.md
-- §6: «quien recibe el ticket es quien puede actuar sobre él»). Consultar y
-- anotar se abren al área: el equipo ve y comenta el trabajo de su área.
INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance") VALUES
    ('AGENTE', 'ticket.consultar', 'AREA'),
    ('AGENTE', 'ticket.crear', 'PROPIO'),
    ('AGENTE', 'ticket.reasignar', 'PROPIO'),
    ('AGENTE', 'ticket.responder', 'PROPIO'),
    ('AGENTE', 'ticket.rechazar', 'PROPIO'),
    ('AGENTE', 'ticket.nota_interna', 'AREA'),
    ('AGENTE', 'ticket.notificacion.reenviar', 'PROPIO');

-- La aplicación lee el catálogo; no lo edita. Cambiar una regla es una
-- migración, visible en la revisión, hasta que exista una consola de
-- administración (permisos.md §8, entrega 6).
GRANT SELECT ON "app"."permiso_accion", "app"."permiso_regla" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. Creación de un ticket interno (T2)
-- ---------------------------------------------------------------------
-- Reproduce la regla de creación del legacy (reglas-negocio-powerapps.md §5):
-- el área la decide el tipo de requerimiento elegido, y el responsable sale
-- de la tabla de enrutamiento. Aquí:
--   · helpdesk.routing_rule activa del tipo, si existe (la excepción de
--     PROYECTOS Y TI vive ahí como fila, no como código);
--   · si no, core.dim_area.encargado_recepcion, que la ingesta copia de la
--     lista RecibeHelpdesk de SharePoint.
-- Las dos columnas son correos en texto (tickets.md §7.2). Se resuelven aquí
-- contra core.dim_personal por el índice único parcial
-- ux_dim_personal_correo_activo, así que la resolución no puede ser ambigua.
--
-- Falla con un error con nombre, en vez de crear un ticket sin dueño, si:
--   · el área no tiene responsable de recepción;
--   · el correo no corresponde a una persona activa;
--   · esa persona no tiene rol en HelpDesk y no podría entrar a atenderlo.
-- En el legacy el ticket nacía igual y quedaba asignado a un correo que nadie
-- miraba.
--
-- El plazo es el del legacy (tickets.md §5): los días hábiles de la prioridad
-- elegida, contados desde hoy en Bogotá, y vence al final de ese día hábil.
-- Crear no inicia ningún cambio de turno: en la v1 el plazo corre hasta el
-- cierre o el rechazo.
--
-- SECURITY DEFINER por la misma razón que el escritor único: corre como
-- coraje_migrator, dueño de fact_ticket, y así puede insertar aunque
-- coraje_runtime ya no pueda. search_path fijado y todo nombre calificado.
-- La autorización (¿puede esta persona crear?) la decide la aplicación antes
-- de llamar, con el catálogo de arriba: la función no conoce la sesión.
CREATE FUNCTION "helpdesk"."crear_ticket_interno"(
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
-- La opción de arriba va primero, antes de cualquier otra cosa del cuerpo.
-- Las columnas de salida (id_ticket, codigo_ticket) se llaman igual que las
-- de fact_ticket; ante la duda, PL/pgSQL debe leer la columna, no la variable.
DECLARE
    v_id_area UUID;
    v_correo_encargado TEXT;
    v_id_responsable UUID;
    v_rol_responsable TEXT;
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

    -- El tipo decide el área: en el catálogo, cada tipo pertenece a una sola.
    SELECT tipo.id_area,
           LOWER(BTRIM(COALESCE(regla.encargado_interno, area.encargado_recepcion)))
    INTO v_id_area, v_correo_encargado
    FROM helpdesk.dim_tipo_requerimiento AS tipo
    JOIN core.dim_area AS area
        ON area.id_area = tipo.id_area
    LEFT JOIN helpdesk.routing_rule AS regla
        ON regla.id_tipo_req = tipo.id_tipo_req
       AND regla.activo
    WHERE tipo.id_tipo_req = p_id_tipo_req;

    IF v_id_area IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_interno: el tipo de requerimiento % no existe', p_id_tipo_req;
    END IF;

    IF NULLIF(v_correo_encargado, '') IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_interno: HD_SIN_RESPONSABLE el área no tiene responsable de recepción';
    END IF;

    SELECT persona.id_personal, persona.rol_aplicacion::TEXT
    INTO v_id_responsable, v_rol_responsable
    FROM core.dim_personal AS persona
    WHERE LOWER(persona.correo_corporativo) = v_correo_encargado
      AND persona.estado_activo
      AND NOT persona.es_responsable_historico_no_identificado;

    IF v_id_responsable IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_interno: HD_RESPONSABLE_INACTIVO el responsable % no es una persona activa', v_correo_encargado;
    END IF;

    IF v_rol_responsable IS NULL THEN
        RAISE EXCEPTION 'crear_ticket_interno: HD_RESPONSABLE_SIN_ACCESO el responsable % no tiene acceso a HelpDesk', v_correo_encargado;
    END IF;

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

    -- codigo_ticket lo genera el trigger trg_set_codigo_ticket al insertar con
    -- área (migración 20260924120000_corregir_codigo_ticket).
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
        -- Final del día hábil de vencimiento, en hora de Bogotá.
        (core.add_colombia_business_days(v_hoy_bogota, v_dias_sla) + TIME '23:59:59')
            AT TIME ZONE 'America/Bogota',
        'SISTEMA_INTERNO',
        v_correo_encargado
    )
    RETURNING ticket.id_ticket, ticket.codigo_ticket INTO v_id_ticket, v_codigo;

    -- El evento de inicio, en la misma transacción. Visibilidad AMBOS: la
    -- descripción la escribió el solicitante y es suya.
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

REVOKE ALL ON FUNCTION "helpdesk"."crear_ticket_interno"(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."crear_ticket_interno"(UUID, UUID, TEXT, TEXT) TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 3. La aplicación ya no inserta tickets directamente
-- ---------------------------------------------------------------------
-- Prueba negativa, contra la base desplegada: un INSERT en fact_ticket con
-- coraje_runtime falla con permission denied, y la función de arriba crea.
REVOKE INSERT ON "helpdesk"."fact_ticket" FROM "coraje_runtime";
