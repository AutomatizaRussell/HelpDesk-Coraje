-- =====================================================================
-- U9 · Regla de precedencia con SharePoint: un dueño por ticket
-- (docs/specs/sincronizacion-sharepoint.md §4.3, decisión del 28-sep-2026)
-- =====================================================================
-- La regla, decidida por el usuario:
--   · Un ticket que nace en PowerApps (SHAREPOINT_LEGACY) es de SharePoint:
--     la ingesta manda sobre él como siempre, y en HelpDesk solo se consulta
--     hasta el corte.
--   · Un ticket que nace en HelpDesk (SISTEMA_INTERNO, PORTAL_CLIENTE) es de
--     HelpDesk. Se refleja en la lista HelpDeskBd para quien siga trabajando
--     en PowerApps: se crea allí y se actualiza en cada cambio.
--   · Si alguien lo cambia en PowerApps, el cambio se acepta cuando es una
--     acción válida en HelpDesk, con su evento. Si no, queda registrado como
--     divergencia rechazada y se avisa. Nada se pierde en silencio.
--
-- Esta migración pone la parte de la base:
--   1. Interruptor del espejo, apagado. Encenderlo es un UPDATE deliberado.
--   2. Lo último que HelpDesk vio de su ítem en SharePoint, para distinguir
--      un eco de un cambio hecho en PowerApps.
--   3. Registro de divergencias: cada cambio de PowerApps sobre un ticket de
--      HelpDesk, aplicado o rechazado.
--   4. Trigger que encola el espejo en helpdesk.ticket_sync_outbox cada vez
--      que cambia un ticket de HelpDesk. Ningún comando puede olvidarlo.
--   5. Vista de actividad de PowerApps: la señal para desconectarlo.
--
-- Los workflows de n8n que la acompañan (ingesta y salida) se versionan en
-- n8n/ en el mismo commit. El orden de despliegue está en
-- docs/estado/handoff.md, «Acción inmediata».
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Interruptor del espejo
-- ---------------------------------------------------------------------
-- Una fila. Con activo_desde NULL la salida no envía nada, aunque la cola
-- tenga filas: los tickets de prueba no llegan a la lista que usa PowerApps
-- en producción hasta que alguien lo decide.
--
-- Solo se reflejan los cambios encolados desde activo_desde en adelante. Así,
-- encender el espejo no vuelca de golpe a SharePoint los tickets de prueba
-- acumulados antes.
CREATE TABLE "helpdesk"."espejo_sharepoint" (
    "id" BOOLEAN NOT NULL DEFAULT TRUE,
    "activo_desde" TIMESTAMPTZ(6),
    "motivo" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "espejo_sharepoint_pkey" PRIMARY KEY ("id"),
    -- Fila única: la clave solo admite TRUE.
    CONSTRAINT "chk_espejo_sharepoint_unica" CHECK ("id")
);

INSERT INTO "helpdesk"."espejo_sharepoint" ("id", "activo_desde", "motivo")
VALUES (TRUE, NULL, 'Apagado al crear (U9). Se enciende cuando se decida reflejar los tickets de HelpDesk en PowerApps.');

-- La aplicación muestra si el espejo está encendido; no lo cambia.
GRANT SELECT ON "helpdesk"."espejo_sharepoint" TO "coraje_runtime", "coraje_etl";


-- ---------------------------------------------------------------------
-- 2. Lo último que HelpDesk vio de su ítem en SharePoint
-- ---------------------------------------------------------------------
-- espejo_conciliado guarda los campos del ítem tal como SharePoint los
-- devolvió después de la última escritura de HelpDesk, o después de la
-- última conciliación de la ingesta. Se guarda lo que devuelve SharePoint y
-- no lo que se envió: si SharePoint normaliza un valor (texto enriquecido,
-- mayúsculas), la comparación sigue siendo entre dos lecturas de la misma
-- API.
--
-- La ingesta compara el ítem actual contra esto. Si SharePoint lo modificó
-- después (Modified mayor) y algún campo difiere, lo cambió alguien en
-- PowerApps. Si no, es el eco de la propia escritura de HelpDesk.
ALTER TABLE "helpdesk"."ticket_legacy_sharepoint_ref"
    ADD COLUMN "espejo_conciliado" JSONB,
    ADD COLUMN "espejo_conciliado_at" TIMESTAMPTZ(6);


