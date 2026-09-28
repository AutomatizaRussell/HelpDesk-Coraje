-- =====================================================================
-- U10 · Observabilidad: lo que hoy puede fallar sin que nadie se entere
-- (docs/specs/observabilidad.md, decisiones O1-O6 del 28-sep-2026)
-- =====================================================================
-- Ningún proceso nuevo en la VPS (CLAUDE.md, economía de recursos). La
-- regla vive aquí; n8n solo la dispara una vez al día y avisa.
--
--   1. helpdesk.salud_hallazgos(): una fila por chequeo que no está en
--      verde. La leen la vista /salud (coraje_runtime) y la revisión diaria
--      (coraje_etl). Solo lee tablas de core, helpdesk y app.
--   2. helpdesk.registrar_revision_salud(): la revisión diaria. Suma a lo
--      anterior la reconciliación con SharePoint (S9), que necesita staging
--      y la lista de ítems de HelpDeskBd que n8n le pasa; guarda el
--      resultado y decide si hay algo que avisar por Teams.
--   3. helpdesk.revision_salud: una fila por revisión. Es la evidencia del
--      antes y el después, y la forma de ver que la revisión dejó de correr.
--   4. Revisión de divergencias rechazadas (S4): quién, cuándo y por qué,
--      escrito solo por helpdesk.marcar_divergencia_revisada().
--
-- Qué avisa por Teams (decisión del usuario, 28-sep-2026: «lo mínimo, solo
-- lo más grave, inmediato y urgente»): solo severidad CRITICO, y solo
-- cuando el chequeo aparece o empeora respecto de la revisión anterior. Un
-- problema que sigue igual no se repite cada día; se sigue viendo en /salud.
--
-- Severidades:
--   CRITICO   algo dejó de funcionar para personas que están trabajando y
--             no se arregla solo. Teams, una vez.
--   ATENCION  hay que mirarlo, pero no es urgente o se arregla solo. /salud.
--   AVISO     dato de contexto, no un defecto. /salud.
--
-- Por qué dos funciones y no una: coraje_migrator, dueño de estas
-- funciones, no tiene acceso a staging (operacion.md, F6), y coraje_etl no
-- lo tiene a app, donde viven la autorización de correo y la auditoría del
-- portal. salud_hallazgos() es SECURITY DEFINER y solo ve lo del dueño;
-- registrar_revision_salud() corre con los permisos de quien la llama
-- (coraje_etl) y es la única que toca staging.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Revisión de divergencias rechazadas (S4)
-- ---------------------------------------------------------------------
-- Hasta U9 el aviso de Teams de la transformación 08 salía una vez y se
-- perdía: la tabla no tenía cómo decir «ya lo miré». Las tres columnas se
-- llenan juntas o ninguna.
ALTER TABLE "helpdesk"."sync_divergencia"
    ADD COLUMN "revisada_at" TIMESTAMPTZ(6),
    ADD COLUMN "revisada_por" UUID,
    ADD COLUMN "motivo_revision" VARCHAR(500),
    ADD CONSTRAINT "chk_sync_divergencia_revision" CHECK (
        ("revisada_at" IS NULL) = ("revisada_por" IS NULL)
        AND ("revisada_at" IS NULL) = ("motivo_revision" IS NULL)
    ),
    ADD CONSTRAINT "sync_divergencia_revisada_por_fkey"
        FOREIGN KEY ("revisada_por") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Lo que la vista y la revisión buscan: rechazadas sin revisar.
CREATE INDEX "ix_sync_divergencia_sin_revisar" ON "helpdesk"."sync_divergencia" ("detectado_at")
    WHERE "resultado" = 'RECHAZADO' AND "revisada_at" IS NULL;

-- La divergencia es evidencia: la ingesta la inserta y nadie la edita. U9
-- lo declaró con GRANT, pero ALTER DEFAULT PRIVILEGES (operacion.md, F6)
-- concede DML completo a los dos roles en cada tabla nueva de
-- coraje_migrator, así que el GRANT no bastaba. Aquí se retira lo que
-- sobra; la revisión entra solo por la función de abajo.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "helpdesk"."sync_divergencia" FROM "coraje_runtime";
REVOKE UPDATE, DELETE, TRUNCATE ON "helpdesk"."sync_divergencia" FROM "coraje_etl";

