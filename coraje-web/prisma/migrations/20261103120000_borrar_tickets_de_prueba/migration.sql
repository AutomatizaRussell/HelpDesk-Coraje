-- =====================================================================
-- U25 · Borra los tickets creados desde HelpDesk antes de salir a uso real
-- =====================================================================
-- Decisión del usuario del 03-nov-2026: todo ticket nacido en HelpDesk
-- (SISTEMA_INTERNO, o PORTAL_CLIENTE del portal ya desconectado) es una
-- prueba. Ninguno es trabajo real, y dejarlos mezclaría pruebas con los
-- primeros tickets de verdad en la bandeja, los avisos y los conteos.
--
-- Alcance: SOLO origen_sistema <> 'SHAREPOINT_LEGACY'. Los tickets de
-- PowerApps (datos reales migrados, CLAUDE.md) no se tocan. Va como
-- migración y no como comando a mano: queda versionada, corre una sola vez
-- y no necesita a nadie dentro de la VPS.
--
-- Orden: todas las referencias a fact_ticket y fact_ticket_evento son
-- ON DELETE RESTRICT, así que se borra de las hojas hacia el ticket. La
-- referencia legacy (CASCADE) no tiene filas de estos tickets: el espejo
-- nunca se encendió (U24). Corre como coraje_migrator, dueño de las tablas;
-- los REVOKE de DELETE de 20260925180000 son para coraje_runtime y
-- coraje_etl, y siguen vigentes.
--
-- Los contadores de codigo_ticket no se reajustan: los códigos borrados no
-- se reutilizan, igual que los huecos de 20260924120000.
-- =====================================================================

DO $borrar$
DECLARE
    v_tickets INTEGER;
    v_eventos INTEGER;
    v_legacy_antes INTEGER;
BEGIN
    -- Sin tabla temporal: no depende de cómo agrupe Prisma las sentencias en
    -- transacciones. Todo el bloque es una sola sentencia.
    SELECT COUNT(*) INTO v_tickets FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY';
    SELECT COUNT(*) INTO v_legacy_antes FROM "helpdesk"."fact_ticket" WHERE origen_sistema = 'SHAREPOINT_LEGACY';

    DELETE FROM "helpdesk"."ticket_aviso" WHERE id_ticket IN (SELECT id_ticket FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY');
    DELETE FROM "helpdesk"."ticket_notificacion" WHERE id_ticket IN (SELECT id_ticket FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY');
    DELETE FROM "helpdesk"."ticket_validacion" WHERE id_ticket IN (SELECT id_ticket FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY');
    DELETE FROM "helpdesk"."ticket_observador" WHERE id_ticket IN (SELECT id_ticket FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY');
    DELETE FROM "helpdesk"."ticket_legacy_sharepoint_ref" WHERE id_ticket IN (SELECT id_ticket FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY');
    DELETE FROM "helpdesk"."fact_ticket_evento" WHERE id_ticket IN (SELECT id_ticket FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY');
    GET DIAGNOSTICS v_eventos = ROW_COUNT;
    DELETE FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY';

    -- Comprobaciones: no queda ninguno de HelpDesk y los de PowerApps siguen
    -- todos. Si algo no cuadra, la excepción revierte la migración entera.
    IF EXISTS (SELECT 1 FROM "helpdesk"."fact_ticket" WHERE origen_sistema <> 'SHAREPOINT_LEGACY') THEN
        RAISE EXCEPTION 'borrar_tickets_de_prueba: quedaron tickets de HelpDesk sin borrar';
    END IF;
    IF (SELECT COUNT(*) FROM "helpdesk"."fact_ticket" WHERE origen_sistema = 'SHAREPOINT_LEGACY') <> v_legacy_antes THEN
        RAISE EXCEPTION 'borrar_tickets_de_prueba: cambió el número de tickets de PowerApps';
    END IF;

    RAISE NOTICE 'borrar_tickets_de_prueba: % ticket(s) de HelpDesk y % evento(s) borrados', v_tickets, v_eventos;
END;
$borrar$;
