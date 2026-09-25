-- =====================================================================
-- U7 · Calendario de festivos de Colombia para el plazo del ticket
-- (docs/specs/tickets.md §5)
-- =====================================================================
-- helpdesk.crear_ticket_interno calcula el plazo con
-- core.add_colombia_business_days, que depende de core.is_colombia_holiday.
-- Esa función, tal como la capturó el baseline, tiene tres defectos, todos
-- verificables con el calendario oficial de 2026:
--
-- 1. core.next_monday solo movía el domingo al lunes. La Ley Emiliani (Ley 51
--    de 1983) traslada al lunes siguiente todo festivo que no cae en lunes.
--    Ejemplo: Reyes 2026 cayó martes 6 de enero y se celebró el lunes 12; la
--    función marcaba el martes 6 y trataba el lunes 12 como hábil.
-- 2. Ascensión y Corpus Christi se contaban también en jueves (Pascua + 39 y
--    + 60), que en Colombia no son festivos: se celebran el lunes siguiente.
-- 3. Faltaba el Sagrado Corazón (Pascua + 71, lunes).
--
-- Se añade además el festivo de la Ley 2578 de 2026 (Nuestra Señora del
-- Rosario de Chiquinquirá, 9 de julio, trasladable), solo desde 2026: en 2026
-- fue el lunes 13 de julio. Hay una demanda de inconstitucionalidad en curso;
-- la ley rige mientras la Corte no decida. Si la tumba, se retira esta línea
-- con otra migración.
--
-- A quién afecta: solo a los plazos que se calculen desde ahora. Ningún dato
-- guardado se recalcula. La fecha límite de los tickets legacy viene de
-- SharePoint (Fecha_Max_Respuesta) y la ingesta no usa estas funciones.
--
-- Mismo nombre y firma: CREATE OR REPLACE conserva dueño y privilegios.
-- =====================================================================

-- Precondición: CREATE OR REPLACE exige ser dueño de la función. El baseline se
-- adoptó con `migrate resolve --applied`, sin ejecutarse, así que el dueño de
-- estas funciones de `core` es quien las creó a mano en su día, no
-- necesariamente coraje_migrator. Si no lo es, se aborta con un mensaje que dice
-- qué hacer, en vez de un «must be owner» sin contexto.
DO $precondicion$
DECLARE
    v_ajenas TEXT;
BEGIN
    SELECT string_agg(p.oid::regprocedure::TEXT || ' (dueño ' || pg_get_userbyid(p.proowner) || ')', ', ')
    INTO v_ajenas
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'core'
      AND p.proname IN ('next_monday', 'is_colombia_holiday')
      AND p.proowner <> (SELECT oid FROM pg_roles WHERE rolname = current_user);

    IF v_ajenas IS NOT NULL THEN
        RAISE EXCEPTION 'Funciones de calendario con otro dueño: %. Ejecutar como superusuario: ALTER FUNCTION ... OWNER TO %; y reintentar.',
            v_ajenas, current_user;
    END IF;
END;
$precondicion$;

CREATE OR REPLACE FUNCTION "core"."next_monday"(p_date DATE)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
    -- Traslado Emiliani: el mismo día si es lunes; si no, el lunes siguiente.
    -- ISODOW: lunes = 1 … domingo = 7.
    SELECT p_date + ((8 - EXTRACT(ISODOW FROM p_date)::INT) % 7);
$$;

CREATE OR REPLACE FUNCTION "core"."is_colombia_holiday"(p_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_year INT := EXTRACT(YEAR FROM p_date)::INT;
    v_easter DATE := core.easter_date(v_year);
    v_fixed DATE[];
    v_movable DATE[];
BEGIN
    -- Festivos que no se trasladan.
    v_fixed := ARRAY[
        make_date(v_year, 1, 1),    -- Año Nuevo
        make_date(v_year, 5, 1),    -- Día del Trabajo
        make_date(v_year, 7, 20),   -- Independencia
        make_date(v_year, 8, 7),    -- Batalla de Boyacá
        make_date(v_year, 12, 8),   -- Inmaculada Concepción
        make_date(v_year, 12, 25),  -- Navidad
        v_easter - 3,               -- Jueves Santo
        v_easter - 2                -- Viernes Santo
    ];

    -- Festivos que se trasladan al lunes (Ley Emiliani), y los que dependen de
    -- la Pascua y ya caen en lunes.
    v_movable := ARRAY[
        core.next_monday(make_date(v_year, 1, 6)),    -- Reyes Magos
        core.next_monday(make_date(v_year, 3, 19)),   -- San José
        v_easter + 43,                                -- Ascensión del Señor
        v_easter + 64,                                -- Corpus Christi
        v_easter + 71,                                -- Sagrado Corazón
        core.next_monday(make_date(v_year, 6, 29)),   -- San Pedro y San Pablo
        core.next_monday(make_date(v_year, 8, 15)),   -- Asunción de la Virgen
        core.next_monday(make_date(v_year, 10, 12)),  -- Día de la Raza
        core.next_monday(make_date(v_year, 11, 1)),   -- Todos los Santos
        core.next_monday(make_date(v_year, 11, 11))   -- Independencia de Cartagena
    ];

    -- Ley 2578 de 2026: solo desde 2026, sin alterar años anteriores.
    IF v_year >= 2026 THEN
        v_movable := v_movable || core.next_monday(make_date(v_year, 7, 9));
    END IF;

    RETURN p_date = ANY (v_fixed) OR p_date = ANY (v_movable);
END;
$$;