-- ---------------------------------------------------------------------
-- 3. Divergencias: cambios de PowerApps sobre tickets de HelpDesk
-- ---------------------------------------------------------------------
-- Una fila por campo que PowerApps cambió. resultado:
--   APLICADO   la ingesta lo llevó a HelpDesk, con su evento en la historia;
--   RECHAZADO  no es una acción válida en HelpDesk (reabrir un ticket
--              terminado, asignar a quien no tiene acceso, cambiar el área)
--              y HelpDesk no lo aplicó. Queda aquí, se muestra en el ticket y
--              se avisa por Teams.
-- Es además la mitad de la señal de corte (sección 5): mientras aparezcan
-- filas, alguien sigue trabajando en PowerApps.
CREATE TABLE "helpdesk"."sync_divergencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_ticket" UUID NOT NULL,
    "sp_id" INTEGER NOT NULL,
    "campo" VARCHAR(60) NOT NULL,
    "valor_helpdesk" TEXT,
    "valor_sharepoint" TEXT,
    "resultado" VARCHAR(20) NOT NULL,
    "motivo" VARCHAR(1000),
    "modificado_en_sharepoint_at" TIMESTAMPTZ(6),
    "detectado_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "sync_divergencia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_sync_divergencia_resultado" CHECK ("resultado" IN ('APLICADO', 'RECHAZADO')),
    -- RESTRICT, como los eventos: un ticket con historia no se borra.
    CONSTRAINT "sync_divergencia_id_ticket_fkey"
        FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "ix_sync_divergencia_ticket" ON "helpdesk"."sync_divergencia" ("id_ticket", "detectado_at");
CREATE INDEX "ix_sync_divergencia_detectado" ON "helpdesk"."sync_divergencia" ("detectado_at");

-- La ingesta la escribe; la aplicación la lee. Nadie la edita: es evidencia.
GRANT SELECT, INSERT ON "helpdesk"."sync_divergencia" TO "coraje_etl";
GRANT SELECT ON "helpdesk"."sync_divergencia" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 4. El espejo se encola en la base, no en cada comando
-- ---------------------------------------------------------------------
-- Un trigger sobre fact_ticket y no una llamada en cada comando de la
-- aplicación: así ningún camino que cambie un ticket de HelpDesk (crear,
-- clasificar, reasignar, responder, rechazar, o una conciliación de la
-- ingesta) puede olvidar el espejo. Es el mismo patrón que ya tenía el
-- outbox (sincronizacion-sharepoint.md §2.2): la intención se escribe en la
-- misma transacción que el cambio, y n8n la recoge después.
--
-- Qué encola:
--   · CREATE_TICKET si el ticket todavía no tiene ítem en SharePoint;
--   · UPDATE_TICKET si ya lo tiene y cambió algo de lo que se refleja
--     (estado, responsable, respuesta, cierre, calificación).
-- Qué no encola:
--   · tickets de SharePoint (su dueño es SharePoint);
--   · tickets del portal sin clasificar: PowerApps exige área y tipo.
--
-- ON CONFLICT DO NOTHING sobre el índice parcial único de siempre: dos
-- cambios seguidos dejan una sola fila pendiente. El contenido no viaja en
-- la fila: la salida lo lee del ticket al enviar, así que siempre manda el
-- estado más reciente. Si un cambio llega mientras un envío está en curso,
-- la propia salida lo detecta al terminar y encola otro (n8n, PG - Mark SENT).
--
-- SECURITY DEFINER: el outbox no tiene por qué ser escribible por los roles
-- que cambian tickets.
CREATE FUNCTION "helpdesk"."encolar_espejo_sharepoint"()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_operacion TEXT;
BEGIN
    IF NEW.origen_sistema NOT IN ('SISTEMA_INTERNO', 'PORTAL_CLIENTE') THEN
        RETURN NULL;
    END IF;

    IF NEW.id_area_destino IS NULL OR NEW.id_tipo_req IS NULL THEN
        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM helpdesk.ticket_legacy_sharepoint_ref AS ref
        WHERE ref.id_ticket = NEW.id_ticket
    ) THEN
        IF TG_OP = 'UPDATE' AND (
            OLD.id_estado, OLD.id_asignado, OLD.respuesta_final, OLD.fecha_resolucion, OLD.calificacion
        ) IS NOT DISTINCT FROM (
            NEW.id_estado, NEW.id_asignado, NEW.respuesta_final, NEW.fecha_resolucion, NEW.calificacion
        ) THEN
            RETURN NULL;
        END IF;
        v_operacion := 'UPDATE_TICKET';
    ELSE
        v_operacion := 'CREATE_TICKET';
    END IF;

    INSERT INTO helpdesk.ticket_sync_outbox (id_ticket, operation, status, target_system, payload)
    VALUES (NEW.id_ticket, v_operacion, 'PENDING', 'SHAREPOINT', jsonb_build_object('source', 'HELPDESK', 'trigger', TG_OP))
    ON CONFLICT (id_ticket, operation)
        WHERE status = ANY (ARRAY['PENDING'::TEXT, 'PROCESSING'::TEXT])
        DO NOTHING;

    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."encolar_espejo_sharepoint"() FROM PUBLIC;

