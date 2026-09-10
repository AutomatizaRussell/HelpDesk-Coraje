-- =====================================================
-- 3. CORE / DATOS MAESTROS
-- =====================================================
CREATE TABLE core.dim_area (
    id_area UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ID de SharePoint si el área viene de alguna lista origen
    sp_area_id INTEGER UNIQUE,

    nombre_area VARCHAR(100) NOT NULL UNIQUE,
    encargado_recepcion VARCHAR(100),

    -- Código corto y estable (ADM, REV, BPO...). Lo fija la transformación de
    -- ingesta (sql/elt/01_transform_area.sql, versión con validación de áreas
    -- conocidas); nullable porque una fila creada por otra vía no lo trae de
    -- entrada.
    codigo_area VARCHAR(10) UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE core.dim_cliente_contai (
    id_cliente_contai UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ID original de SharePoint
    sp_cliente_id INTEGER UNIQUE,

    identificacion_fiscal VARCHAR(50),
    nombre_cliente VARCHAR(150) NOT NULL,

    tipo_cliente VARCHAR(50),
    grupo_economico VARCHAR(100),

    estado_cliente BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE core.cliente_contai_recurso (
    id_recurso UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Llave foránea actualizada apuntando a la nueva tabla
    id_cliente_contai UUID NOT NULL REFERENCES core.dim_cliente_contai(id_cliente_contai) ON DELETE CASCADE,

    nombre_recurso VARCHAR(100),
    url_recurso TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE core.dim_personal (
    id_personal UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- ID original de SharePoint / Microsoft 365 cuando aplique
    sp_personal_id INTEGER UNIQUE,
    sp_user_id INTEGER UNIQUE,

    cedula VARCHAR(20),
    nombre_completo VARCHAR(200) NOT NULL,
    correo_corporativo VARCHAR(150),

    id_area UUID REFERENCES core.dim_area(id_area),

    cargo VARCHAR(100),
    estado_activo BOOLEAN NOT NULL DEFAULT TRUE,

    -- Modelo de buzón compartido (docs/specs/tickets.md §7.3). Marca una fila
    -- como el "responsable histórico no identificado" de un correo
    -- corporativo compartido por más de una persona a lo largo del tiempo —
    -- nunca una persona real, siempre el marcador que absorbe la ambigüedad
    -- cuando sql/elt/04_transform_personal_historico.sql infiere un correo
    -- de tickets legacy que ya tiene una fila activa con el mismo correo.
    -- La transformación de tickets (sql/elt/06_transform_ticket.sql) resuelve
    -- a esta fila en caso de ambigüedad, nunca al ocupante actual: es la
    -- regla dura decidida el 10-sep-2026 (nunca atribuir historial a quien
    -- ocupa el buzón hoy).
    es_responsable_historico_no_identificado BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Como máximo un marcador histórico por correo compartido: si
-- 04_transform_personal_historico.sql alguna vez infiere dos marcadores para
-- el mismo buzón, es un defecto que debe fallar aquí, no propagarse en
-- silencio a la transformación de tickets.
CREATE UNIQUE INDEX ux_dim_personal_correo_historico
ON core.dim_personal (correo_corporativo)
WHERE es_responsable_historico_no_identificado;