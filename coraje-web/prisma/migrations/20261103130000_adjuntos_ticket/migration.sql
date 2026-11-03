-- =====================================================================
-- U7 · Adjuntos del ticket (specs/tickets.md §14)
-- =====================================================================
-- Los archivos viven en el OneDrive de info.admingct@rbcol.co, carpeta
-- HelpDesk/Adjuntos (decisión del usuario del 30-oct-2026). Aquí solo hay
-- metadatos: qué archivo, de qué ticket, traído por qué evento, y el id del
-- objeto en OneDrive con el que n8n pide la descarga. Nunca una URL: la de
-- descarga caduca en minutos y se pide cada vez (§14.1).
--
-- Una fila nace solo después de que n8n confirmó el objeto contra Graph, en
-- la misma transacción que el evento que lo trae. Por eso no hay columna de
-- «estado de la carga» (§14.3 la preveía): un archivo subido y nunca enviado
-- no llega a la base, y queda en OneDrive sin ticket.
-- =====================================================================

-- El adjunto apunta a su evento Y a su ticket, y la base exige que sean el
-- mismo par: un adjunto no puede colgar del evento de otro ticket. Para la
-- clave foránea compuesta hace falta la unicidad del par; id_evento ya es
-- clave primaria, así que el índice no restringe nada nuevo.
CREATE UNIQUE INDEX "ux_fact_ticket_evento_evento_ticket"
    ON "helpdesk"."fact_ticket_evento" ("id_evento", "id_ticket");

CREATE TABLE "helpdesk"."ticket_adjunto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_ticket" UUID NOT NULL,
    "id_evento" UUID NOT NULL,
    "id_autor" UUID NOT NULL,
    "nombre_original" VARCHAR(255) NOT NULL,
    "nombre_guardado" VARCHAR(200) NOT NULL,
    "tipo_mime" VARCHAR(150) NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "drive_item_id" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

    CONSTRAINT "ticket_adjunto_pkey" PRIMARY KEY ("id"),
    -- 25 MB, el mismo tope de attachment-rules.ts. La aplicación ya lo aplica
    -- contra lo que informa Graph; la base no acepta otra cosa.
    CONSTRAINT "chk_ticket_adjunto_tamano" CHECK ("tamano_bytes" > 0 AND "tamano_bytes" <= 26214400),
    -- Un objeto de OneDrive se adjunta una sola vez.
    CONSTRAINT "uq_ticket_adjunto_drive_item" UNIQUE ("drive_item_id"),
    CONSTRAINT "ticket_adjunto_id_ticket_fkey"
        FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_adjunto_evento_ticket_fkey"
        FOREIGN KEY ("id_evento", "id_ticket") REFERENCES "helpdesk"."fact_ticket_evento"("id_evento", "id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_adjunto_id_autor_fkey"
        FOREIGN KEY ("id_autor") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- El detalle lee los adjuntos de los eventos visibles de un ticket.
CREATE INDEX "ix_ticket_adjunto_evento" ON "helpdesk"."ticket_adjunto" ("id_evento");
CREATE INDEX "ix_ticket_adjunto_ticket" ON "helpdesk"."ticket_adjunto" ("id_ticket");

-- ALTER DEFAULT PRIVILEGES concede DML completo a los dos roles en cada
-- tabla nueva (operacion.md, F6). Un adjunto es constancia, como el evento
-- que lo trae: la aplicación lo inserta y lo lee, nadie lo edita ni lo borra,
-- y la ingesta no tiene nada que hacer aquí.
REVOKE ALL ON "helpdesk"."ticket_adjunto" FROM "coraje_runtime", "coraje_etl";
GRANT SELECT, INSERT ON "helpdesk"."ticket_adjunto" TO "coraje_runtime";