-- AFTER: el ticket ya está escrito, y el INSERT de la creación ya tiene
-- código. La columna codigo_ticket la completa el trigger BEFORE de siempre.
CREATE TRIGGER "trg_encolar_espejo_sharepoint"
AFTER INSERT OR UPDATE ON "helpdesk"."fact_ticket"
FOR EACH ROW EXECUTE FUNCTION "helpdesk"."encolar_espejo_sharepoint"();


-- ---------------------------------------------------------------------
-- 4b. La traducción HelpDesk ⇄ SharePoint vive aquí, no en n8n
-- ---------------------------------------------------------------------
-- n8n transporta; no transforma (CLAUDE.md, fronteras). Las dos funciones
-- son la única definición de cómo se ve un ticket de HelpDesk en la lista
-- HelpDeskBd y de qué campos de esa lista se vigilan.

-- Campos vigilados de un ítem de HelpDeskBd, normalizados. La usan la salida
-- (al guardar lo que SharePoint devolvió tras escribir) y la ingesta (al
-- leer el ítem actual): comparar dos lecturas pasadas por la misma función
-- es lo que hace fiable la detección de cambios hechos en PowerApps.
--
-- Acepta el ítem con o sin el envoltorio `d` de odata=verbose.
CREATE FUNCTION "helpdesk"."espejo_campos"(p_item JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $function$
    WITH item AS (SELECT COALESCE(p_item->'d', p_item) AS v)
    SELECT CASE WHEN p_item IS NULL THEN NULL ELSE jsonb_build_object(
        'Modified',      NULLIF(BTRIM(v->>'Modified'), ''),
        'Estado',        NULLIF(BTRIM(v->>'Estado'), ''),
        'AsignadoA',     NULLIF(LOWER(BTRIM(v->>'AsignadoA')), ''),
        'Respuesta',     NULLIF(BTRIM(v->>'Respuesta'), ''),
        'Calificacion',  NULLIF(BTRIM(v->>'Calificaci_x00f3_n'), ''),
        'AreaDestino',   NULLIF(BTRIM(v->>'OData__x00c1_rea_Destino'), ''),
        'Tipo',          NULLIF(BTRIM(v->>'Tipo_Requerimiento'), ''),
        'Requerimiento', NULLIF(BTRIM(v->>'Requerimiento'), '')
    ) END
    FROM item;
$function$;

-- El ítem de HelpDeskBd que corresponde a un ticket de HelpDesk, listo para
-- enviar. CREATE_TICKET lleva todos los campos; UPDATE_TICKET, solo los que
-- cambian con el ciclo del ticket (estado, responsable, respuesta, cierre,
-- calificación). Los campos vacíos no se envían.
--
-- Traducción de estados (inversa de tickets.md §4.2):
--   ASIGNADO   -> «Abierto», o «Reasignado» si ya se reasignó una vez;
--   CERRADO    -> «Cerrado», con la respuesta;
--   RECHAZADO  -> «Cerrado», con «RECHAZADO: <motivo>» como respuesta.
--                 PowerApps no tiene estado de rechazo: es la única
--                 traducción con pérdida, y queda nombrada aquí.
-- Formatos: los mismos que la ingesta lee (fechas DD/MM/YYYY en hora de
-- Bogotá, prioridad «Media (3 días)», correos en minúsculas).
CREATE FUNCTION "helpdesk"."item_espejo_sharepoint"(p_id_ticket UUID, p_operacion TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    t RECORD;
    v_estado TEXT;
    v_respuesta TEXT;
    v_item JSONB;
BEGIN
    IF p_operacion NOT IN ('CREATE_TICKET', 'UPDATE_TICKET') THEN
        RAISE EXCEPTION 'item_espejo_sharepoint: operación % no soportada', p_operacion;
    END IF;

    SELECT ticket.id_ticket,
           ticket.codigo_ticket,
           ticket.descripcion_problema,
           ticket.fecha_creacion,
           ticket.fecha_limite,
           ticket.fecha_resolucion,
           ticket.respuesta_final,
           ticket.calificacion,
           ticket.encargado_interno,
           ticket.origen_sistema,
           estado.nombre_estado,
           cliente.nombre_cliente,
           cliente.identificacion_fiscal,
           area.nombre_area,
           tipo.tipo_requerimiento,
           tipo.categoria_1,
           tipo.categoria_2,
           prioridad.nombre_prioridad,
           prioridad.dias_sla,
           LOWER(solicitante.correo_corporativo) AS solicitante_correo,
           area_solicitante.nombre_area AS area_remite,
           LOWER(asignado.correo_corporativo) AS asignado_correo,
           (SELECT correo.correo
              FROM app.portal_contacto_correo AS correo
             WHERE correo.id_contacto = ticket.id_contacto_portal AND correo.activo
             ORDER BY correo.created_at
             LIMIT 1) AS contacto_correo,
           (SELECT evento.contenido
              FROM helpdesk.fact_ticket_evento AS evento
             WHERE evento.id_ticket = ticket.id_ticket AND evento.tipo_evento = 'RECHAZO'
             ORDER BY evento.fecha_registro DESC
             LIMIT 1) AS motivo_rechazo,
           EXISTS (SELECT 1
                     FROM helpdesk.fact_ticket_evento AS evento
                    WHERE evento.id_ticket = ticket.id_ticket AND evento.tipo_evento = 'REASIGNACION') AS fue_reasignado
    INTO t
    FROM helpdesk.fact_ticket AS ticket
    JOIN helpdesk.dim_estado AS estado ON estado.id_estado = ticket.id_estado
    LEFT JOIN core.dim_cliente_contai AS cliente ON cliente.id_cliente_contai = ticket.id_cliente_contai
    LEFT JOIN core.dim_area AS area ON area.id_area = ticket.id_area_destino
    LEFT JOIN helpdesk.dim_tipo_requerimiento AS tipo ON tipo.id_tipo_req = ticket.id_tipo_req
    LEFT JOIN helpdesk.dim_prioridad AS prioridad ON prioridad.id_prioridad = ticket.id_prioridad
    LEFT JOIN core.dim_personal AS solicitante ON solicitante.id_personal = ticket.id_solicitante
    LEFT JOIN core.dim_area AS area_solicitante ON area_solicitante.id_area = solicitante.id_area
    LEFT JOIN core.dim_personal AS asignado ON asignado.id_personal = ticket.id_asignado
    WHERE ticket.id_ticket = p_id_ticket;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'item_espejo_sharepoint: el ticket % no existe', p_id_ticket;
    END IF;

    IF t.origen_sistema NOT IN ('SISTEMA_INTERNO', 'PORTAL_CLIENTE') THEN
        RAISE EXCEPTION 'item_espejo_sharepoint: el ticket % es de SharePoint; su dueño no es HelpDesk', p_id_ticket;
    END IF;

    v_estado := CASE t.nombre_estado
        WHEN 'CERRADO' THEN 'Cerrado'
        WHEN 'RECHAZADO' THEN 'Cerrado'
        ELSE CASE WHEN t.fue_reasignado THEN 'Reasignado' ELSE 'Abierto' END
    END;

    v_respuesta := CASE t.nombre_estado
        WHEN 'RECHAZADO' THEN 'RECHAZADO: ' || COALESCE(t.motivo_rechazo, 'sin motivo registrado')
        ELSE t.respuesta_final
    END;

    v_item := jsonb_strip_nulls(jsonb_build_object(
        'Estado', v_estado,
        'AsignadoA', t.asignado_correo,
        'Respuesta', v_respuesta,
        'Fecha_Respuesta', to_char(t.fecha_resolucion AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY'),
        'Calificaci_x00f3_n', t.calificacion
    ));

    IF p_operacion = 'CREATE_TICKET' THEN
        v_item := v_item || jsonb_strip_nulls(jsonb_build_object(
            -- En el legacy, Title es el correo de quien radica.
            'Title', COALESCE(t.solicitante_correo, t.contacto_correo),
            'Id_Req', t.codigo_ticket,
            'Requerimiento', t.descripcion_problema,
            'Fecha_Solicitud', to_char(t.fecha_creacion AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY'),
            'Hora_Solicitud', to_char(t.fecha_creacion AT TIME ZONE 'America/Bogota', 'HH24:MI'),
            'Fecha_Max_Respuesta', to_char(t.fecha_limite AT TIME ZONE 'America/Bogota', 'DD/MM/YYYY'),
            'Nit', t.identificacion_fiscal,
            'Cliente', t.nombre_cliente,
            'OData__x00c1_rea_Remite', CASE WHEN t.origen_sistema = 'PORTAL_CLIENTE' THEN 'PORTAL_CLIENTE' ELSE t.area_remite END,
            'OData__x00c1_rea_Destino', t.nombre_area,
            'Tipo_Requerimiento', t.tipo_requerimiento,
            'Categor_x00ed_a1', t.categoria_1,
            'Categor_x00ed_a2', t.categoria_2,
            -- Los tickets de clientes no tienen prioridad: su plazo es fijo, de
            -- 3 días hábiles (tickets.md §5), que es lo que dice «Media».
            'Prioridad', CASE
                WHEN t.nombre_prioridad IS NULL THEN 'Media (3 días)'
                ELSE INITCAP(t.nombre_prioridad) || ' (' || t.dias_sla || ' días)'
            END,
            'Recibe', t.encargado_interno,
            'Reasignado', CASE WHEN t.origen_sistema = 'PORTAL_CLIENTE' THEN 'SI' END
        ));
    END IF;

    RETURN v_item;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."item_espejo_sharepoint"(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION "helpdesk"."espejo_campos"(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."item_espejo_sharepoint"(UUID, TEXT) TO "coraje_etl";
GRANT EXECUTE ON FUNCTION "helpdesk"."espejo_campos"(JSONB) TO "coraje_etl";


-- ---------------------------------------------------------------------
-- 5. Señal de corte: cuánto trabajo sigue entrando por PowerApps
-- ---------------------------------------------------------------------
-- El usuario lo planteó así (28-sep-2026): se desconecta PowerApps cuando ya
-- no haya flujo de trabajo que provenga de allí. Esta vista lo mide por
-- semana, en hora de Bogotá, con tres señales que salen de datos que ya
-- existen:
--   tickets_creados_en_powerapps     tickets legacy nuevos;
--   cambios_en_tickets_legacy        cambios de estado observados en SharePoint;
--   cambios_en_tickets_helpdesk      cambios de PowerApps sobre tickets de
--                                    HelpDesk (aplicados o rechazados).
-- Varias semanas seguidas en cero en las tres es el dato que apoya el cuarto
-- criterio de contexto-canonico.md §2 («SharePoint ha dejado de ser fuente
-- operativa principal»).
CREATE VIEW "helpdesk"."v_actividad_powerapps" AS
WITH creados AS (
    SELECT date_trunc('week', ticket.fecha_creacion AT TIME ZONE 'America/Bogota')::DATE AS semana,
           COUNT(*) AS n
    FROM helpdesk.fact_ticket AS ticket
    WHERE ticket.origen_sistema = 'SHAREPOINT_LEGACY'
    GROUP BY 1
),
legacy AS (
    SELECT date_trunc('week', evento.fecha_registro AT TIME ZONE 'America/Bogota')::DATE AS semana,
           COUNT(*) AS n
    FROM helpdesk.fact_ticket_evento AS evento
    WHERE evento.tipo_evento = 'SINCRONIZACION_LEGACY'
    GROUP BY 1
),
helpdesk_tickets AS (
    SELECT date_trunc('week', divergencia.detectado_at AT TIME ZONE 'America/Bogota')::DATE AS semana,
           COUNT(*) AS n
    FROM helpdesk.sync_divergencia AS divergencia
    GROUP BY 1
)
SELECT semana,
       COALESCE(creados.n, 0) AS tickets_creados_en_powerapps,
       COALESCE(legacy.n, 0) AS cambios_en_tickets_legacy,
       COALESCE(helpdesk_tickets.n, 0) AS cambios_en_tickets_helpdesk
FROM creados
FULL JOIN legacy USING (semana)
FULL JOIN helpdesk_tickets USING (semana);

GRANT SELECT ON "helpdesk"."v_actividad_powerapps" TO "coraje_runtime", "coraje_etl";