-- Marcar revisada es un acto con autor y motivo, y se hace una sola vez.
-- Quién puede hacerlo lo decide la aplicación con salud.divergencia.revisar
-- antes de llamar (src/server/salud/salud-commands.ts), igual que
-- redirigir_ticket confía en la autorización de ticket.redirigir. La
-- función garantiza lo que no depende del rol: solo rechazadas, solo sin
-- revisar, motivo obligatorio, persona activa.
--
-- Devuelve FALSE si la divergencia no existe, no es RECHAZADO o ya estaba
-- revisada: dos personas que la marcan a la vez no se pisan.
CREATE FUNCTION "helpdesk"."marcar_divergencia_revisada"(
    p_id_divergencia UUID,
    p_id_personal UUID,
    p_motivo TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_motivo TEXT := NULLIF(BTRIM(p_motivo), '');
BEGIN
    IF v_motivo IS NULL OR char_length(v_motivo) < 5 OR char_length(v_motivo) > 500 THEN
        RAISE EXCEPTION 'marcar_divergencia_revisada: el motivo debe tener entre 5 y 500 caracteres';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM core.dim_personal AS persona
        WHERE persona.id_personal = p_id_personal AND persona.estado_activo
    ) THEN
        RAISE EXCEPTION 'marcar_divergencia_revisada: la persona % no está activa', p_id_personal;
    END IF;

    UPDATE helpdesk.sync_divergencia
    SET revisada_at = NOW(),
        revisada_por = p_id_personal,
        motivo_revision = v_motivo
    WHERE id = p_id_divergencia
      AND resultado = 'RECHAZADO'
      AND revisada_at IS NULL;

    RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."marcar_divergencia_revisada"(UUID, UUID, TEXT) FROM PUBLIC, "coraje_etl";
GRANT EXECUTE ON FUNCTION "helpdesk"."marcar_divergencia_revisada"(UUID, UUID, TEXT) TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. Registro de revisiones
-- ---------------------------------------------------------------------
-- Una fila por revisión: una al día. hallazgos guarda las filas de la
-- revisión tal como salieron (senal, chequeo, severidad, cantidad, detalle,
-- ejemplo), así que la de ayer es la referencia para saber si hoy algo es
-- nuevo, y el guion de cierre de U10 lee aquí el antes y el después.
--
-- Los conteos de la reconciliación se guardan también cuando está en verde:
-- «0 faltan» sin el total no demuestra nada.
CREATE TABLE "helpdesk"."revision_salud" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ejecutada_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "origen" VARCHAR(20) NOT NULL,
    "hallazgos" JSONB NOT NULL,
    "criticos_nuevos" JSONB NOT NULL DEFAULT '[]',
    "items_sharepoint" INTEGER,
    "items_staging" INTEGER,
    "items_con_ticket" INTEGER,

    CONSTRAINT "revision_salud_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_revision_salud_origen" CHECK ("origen" IN ('N8N', 'MANUAL')),
    CONSTRAINT "chk_revision_salud_hallazgos" CHECK (jsonb_typeof("hallazgos") = 'array'),
    CONSTRAINT "chk_revision_salud_criticos" CHECK (jsonb_typeof("criticos_nuevos") = 'array')
);

CREATE INDEX "ix_revision_salud_ejecutada" ON "helpdesk"."revision_salud" ("ejecutada_at" DESC);

-- La revisión diaria escribe (coraje_etl); la vista lee (coraje_runtime).
-- Nadie la edita ni la borra: es evidencia, y crece una fila al día.
REVOKE ALL ON "helpdesk"."revision_salud" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT ON "helpdesk"."revision_salud" TO "coraje_runtime";
GRANT SELECT, INSERT ON "helpdesk"."revision_salud" TO "coraje_etl";


-- ---------------------------------------------------------------------
-- 3. Índices para lo que filtran los chequeos
-- ---------------------------------------------------------------------
-- Parciales: cubren solo las filas que un chequeo puede encontrar, que en
-- una base sana son casi ninguna. El outbox ya tiene (status, created_at).
CREATE INDEX "ix_ticket_notificacion_no_enviada" ON "helpdesk"."ticket_notificacion" ("updated_at")
    WHERE "estado" <> 'ENVIADO';

CREATE INDEX "ix_portal_auditoria_fallo" ON "app"."portal_auditoria" ("created_at")
    WHERE "resultado" = 'FALLO';


