-- =====================================================================
-- Ocupación de cada correo en el tiempo (docs/specs/directorio-personal.md §4.3)
-- =====================================================================
-- El problema, observado el 05-nov-2026. La Transform 06 de la ingesta
-- recalculaba en cada ejecución quién ocupaba cada correo, y lo hacía con el
-- estado ACTUAL de la lista «Personal GCT». Un ticket legacy guarda el correo
-- como texto; la persona a la que apunta salía de esa cuenta. Así, editar la
-- lista reescribía tickets pasados: cuando a Juliana Tangarife (ítem 311) le
-- cambiaron el correo de mercadeo.mde@ a mercadeo.gct@ y a Alizon Chamorro
-- (ítem 405) le pusieron «.», la Transform 04 creó un marcador histórico para
-- mercadeo.mde@ y los 7 tickets de ese correo dejaron de ser de Juliana.
--
-- La corrección: la ocupación se registra una vez y solo crece.
--   · core.personal_correo_ocupacion guarda intervalos [desde, hasta) por
--     correo. NULL en desde es «desde siempre»; NULL en hasta, «abierto».
--     Se usa NULL y no ±infinity porque Prisma no representa infinity en un
--     Date.
--   · La 06 la siembra para los correos que aún no tiene y, cuando el ocupante
--     activo de un correo cambia, cierra el intervalo abierto y abre otro
--     DESDE ESE MOMENTO. Nunca con la fecha de alta del ítem: un ítem viejo
--     al que le cambian el correo llevaría el relevo meses atrás.
--   · Un intervalo cerrado no se modifica ni se borra, y dos intervalos del
--     mismo correo no se solapan. Lo garantiza el trigger, no la ingesta.
--
-- Por qué la siembra no está aquí: calcularla exige leer
-- staging.sp_personal_gct_raw, y coraje_migrator no tiene acceso a staging
-- (operacion.md, F6). La hace la 06, que corre como coraje_etl.
--
-- Datos: crea una tabla y escribe dos filas de reconstrucción (sección 3),
-- autorizadas por el usuario el 05-nov-2026. No toca fact_ticket: la 06 de
-- la siguiente ejecución reatribuye los 7 tickets leyendo esta tabla.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------
CREATE TABLE "core"."personal_correo_ocupacion" (
    "id_ocupacion" UUID NOT NULL DEFAULT gen_random_uuid(),
    "correo" VARCHAR(150) NOT NULL,
    "id_personal" UUID NOT NULL,
    "desde" TIMESTAMPTZ(6),
    "hasta" TIMESTAMPTZ(6),
    -- SIEMBRA: primer registro de un correo, calculado por la 06 con la
    --   regla de tickets.md §7.3-§7.4.
    -- RELEVO_DETECTADO: la 06 vio cambiar al ocupante activo.
    -- RECONSTRUCCION: corrección manual autorizada, versionada en una
    --   migración con su causa.
    "origen" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "personal_correo_ocupacion_pkey" PRIMARY KEY ("id_ocupacion"),
    CONSTRAINT "personal_correo_ocupacion_id_personal_fkey"
        FOREIGN KEY ("id_personal") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    -- Mismo patrón que la admisión (EMAIL_PATTERN de employee-admission.ts):
    -- un «.» o un texto suelto nunca ocupa nada.
    CONSTRAINT "chk_personal_correo_ocupacion_correo"
        CHECK ("correo" = LOWER(BTRIM("correo"))
               AND "correo" ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
    CONSTRAINT "chk_personal_correo_ocupacion_intervalo"
        CHECK ("desde" IS NULL OR "hasta" IS NULL OR "desde" < "hasta"),
    CONSTRAINT "chk_personal_correo_ocupacion_origen"
        CHECK ("origen" IN ('SIEMBRA', 'RELEVO_DETECTADO', 'RECONSTRUCCION'))
);

-- Un solo ocupante abierto por correo.
CREATE UNIQUE INDEX "ux_personal_correo_ocupacion_abierta"
    ON "core"."personal_correo_ocupacion" ("correo")
    WHERE "hasta" IS NULL;

-- La 06 resuelve correo + fecha del ticket.
CREATE INDEX "ix_personal_correo_ocupacion_correo"
    ON "core"."personal_correo_ocupacion" ("correo", "desde");


-- ---------------------------------------------------------------------
-- 2. Solo crece
-- ---------------------------------------------------------------------
-- Lo único que se puede cambiar de una fila es cerrar un intervalo abierto.
-- Corregir un intervalo cerrado es una migración con causa, que corre como
-- dueña de la tabla y desactiva este trigger de forma explícita.
CREATE FUNCTION "core"."guardar_personal_correo_ocupacion"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'personal_correo_ocupacion solo crece: no se borra la ocupación de %', OLD.correo;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.hasta IS NOT NULL
           OR NEW.hasta IS NULL
           OR (NEW.id_ocupacion, NEW.correo, NEW.id_personal, NEW.desde, NEW.origen, NEW.created_at)
              IS DISTINCT FROM
              (OLD.id_ocupacion, OLD.correo, OLD.id_personal, OLD.desde, OLD.origen, OLD.created_at)
        THEN
            RAISE EXCEPTION 'personal_correo_ocupacion: solo se puede cerrar un intervalo abierto (%)', OLD.correo;
        END IF;
        RETURN NEW;
    END IF;

    -- INSERT. Un trigger BEFORE ROW ve las filas que la misma sentencia ya
    -- insertó, así que la siembra de varios intervalos de un correo también
    -- se comprueba entre sí.
    IF EXISTS (
        SELECT 1
        FROM "core"."personal_correo_ocupacion" o
        WHERE o.correo = NEW.correo
          AND COALESCE(o.desde, '-infinity'::timestamptz) < COALESCE(NEW.hasta, 'infinity'::timestamptz)
          AND COALESCE(NEW.desde, '-infinity'::timestamptz) < COALESCE(o.hasta, 'infinity'::timestamptz)
    ) THEN
        RAISE EXCEPTION 'personal_correo_ocupacion: el intervalo de % se solapa con uno existente', NEW.correo;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_guardar_personal_correo_ocupacion"
    BEFORE INSERT OR UPDATE OR DELETE ON "core"."personal_correo_ocupacion"
    FOR EACH ROW EXECUTE FUNCTION "core"."guardar_personal_correo_ocupacion"();

-- ALTER DEFAULT PRIVILEGES concede DML completo a los dos roles en cada
-- tabla nueva (operacion.md, F6). Solo la ingesta la escribe; la aplicación
-- no la lee.
REVOKE ALL ON "core"."personal_correo_ocupacion" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT, UPDATE ON "core"."personal_correo_ocupacion" TO "coraje_etl";


-- ---------------------------------------------------------------------
-- 3. Reconstrucción de mercadeo.mde@rbcol.co
-- ---------------------------------------------------------------------
-- Los intervalos que la regla de relevos (tickets.md §7.4, U22) daba antes de
-- que se editara la lista: Juliana desde siempre hasta el alta del ítem de
-- Alizon (Created 2026-10-13T18:31:39Z), Alizon desde entonces. La
-- evidencia de que el ítem 311 tenía ese correo es tickets.md §7.4, escrito
-- el 23-oct-2026; el staging solo guarda el valor actual. Ids leídos de la
-- base el 05-nov-2026. Si no corresponden a esos ítems, se aborta: mejor un
-- despliegue fallido que atribuir a quien no es.
DO $reconstruir_mercadeo_mde$
BEGIN
    IF (SELECT count(*) FROM "core"."dim_personal"
        WHERE ("id_personal" = '2c1d218e-2483-4138-b732-dcecb9d52655' AND "sp_personal_id" = 311)
           OR ("id_personal" = 'fe22b3ec-a80d-4696-a49c-92fa87ad2355' AND "sp_personal_id" = 405)) <> 2
    THEN
        RAISE EXCEPTION 'Reconstrucción de mercadeo.mde@: los ítems 311 y 405 no tienen los id_personal esperados';
    END IF;
END
$reconstruir_mercadeo_mde$;

INSERT INTO "core"."personal_correo_ocupacion" ("correo", "id_personal", "desde", "hasta", "origen")
VALUES
    ('mercadeo.mde@rbcol.co', '2c1d218e-2483-4138-b732-dcecb9d52655', NULL, '2026-10-13T18:31:39Z', 'RECONSTRUCCION'),
    ('mercadeo.mde@rbcol.co', 'fe22b3ec-a80d-4696-a49c-92fa87ad2355', '2026-10-13T18:31:39Z', NULL, 'RECONSTRUCCION');
