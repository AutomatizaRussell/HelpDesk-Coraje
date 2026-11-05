-- =====================================================================
-- U38 · Área que remite, congelada en el ticket (docs/specs/tickets.md §3.2)
-- =====================================================================
-- El problema, medido el 05-nov-2026 contra la base desplegada. El Power BI
-- «IND HELPDESK» agrupa los tickets por el área que los remite, y PowerApps
-- la guardaba en cada ítem al crearlo (Área_Remite, autocompletada desde el
-- perfil de quien radicaba). HelpDesk no la guardaba: la ingesta la ignoraba
-- y fact_ticket no tenía columna. Deducirla del área ACTUAL del solicitante
-- dejaba sin área 672 de 3.088 tickets legacy (personas que ya salieron) y
-- cambiaba de área otros 11 (personas que cambiaron de área).
--
-- La corrección: el área se fija una vez, cuando nace el ticket, y no se
-- recalcula.
--   · Tickets legacy: la Transform 06 de la ingesta la resuelve desde
--     Área_Remite del ítem de SharePoint, con el mismo norm_text que el área
--     destino. Los 3.078 valores no vacíos tienen área en el catálogo; los 10
--     vacíos quedan NULL, igual que en el Power BI.
--   · Tickets internos: crear_ticket_interno copia el área del solicitante en
--     el mismo INSERT.
--   · Tickets del portal: NULL. Los radica un contacto de cliente, que no
--     pertenece a ningún área de la firma.
--
-- Inmutabilidad: una columna nueva de fact_ticket no es actualizable por
-- coraje_runtime ni por coraje_etl hasta que una migración la conceda
-- (20260925180000_proteger_estado_y_eventos). Aquí se concede solo a
-- coraje_etl, porque la ingesta reescribe el ticket legacy cuando su ítem
-- cambia en SharePoint. La aplicación no puede cambiarla.
--
-- Sin índice: la tabla tiene unos 3.100 tickets y ninguna de sus llaves
-- foráneas está indexada (ver schema.prisma). Un recorrido completo para
-- agrupar por área cuesta menos que mantener el índice. Se revisa si los
-- indicadores lo piden con un EXPLAIN, no a ojo.
--
-- Datos: escribe el área de los tickets internos que ya existen (2 al
-- 05-nov-2026), con el área ACTUAL de su solicitante. Es la mejor
-- aproximación disponible y la única: esos tickets tienen días de vida.
-- No toca los tickets legacy: los llena la Transform 06 en su siguiente
-- ejecución, porque coraje_migrator no tiene acceso a staging (operacion.md,
-- F6).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columna y llave foránea
-- ---------------------------------------------------------------------
-- Nullable: los tickets del portal y los 10 legacy sin Área_Remite no la
-- tienen. El nombre de la llave es el que Prisma genera por defecto, para
-- que el esquema no necesite un map ni produzca deriva.
ALTER TABLE "helpdesk"."fact_ticket" ADD COLUMN "id_area_remite" UUID;

ALTER TABLE "helpdesk"."fact_ticket"
    ADD CONSTRAINT "fact_ticket_id_area_remite_fkey"
    FOREIGN KEY ("id_area_remite") REFERENCES "core"."dim_area"("id_area")
    ON DELETE NO ACTION ON UPDATE NO ACTION;


-- ---------------------------------------------------------------------
-- 2. Solo la ingesta puede reescribirla
-- ---------------------------------------------------------------------
GRANT UPDATE ("id_area_remite") ON "helpdesk"."fact_ticket" TO "coraje_etl";


-- ---------------------------------------------------------------------
-- 3. crear_ticket_interno la fija al radicar
-- ---------------------------------------------------------------------
-- Misma firma y mismo resultado que en 20260928110000_acceso_clientes. Dos
-- cambios: la comprobación de que el solicitante está activo pasa a leer su
-- área en la misma consulta, y el INSERT la escribe. Un solicitante activo
-- sin área radica igual, con el área que remite en NULL: PowerApps tampoco
-- lo impedía, y negarle el ticket por un dato de directorio sería peor.
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
    v_id_area_remite UUID;
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

    -- El área de quien radica, tal como está en este momento: es la que queda
    -- en el ticket aunque la persona cambie de área o salga de la firma.
    SELECT persona.id_area INTO v_id_area_remite
    FROM core.dim_personal AS persona
    WHERE persona.id_personal = p_id_solicitante
      AND persona.estado_activo;

    IF NOT FOUND THEN
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
        id_area_remite,
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
        v_id_area_remite,
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
-- 4. Tickets internos que ya existen
-- ---------------------------------------------------------------------
-- Solo origen SISTEMA_INTERNO: los legacy los llena la ingesta y los del
-- portal no tienen área que remite. Ningún trigger de fact_ticket escucha
-- esta columna (trg_set_codigo_ticket es de id_area_destino y
-- trg_resolver_avisos_ticket de id_estado e id_asignado).
UPDATE "helpdesk"."fact_ticket" AS ticket
SET "id_area_remite" = persona."id_area"
FROM "core"."dim_personal" AS persona
WHERE ticket."origen_sistema" = 'SISTEMA_INTERNO'
  AND ticket."id_area_remite" IS NULL
  AND persona."id_personal" = ticket."id_solicitante";