-- ---------------------------------------------------------------------
-- 4. Los chequeos que solo necesitan la base de HelpDesk
-- ---------------------------------------------------------------------
-- Una fila por chequeo que no está en verde. En verde no devuelve nada.
--   senal     S1…S9 del inventario (plan-ejecucion.md, U10), o REVISION;
--   chequeo   identificador estable: la revisión siguiente compara por él;
--   cantidad  cuántas filas lo incumplen;
--   detalle   frase para una persona, sin correos de clientes ni secretos;
--   ejemplo   un código de ticket (o equivalente) para empezar a mirar.
--
-- Los umbrales son las decisiones O2 del 28-sep-2026 y viven solo aquí:
-- la vista los muestra, no los repite. Por qué cada uno, en
-- docs/specs/observabilidad.md §3.
--
-- Una prueba de contrato (src/server/salud/salud-contract.test.mts) cruza
-- el inventario con esta función: ninguna señal queda sin chequeo.
CREATE FUNCTION "helpdesk"."salud_hallazgos"()
RETURNS TABLE (
    senal TEXT,
    chequeo TEXT,
    severidad TEXT,
    cantidad INTEGER,
    detalle TEXT,
    ejemplo TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
WITH espejo AS (
    SELECT activo_desde
    FROM helpdesk.espejo_sharepoint
    WHERE activo_desde IS NOT NULL
),
-- Envíos del espejo que cuentan: encolados con el espejo encendido (lo
-- anterior no se envía nunca, a propósito, U9) y no sustituidos por un
-- envío posterior ya hecho de la misma operación. Un FAILED viejo cuyo
-- ticket ya se reflejó con otro envío no es un problema.
envio AS (
    SELECT o.*, f.codigo_ticket
    FROM helpdesk.ticket_sync_outbox AS o
    CROSS JOIN espejo
    JOIN helpdesk.fact_ticket AS f ON f.id_ticket = o.id_ticket
    WHERE o.target_system = 'SHAREPOINT'
      AND o.created_at >= espejo.activo_desde
      AND o.status <> 'SENT'
      AND NOT EXISTS (
            SELECT 1 FROM helpdesk.ticket_sync_outbox AS despues
            WHERE despues.id_ticket = o.id_ticket
              AND despues.operation = o.operation
              AND despues.status = 'SENT'
              AND despues.created_at > o.created_at
      )
),
-- S1 · El espejo se detuvo. Normal: segundos. Un envío pendiente o fallido
-- (no por conflicto) de más de 2 h, o uno «en proceso» de más de 1 h (la
-- salida recupera sola los de 15 min), significa que ni el aviso inmediato
-- ni el reintento funcionaron.
s1 AS (
    SELECT
        COUNT(*)::INTEGER AS n,
        COUNT(*) FILTER (WHERE status = 'FAILED')::INTEGER AS fallidos,
        (ARRAY_AGG(codigo_ticket ORDER BY created_at))[1] AS ejemplo
    FROM envio
    WHERE (status IN ('PENDING', 'FAILED')
           AND COALESCE(last_error, '') NOT LIKE 'CONFLICTO_POWERAPPS%'
           AND created_at < NOW() - INTERVAL '2 hours')
       OR (status = 'PROCESSING' AND updated_at < NOW() - INTERVAL '1 hour')
),
-- S2 · Conflicto con PowerApps sin resolver. Normal: lo resuelve la
-- siguiente ingesta (≤ 12 h). Más de 24 h son dos ingestas sin resolverlo.
s2 AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(codigo_ticket ORDER BY updated_at))[1] AS ejemplo
    FROM envio
    WHERE status = 'FAILED'
      AND last_error LIKE 'CONFLICTO_POWERAPPS%'
      AND updated_at < NOW() - INTERVAL '24 hours'
),
-- S3 · La creación se perdió: un ticket de HelpDesk con envíos desde que
-- se encendió el espejo, sin ítem en SharePoint, y sin nada en la cola que
-- lo explique (lo que está pendiente o fallido ya lo cuentan S1 y S2).
s3 AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(f.codigo_ticket ORDER BY f.fecha_creacion))[1] AS ejemplo
    FROM helpdesk.fact_ticket AS f
    CROSS JOIN espejo
    WHERE f.origen_sistema IN ('SISTEMA_INTERNO', 'PORTAL_CLIENTE')
      AND f.id_area_destino IS NOT NULL
      AND f.id_tipo_req IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM helpdesk.ticket_legacy_sharepoint_ref AS r WHERE r.id_ticket = f.id_ticket)
      AND EXISTS (
            SELECT 1 FROM helpdesk.ticket_sync_outbox AS o
            WHERE o.id_ticket = f.id_ticket
              AND o.created_at >= espejo.activo_desde
              AND o.created_at < NOW() - INTERVAL '2 hours'
      )
      AND NOT EXISTS (SELECT 1 FROM envio WHERE envio.id_ticket = f.id_ticket)
),
-- S4 · Cambios de PowerApps rechazados que nadie ha revisado. Sin umbral:
-- dejan de contar cuando alguien los marca revisados en /salud.
s4 AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(f.codigo_ticket ORDER BY d.detectado_at))[1] AS ejemplo
    FROM helpdesk.sync_divergencia AS d
    JOIN helpdesk.fact_ticket AS f ON f.id_ticket = d.id_ticket
    WHERE d.resultado = 'RECHAZADO' AND d.revisada_at IS NULL
),
-- S5 · Correos del ticket. FALLIDO de más de 12 h: quien lo envió tuvo
-- media jornada para reenviarlo desde el ticket. PENDIENTE o ENVIANDO de
-- más de 1 h: el envío corre justo después de guardar, así que el proceso
-- se cortó a mitad.
s5_fallido AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(f.codigo_ticket ORDER BY correo.updated_at))[1] AS ejemplo
    FROM helpdesk.ticket_notificacion AS correo
    JOIN helpdesk.fact_ticket AS f ON f.id_ticket = correo.id_ticket
    WHERE correo.estado = 'FALLIDO' AND correo.updated_at < NOW() - INTERVAL '12 hours'
),
s5_atascado AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(f.codigo_ticket ORDER BY correo.updated_at))[1] AS ejemplo
    FROM helpdesk.ticket_notificacion AS correo
    JOIN helpdesk.fact_ticket AS f ON f.id_ticket = correo.id_ticket
    WHERE correo.estado IN ('PENDIENTE', 'ENVIANDO') AND correo.updated_at < NOW() - INTERVAL '1 hour'
),
-- S6 · Personas con rol que no pueden enviar correo. Revocada: todos sus
-- correos fallan hasta que vuelvan a entrar (F14). Sin autorización: nunca
-- entraron después de U7; es contexto, no un defecto.
personal_con_rol AS (
    SELECT p.id_personal, p.correo_corporativo
    FROM core.dim_personal AS p
    WHERE p.estado_activo AND p.rol_aplicacion IS NOT NULL
),
s6_revocada AS (
    SELECT COUNT(*)::INTEGER AS n, MIN(p.correo_corporativo) AS ejemplo
    FROM personal_con_rol AS p
    JOIN app.employee_graph_grant AS g ON g.id_personal = p.id_personal
    WHERE g.revoked_at IS NOT NULL
),
s6_sin AS (
    SELECT COUNT(*)::INTEGER AS n, MIN(p.correo_corporativo) AS ejemplo
    FROM personal_con_rol AS p
    WHERE NOT EXISTS (SELECT 1 FROM app.employee_graph_grant AS g WHERE g.id_personal = p.id_personal)
),
-- S7 · El portal no pudo enviar una invitación o un código en el último
-- día. Con una revisión diaria, cada fallo cuenta exactamente una vez. Lo
-- más probable es que la credencial del buzón caducara: ningún cliente
-- nuevo entra. Sin correos en el detalle: esto va a Teams.
s7 AS (
    SELECT COUNT(*)::INTEGER AS n, MIN(a.evento) AS ejemplo
    FROM app.portal_auditoria AS a
    WHERE a.resultado = 'FALLO'
      AND a.evento IN ('INVITACION_ENVIADA', 'CODIGO_ENVIADO')
      AND a.created_at > NOW() - INTERVAL '24 hours'
),
-- S8 · Salud de la ingesta, lo que hasta U10 se miraba a mano.
-- Sin inicio: la 06 y la 07 son sentencias distintas, así que un ticket
-- recién insertado pasa unos segundos sin evento; la hora de margen evita
-- contarlo.
s8_sin_inicio AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(f.codigo_ticket ORDER BY f.fecha_creacion))[1] AS ejemplo
    FROM helpdesk.fact_ticket AS f
    WHERE f.origen_sistema = 'SHAREPOINT_LEGACY'
      AND f.ultima_actualizacion < NOW() - INTERVAL '1 hour'
      AND NOT EXISTS (
            SELECT 1 FROM helpdesk.fact_ticket_evento AS ev
            WHERE ev.id_ticket = f.id_ticket
              AND ev.tipo_evento IN ('CREACION', 'MIGRACION_LEGACY')
      )
),
-- Proyección desfasada: el estado del ticket no es el del último evento
-- que cambió estado. El escritor único escribe los dos en la misma
-- transacción (tickets.md §3), así que no debería ocurrir nunca: si
-- aparece, algo escribió id_estado por fuera.
ultimo_estado AS (
    SELECT DISTINCT ON (ev.id_ticket) ev.id_ticket, ev.id_estado_nuevo
    FROM helpdesk.fact_ticket_evento AS ev
    WHERE ev.id_estado_nuevo IS NOT NULL
    ORDER BY ev.id_ticket, ev.fecha_registro DESC
),
s8_desfasada AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(f.codigo_ticket ORDER BY f.fecha_creacion))[1] AS ejemplo
    FROM helpdesk.fact_ticket AS f
    JOIN ultimo_estado AS u ON u.id_ticket = f.id_ticket
    WHERE u.id_estado_nuevo <> f.id_estado
),
-- Sin tipo: tickets legacy que la regla de mapeo no resolvió
-- (staging.helpdesk_legacy_tipo_req_unmapped los detalla). El baseline ya
-- tenía algunos: es contexto, no urgencia.
s8_sin_tipo AS (
    SELECT COUNT(*)::INTEGER AS n, (ARRAY_AGG(f.codigo_ticket ORDER BY f.fecha_creacion))[1] AS ejemplo
    FROM helpdesk.fact_ticket AS f
    WHERE f.origen_sistema = 'SHAREPOINT_LEGACY' AND f.id_tipo_req IS NULL
),
-- La propia revisión: si la última tiene más de 26 h, la diaria no corrió
-- (n8n caído o el workflow apagado). Es lo único que avisa de que el aviso
-- falta, y solo se ve en /salud.
revision AS (
    SELECT MAX(r.ejecutada_at) AS ultima FROM helpdesk.revision_salud AS r
)
SELECT h.senal, h.chequeo, h.severidad, h.cantidad, h.detalle, h.ejemplo
FROM (
    SELECT 'S1', 'espejo_detenido', 'CRITICO', s1.n,
           format('%s envío(s) a PowerApps sin salir desde hace más de 2 h (%s de ellos marcados como fallidos). PowerApps muestra datos viejos de esos tickets.', s1.n, s1.fallidos),
           s1.ejemplo
    FROM s1
    UNION ALL
    SELECT 'S2', 'conflicto_sin_resolver', 'ATENCION', s2.n,
           format('%s envío(s) detenidos por un cambio hecho en PowerApps, sin resolver tras dos ingestas.', s2.n),
           s2.ejemplo
    FROM s2
    UNION ALL
    SELECT 'S3', 'creacion_perdida', 'CRITICO', s3.n,
           format('%s ticket(s) de HelpDesk sin ítem en PowerApps y sin envío pendiente que lo explique.', s3.n),
           s3.ejemplo
    FROM s3
    UNION ALL
    SELECT 'S4', 'divergencia_sin_revisar', 'ATENCION', s4.n,
           format('%s cambio(s) hechos en PowerApps que HelpDesk rechazó y nadie ha revisado.', s4.n),
           s4.ejemplo
    FROM s4
    UNION ALL
    SELECT 'S5', 'correo_fallido', 'ATENCION', s5_fallido.n,
           format('%s correo(s) del ticket fallidos hace más de 12 h y sin reenviar.', s5_fallido.n),
           s5_fallido.ejemplo
    FROM s5_fallido
    UNION ALL
    SELECT 'S5', 'correo_atascado', 'ATENCION', s5_atascado.n,
           format('%s correo(s) del ticket a medio enviar desde hace más de 1 h.', s5_atascado.n),
           s5_atascado.ejemplo
    FROM s5_atascado
    UNION ALL
    SELECT 'S6', 'autorizacion_revocada', 'ATENCION', s6_revocada.n,
           format('%s persona(s) con rol cuya autorización de correo revocó Microsoft: sus correos fallan hasta que vuelvan a entrar.', s6_revocada.n),
           s6_revocada.ejemplo
    FROM s6_revocada
    UNION ALL
    SELECT 'S6', 'sin_autorizacion', 'AVISO', s6_sin.n,
           format('%s persona(s) con rol que no han entrado desde U7: no pueden enviar correo hasta que entren.', s6_sin.n),
           s6_sin.ejemplo
    FROM s6_sin
    UNION ALL
    SELECT 'S7', 'envio_portal_fallido', 'CRITICO', s7.n,
           format('%s invitación(es) o código(s) del portal no salieron en el último día. Revisar la credencial del buzón en n8n.', s7.n),
           s7.ejemplo
    FROM s7
    UNION ALL
    SELECT 'S8', 'legacy_sin_inicio', 'ATENCION', s8_sin_inicio.n,
           format('%s ticket(s) de PowerApps sin evento de inicio.', s8_sin_inicio.n),
           s8_sin_inicio.ejemplo
    FROM s8_sin_inicio
    UNION ALL
    SELECT 'S8', 'proyeccion_desfasada', 'ATENCION', s8_desfasada.n,
           format('%s ticket(s) cuyo estado no coincide con su último evento.', s8_desfasada.n),
           s8_desfasada.ejemplo
    FROM s8_desfasada
    UNION ALL
    SELECT 'S8', 'legacy_sin_tipo', 'AVISO', s8_sin_tipo.n,
           format('%s ticket(s) de PowerApps sin tipo de requerimiento reconocido.', s8_sin_tipo.n),
           s8_sin_tipo.ejemplo
    FROM s8_sin_tipo
    UNION ALL
    SELECT 'REVISION', 'revision_ausente', 'ATENCION', 1,
           CASE WHEN revision.ultima IS NULL
                THEN 'La revisión diaria no se ha ejecutado nunca.'
                ELSE format('La última revisión diaria fue hace %s h: la de hoy no corrió.',
                            (EXTRACT(EPOCH FROM NOW() - revision.ultima) / 3600)::INTEGER)
           END,
           NULL
    FROM revision
    WHERE revision.ultima IS NULL OR revision.ultima < NOW() - INTERVAL '26 hours'
) AS h (senal, chequeo, severidad, cantidad, detalle, ejemplo)
WHERE h.cantidad > 0;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."salud_hallazgos"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "helpdesk"."salud_hallazgos"() TO "coraje_runtime", "coraje_etl";


