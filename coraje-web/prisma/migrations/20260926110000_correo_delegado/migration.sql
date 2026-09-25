-- =====================================================================
-- U7 · D6: correo del ticket enviado como la persona que actúa
-- (docs/specs/acceso-empleados.md §9; docs/specs/tickets.md §4.1)
-- =====================================================================
-- Dos tablas nuevas, sin tocar nada existente:
--
-- 1. app.employee_graph_grant: la autorización delegada de Microsoft Graph
--    de cada empleado (el refresh_token que el ingreso ya obtiene desde U3
--    por offline_access y Mail.Send, y que hasta hoy se descartaba), sellada
--    con AES-256-GCM. Es lo que permite enviar un correo como esa persona.
--
-- 2. helpdesk.ticket_notificacion: un registro por correo que produce una
--    acción del ticket. Se inserta PENDIENTE en la misma transacción que el
--    evento y se envía después del commit. Sin worker: si el envío falla o el
--    proceso muere antes de enviar, la fila queda visible en el ticket y quien
--    la envió puede reenviarla. Es el mismo principio que el outbox hacia
--    SharePoint (fuente de verdad en PostgreSQL, el envío fuera de la
--    transacción), sin el proceso permanente que lo sondea.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Autorización delegada de Graph por empleado
-- ---------------------------------------------------------------------
-- Adaptada de EmployeeGraphGrant de Impulsa. El token nunca se guarda en
-- claro (secret-box.ts, HELPDESK_TOKEN_ENCRYPTION_KEY). revoked_at se marca
-- cuando Entra responde invalid_grant (cambio de contraseña, sesiones
-- revocadas, acceso condicional): solo un nuevo ingreso la revive.
--
-- No se borra al cerrar sesión: cerrar sesión termina la sesión del
-- navegador, no retira el consentimiento para enviar correo.
CREATE TABLE "app"."employee_graph_grant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_personal" UUID NOT NULL,
    "refresh_token_sealed" TEXT NOT NULL,
    "granted_scope" VARCHAR(1000) NOT NULL,
    "identity_tenant_id" VARCHAR(64) NOT NULL,
    "identity_subject" VARCHAR(255) NOT NULL,
    "obtained_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "last_refreshed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" VARCHAR(300),

    CONSTRAINT "employee_graph_grant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_graph_grant_id_personal_fkey"
        FOREIGN KEY ("id_personal")
        REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "employee_graph_grant_id_personal_key"
    ON "app"."employee_graph_grant" ("id_personal");

GRANT SELECT, INSERT, UPDATE ON "app"."employee_graph_grant" TO "coraje_runtime";


-- ---------------------------------------------------------------------
-- 2. Correos del ticket
-- ---------------------------------------------------------------------
-- estado:
--   PENDIENTE  escrito con el evento, todavía sin enviar.
--   ENVIANDO   reclamado por un envío en curso. Un envío que muere aquí se
--              puede reclamar de nuevo pasados unos minutos
--              (ticket-notifications.ts, STALE_SENDING_MS).
--   ENVIADO    Graph lo aceptó (202).
--   FALLIDO    Graph o Entra lo rechazaron; ultimo_error dice por qué.
-- El remitente es siempre la persona que hizo la acción: el correo sale de
-- su buzón con su token delegado, y por eso solo ella puede reenviarlo.
CREATE TABLE "helpdesk"."ticket_notificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id_ticket" UUID NOT NULL,
    "id_evento" UUID NOT NULL,
    "id_remitente" UUID NOT NULL,
    "id_destinatario" UUID NOT NULL,
    "destinatario_correo" VARCHAR(150) NOT NULL,
    "asunto" VARCHAR(300) NOT NULL,
    "cuerpo_html" TEXT NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "enviado_at" TIMESTAMPTZ(6),

    CONSTRAINT "ticket_notificacion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_ticket_notificacion_estado"
        CHECK ("estado" IN ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO')),
    CONSTRAINT "chk_ticket_notificacion_intentos" CHECK ("intentos" >= 0),
    -- RESTRICT, igual que los eventos: un ticket con historia no se borra.
    CONSTRAINT "ticket_notificacion_id_ticket_fkey"
        FOREIGN KEY ("id_ticket") REFERENCES "helpdesk"."fact_ticket"("id_ticket")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_notificacion_id_evento_fkey"
        FOREIGN KEY ("id_evento") REFERENCES "helpdesk"."fact_ticket_evento"("id_evento")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "ticket_notificacion_id_remitente_fkey"
        FOREIGN KEY ("id_remitente") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT "ticket_notificacion_id_destinatario_fkey"
        FOREIGN KEY ("id_destinatario") REFERENCES "core"."dim_personal"("id_personal")
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- El detalle del ticket lista sus correos.
CREATE INDEX "ix_ticket_notificacion_ticket"
    ON "helpdesk"."ticket_notificacion" ("id_ticket", "created_at");

-- Sin DELETE: el registro de lo que se envió es evidencia, como los eventos.
GRANT SELECT, INSERT, UPDATE ON "helpdesk"."ticket_notificacion" TO "coraje_runtime";
