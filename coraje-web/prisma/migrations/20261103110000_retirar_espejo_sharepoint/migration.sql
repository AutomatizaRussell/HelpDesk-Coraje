-- =====================================================================
-- U24 · Retira el espejo de HelpDesk en SharePoint (U9) y su vigilancia
-- =====================================================================
-- Decisión del usuario del 03-nov-2026: PowerApps se desconecta en cuanto
-- HelpDesk quede listo, y el camino HelpDesk -> PostgreSQL -> HelpDeskBd no
-- se va a encender. El espejo nació apagado el 28-sep-2026
-- (20260928120000_espejo_sharepoint) y nunca se encendió, así que ningún
-- ticket de HelpDesk tiene ítem en SharePoint ni divergencia real.
--
-- Lo que se retira:
--   · el trigger que encolaba cada cambio de un ticket de HelpDesk, y las
--     funciones que armaban y comparaban el ítem de HelpDeskBd;
--   · la cola de salida (helpdesk.ticket_sync_outbox), el interruptor
--     (helpdesk.espejo_sharepoint) y el registro de divergencias
--     (helpdesk.sync_divergencia), con su revisión;
--   · las columnas espejo_conciliado* de la referencia legacy;
--   · las señales S1-S4 de la revisión de salud, que vigilaban el envío;
--   · el permiso salud.divergencia.revisar.
--
-- Lo que NO cambia:
--   · la ingesta SharePoint -> PostgreSQL, que sigue viva hasta apagar
--     PowerApps, y helpdesk.ticket_legacy_sharepoint_ref, que la sostiene;
--   · la vista v_actividad_powerapps, señal del corte (contexto-canonico.md
--     §2), que pierde la columna de cambios sobre tickets de HelpDesk: sin
--     espejo, PowerApps no puede tocarlos.
--
-- Datos: la cola, el interruptor y las divergencias son metadatos del envío
-- de tickets de prueba, no tickets ni eventos. Su contenido se comprobó
-- contra la base real antes de publicar (docs/estado/operacion.md, «Retiro
-- del espejo (U24)»).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Encolado: primero el trigger, después sus funciones
-- ---------------------------------------------------------------------
DROP TRIGGER "trg_encolar_espejo_sharepoint" ON "helpdesk"."fact_ticket";
DROP FUNCTION "helpdesk"."encolar_espejo_sharepoint"();
DROP FUNCTION "helpdesk"."item_espejo_sharepoint"(UUID, TEXT);
DROP FUNCTION "helpdesk"."espejo_campos"(JSONB);
DROP FUNCTION "helpdesk"."marcar_divergencia_revisada"(UUID, UUID, TEXT);


-- ---------------------------------------------------------------------
-- 2. Salud sin S1-S4
-- ---------------------------------------------------------------------
-- Idéntica a la de 20260928130000_observabilidad salvo que ya no lee el
-- interruptor, la cola ni las divergencias. CREATE OR REPLACE conserva la
-- firma y los permisos (GRANT a coraje_runtime y coraje_etl).
CREATE OR REPLACE FUNCTION "helpdesk"."salud_hallazgos"()
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
-- S5 · Correos del ticket. FALLIDO de más de 12 h: quien lo envió tuvo
-- media jornada para reenviarlo desde el ticket. PENDIENTE o ENVIANDO de
-- más de 1 h: el envío corre justo después de guardar, así que el proceso
-- se cortó a mitad.
WITH s5_fallido AS (
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


-- ---------------------------------------------------------------------
-- 3. Señal de corte sin la columna de divergencias
-- ---------------------------------------------------------------------
-- Una vista no puede perder columnas con CREATE OR REPLACE: se recrea.
-- Nadie más depende de ella (la consulta operacion.md, a mano).
DROP VIEW "helpdesk"."v_actividad_powerapps";

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
)
SELECT semana,
       COALESCE(creados.n, 0) AS tickets_creados_en_powerapps,
       COALESCE(legacy.n, 0) AS cambios_en_tickets_legacy
FROM creados
FULL JOIN legacy USING (semana);

GRANT SELECT ON "helpdesk"."v_actividad_powerapps" TO "coraje_runtime", "coraje_etl";


-- ---------------------------------------------------------------------
-- 4. Tablas y columnas del espejo
-- ---------------------------------------------------------------------
DROP TABLE "helpdesk"."sync_divergencia";
DROP TABLE "helpdesk"."espejo_sharepoint";
DROP TABLE "helpdesk"."ticket_sync_outbox";

ALTER TABLE "helpdesk"."ticket_legacy_sharepoint_ref"
    DROP COLUMN "espejo_conciliado",
    DROP COLUMN "espejo_conciliado_at";


-- ---------------------------------------------------------------------
-- 5. Permiso de revisar divergencias
-- ---------------------------------------------------------------------
-- La regla antes que la acción: la referencia va de la regla a la acción.
DELETE FROM "app"."permiso_regla" WHERE "codigo_accion" = 'salud.divergencia.revisar';
DELETE FROM "app"."permiso_accion" WHERE "codigo" = 'salud.divergencia.revisar';