-- ---------------------------------------------------------------------
-- 5. La revisión diaria, con la reconciliación con SharePoint (S9)
-- ---------------------------------------------------------------------
-- La llama n8n (HELPDESK - Salud diaria V1) una vez al día, como
-- coraje_etl, con la lista de ítems de HelpDeskBd: [{"Id": 1, "Created":
-- "2026-09-28T12:00:00Z"}, …]. Una sola petición a SharePoint; n8n no
-- compara nada, lo compara la base.
--
-- Por qué la lista de ids y no ItemCount: el total dice «faltan 3»; los ids
-- dicen cuáles. Con la lista, la base encuentra:
--   items_sin_ingerir     en SharePoint y no en staging: la ingesta perdió
--                         algo. CRITICO. Se toleran los creados después de
--                         lo último que la ingesta vio (su cursor): son el
--                         retraso normal de hasta 12 h, no una pérdida;
--   items_sin_ticket      en staging y sin ticket: la 06 lo descartó (sin
--                         solicitante ni cliente reconocido). ATENCION;
--   items_borrados        en staging y ya no en SharePoint: alguien los
--                         borró en PowerApps (p. ej. los ítems de prueba).
--                         AVISO.
--
-- SECURITY INVOKER a propósito: toca staging, que solo coraje_etl ve. Por
-- eso es plpgsql: su cuerpo no se analiza al crearla, cuando corre como
-- coraje_migrator, que no ve staging.
--
-- Qué se avisa (notificar): solo los chequeos CRITICO cuya cantidad subió
-- respecto de la revisión anterior, o que no estaban. El mensaje nombra
-- todos los críticos abiertos, marcando los nuevos, para que quien lo lea
-- tenga el cuadro completo sin abrir nada.
CREATE FUNCTION "helpdesk"."registrar_revision_salud"(
    p_items_sharepoint JSONB,
    p_origen TEXT DEFAULT 'N8N'
)
RETURNS TABLE (
    id_revision UUID,
    notificar BOOLEAN,
    mensaje TEXT,
    hallazgos JSONB
)
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $function$
-- Las columnas de salida (hallazgos, mensaje…) son variables en plpgsql:
-- ante un nombre igual, manda la columna de la tabla.
#variable_conflict use_column
DECLARE
    v_hallazgos JSONB;
    v_anterior JSONB;
    v_nuevos JSONB;
    v_cursor TIMESTAMPTZ;
    v_items_sharepoint INTEGER;
    v_items_staging INTEGER;
    v_items_con_ticket INTEGER;
    v_sin_ingerir INTEGER;
    v_sin_ingerir_ids TEXT;
    v_sin_ticket INTEGER;
    v_sin_ticket_ids TEXT;
    v_borrados INTEGER;
    v_borrados_ids TEXT;
    v_mensaje TEXT;
    v_id UUID;
BEGIN
    -- La revisión anterior, antes de insertar la nueva.
    SELECT r.hallazgos INTO v_anterior
    FROM helpdesk.revision_salud AS r
    ORDER BY r.ejecutada_at DESC
    LIMIT 1;

    SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY h.senal, h.chequeo), '[]'::JSONB)
    INTO v_hallazgos
    FROM helpdesk.salud_hallazgos() AS h;

    SELECT COUNT(*)::INTEGER,
           COUNT(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM helpdesk.ticket_legacy_sharepoint_ref AS r WHERE r.sp_id = s.sp_id
           ))::INTEGER
    INTO v_items_staging, v_items_con_ticket
    FROM staging.sp_helpdesk_raw AS s;

    IF p_items_sharepoint IS NULL OR jsonb_typeof(p_items_sharepoint) <> 'array' THEN
        v_hallazgos := v_hallazgos || jsonb_build_array(jsonb_build_object(
            'senal', 'S9', 'chequeo', 'reconciliacion_sin_datos', 'severidad', 'ATENCION', 'cantidad', 1,
            'detalle', 'La revisión no recibió la lista de ítems de HelpDeskBd: no se pudo reconciliar.',
            'ejemplo', NULL));
    ELSE
        SELECT c.last_success_modified_at INTO v_cursor
        FROM staging.sp_incremental_sync_cursor AS c
        WHERE c.sync_key = 'helpdesk_bd';

        -- Sin cursor, la ingesta nunca corrió y todo saldría «sin ingerir»:
        -- no es una pérdida, así que no se cuenta nada. items_staging = 0
        -- en la fila de la revisión lo deja a la vista.
        v_cursor := COALESCE(v_cursor, '-infinity'::TIMESTAMPTZ);

        WITH sp AS (
            SELECT DISTINCT x."Id" AS sp_id, x."Created" AS creado
            FROM jsonb_to_recordset(p_items_sharepoint) AS x ("Id" INTEGER, "Created" TIMESTAMPTZ)
            WHERE x."Id" IS NOT NULL
        ),
        sin_ingerir AS (
            SELECT sp.sp_id FROM sp
            WHERE sp.creado < v_cursor
              AND NOT EXISTS (SELECT 1 FROM staging.sp_helpdesk_raw AS s WHERE s.sp_id = sp.sp_id)
        ),
        borrados AS (
            SELECT s.sp_id FROM staging.sp_helpdesk_raw AS s
            WHERE NOT EXISTS (SELECT 1 FROM sp WHERE sp.sp_id = s.sp_id)
        ),
        sin_ticket AS (
            SELECT s.sp_id FROM staging.sp_helpdesk_raw AS s
            WHERE NOT EXISTS (SELECT 1 FROM helpdesk.ticket_legacy_sharepoint_ref AS r WHERE r.sp_id = s.sp_id)
              AND NOT EXISTS (SELECT 1 FROM borrados AS b WHERE b.sp_id = s.sp_id)
        )
        SELECT
            (SELECT COUNT(*)::INTEGER FROM sp),
            (SELECT COUNT(*)::INTEGER FROM sin_ingerir),
            (SELECT string_agg(t.sp_id::TEXT, ', ') FROM (SELECT sp_id FROM sin_ingerir ORDER BY sp_id LIMIT 10) AS t),
            (SELECT COUNT(*)::INTEGER FROM sin_ticket),
            (SELECT string_agg(t.sp_id::TEXT, ', ') FROM (SELECT sp_id FROM sin_ticket ORDER BY sp_id LIMIT 10) AS t),
            (SELECT COUNT(*)::INTEGER FROM borrados),
            (SELECT string_agg(t.sp_id::TEXT, ', ') FROM (SELECT sp_id FROM borrados ORDER BY sp_id LIMIT 10) AS t)
        INTO v_items_sharepoint, v_sin_ingerir, v_sin_ingerir_ids, v_sin_ticket, v_sin_ticket_ids, v_borrados, v_borrados_ids;

        IF v_sin_ingerir > 0 THEN
            v_hallazgos := v_hallazgos || jsonb_build_array(jsonb_build_object(
                'senal', 'S9', 'chequeo', 'items_sin_ingerir', 'severidad', 'CRITICO', 'cantidad', v_sin_ingerir,
                'detalle', format('%s ítem(s) de HelpDeskBd que la ingesta no trajo (ítems %s).', v_sin_ingerir, v_sin_ingerir_ids),
                'ejemplo', split_part(v_sin_ingerir_ids, ',', 1)));
        END IF;
        IF v_sin_ticket > 0 THEN
            v_hallazgos := v_hallazgos || jsonb_build_array(jsonb_build_object(
                'senal', 'S9', 'chequeo', 'items_sin_ticket', 'severidad', 'ATENCION', 'cantidad', v_sin_ticket,
                'detalle', format('%s ítem(s) de HelpDeskBd sin ticket en HelpDesk: la ingesta no reconoció a su solicitante ni a su cliente (ítems %s).', v_sin_ticket, v_sin_ticket_ids),
                'ejemplo', split_part(v_sin_ticket_ids, ',', 1)));
        END IF;
        IF v_borrados > 0 THEN
            v_hallazgos := v_hallazgos || jsonb_build_array(jsonb_build_object(
                'senal', 'S9', 'chequeo', 'items_borrados', 'severidad', 'AVISO', 'cantidad', v_borrados,
                'detalle', format('%s ítem(s) borrados en PowerApps que HelpDesk conserva (ítems %s).', v_borrados, v_borrados_ids),
                'ejemplo', split_part(v_borrados_ids, ',', 1)));
        END IF;
    END IF;

    -- Críticos nuevos o que empeoraron respecto de la revisión anterior.
    SELECT COALESCE(jsonb_agg(h.valor), '[]'::JSONB)
    INTO v_nuevos
    FROM jsonb_array_elements(v_hallazgos) AS h (valor)
    WHERE h.valor->>'severidad' = 'CRITICO'
      AND (h.valor->>'cantidad')::INTEGER > COALESCE((
            SELECT MAX((a.valor->>'cantidad')::INTEGER)
            FROM jsonb_array_elements(COALESCE(v_anterior, '[]'::JSONB)) AS a (valor)
            WHERE a.valor->>'chequeo' = h.valor->>'chequeo'
      ), 0);

    IF jsonb_array_length(v_nuevos) > 0 THEN
        SELECT 'SALUD DIARIA DE HELPDESK, no error de ejecución. '
               || string_agg(
                    format('%s%s · %s%s',
                           CASE WHEN EXISTS (
                               SELECT 1 FROM jsonb_array_elements(v_nuevos) AS n (valor)
                               WHERE n.valor->>'chequeo' = h.valor->>'chequeo'
                           ) THEN '[NUEVO] ' ELSE '' END,
                           h.valor->>'senal',
                           h.valor->>'detalle',
                           CASE WHEN h.valor->>'ejemplo' IS NULL THEN '' ELSE format(' Ej.: %s.', h.valor->>'ejemplo') END),
                    ' | ' ORDER BY h.valor->>'senal')
               || ' Detalle y el resto de avisos: HelpDesk › Salud.'
        INTO v_mensaje
        FROM jsonb_array_elements(v_hallazgos) AS h (valor)
        WHERE h.valor->>'severidad' = 'CRITICO';
    END IF;

    INSERT INTO helpdesk.revision_salud (
        origen, hallazgos, criticos_nuevos, items_sharepoint, items_staging, items_con_ticket
    )
    VALUES (
        p_origen, v_hallazgos, v_nuevos, v_items_sharepoint, v_items_staging, v_items_con_ticket
    )
    RETURNING revision_salud.id INTO v_id;

    RETURN QUERY SELECT v_id, jsonb_array_length(v_nuevos) > 0, v_mensaje, v_hallazgos;
END;
$function$;

REVOKE ALL ON FUNCTION "helpdesk"."registrar_revision_salud"(JSONB, TEXT) FROM PUBLIC, "coraje_runtime";
GRANT EXECUTE ON FUNCTION "helpdesk"."registrar_revision_salud"(JSONB, TEXT) TO "coraje_etl";


-- ---------------------------------------------------------------------
-- 6. Catálogo de permisos (permisos.md §3)
-- ---------------------------------------------------------------------
-- Dos acciones y no una: mirar la salud no es lo mismo que dar por
-- atendida una divergencia, aunque en la v1 las tenga el mismo rol.
INSERT INTO "app"."permiso_accion" ("codigo", "nombre", "descripcion") VALUES
    ('salud.consultar', 'Consultar la salud de HelpDesk',
     'Ver la revisión de salud: envíos a PowerApps, correos, ingesta y reconciliación con SharePoint.'),
    ('salud.divergencia.revisar', 'Revisar divergencias con PowerApps',
     'Marcar como revisado, con motivo, un cambio hecho en PowerApps que HelpDesk rechazó.');

-- TOTAL: no se evalúa sobre un ticket. Significa «toda la aplicación».
INSERT INTO "app"."permiso_regla" ("rol", "codigo_accion", "alcance") VALUES
    ('ADMIN', 'salud.consultar', 'TOTAL'),
    ('ADMIN', 'salud.divergencia.revisar', 'TOTAL');
