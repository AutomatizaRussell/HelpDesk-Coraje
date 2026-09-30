import { prisma } from "@/lib/prisma";
import { formatDate } from "@/features/tickets/format";
import { publicNoticesUrl, publicTicketUrl } from "@/server/auth/conecta-return";
import { logEvent } from "@/server/observability/log";
import { PortalMailError, sendPortalMail } from "@/server/portal/portal-mail";

import { buildEscalationMail } from "./ticket-notice-content";
import { loadNoticesByIds } from "./ticket-notices";

/**
 * Escalamiento diario de avisos (U15, specs/tickets.md §12.3).
 *
 * Reparto del trabajo, cada pieza en su sitio (CLAUDE.md, fronteras):
 * - **PostgreSQL decide** a quién se escala y con qué avisos, y hace la
 *   idempotencia: `helpdesk.reclamar_escalamientos_avisos()` crea una fila
 *   por persona y día y la reclama. Una segunda pasada el mismo día solo
 *   reintenta lo que no salió.
 * - **La aplicación redacta** el correo, con el mismo texto que la campana.
 * - **n8n dispara** una vez al día (`n8n/HELPDESK - Escalar avisos V1.json`)
 *   y **envía** desde el buzón sin dueño (`sendPortalMail`). No hay proceso
 *   nuevo en la VPS.
 *
 * Los envíos van uno tras otro: son pocos por día, y en paralelo solo
 * cargarían más a n8n y a Graph al mismo tiempo sin que nadie lo note antes.
 */

export interface EscalationSummary {
  enviados: number;
  fallidos: number;
  omitidos: number;
}

interface ClaimedEscalation {
  id_escalamiento: string;
  id_personal: string;
  correo: string;
  nombre: string;
  id_avisos: string[];
}

async function finish(id: string, result: { estado: "ENVIADO" | "FALLIDO" | "OMITIDO"; error?: string }): Promise<void> {
  const now = new Date();
  await prisma.avisoEscalamiento.update({
    where: { id },
    data: {
      estado: result.estado,
      ultimoError: result.error?.slice(0, 1000) ?? null,
      updatedAt: now,
      enviadoAt: result.estado === "ENVIADO" ? now : undefined,
    },
  });
}

/**
 * Reclama y envía los escalamientos del día. Nunca lanza por un correo que
 * falla: lo deja `FALLIDO`, sigue con el siguiente y lo cuenta. Quien llama
 * decide qué hacer con la cuenta.
 */
export async function escalatePendingNotices(): Promise<EscalationSummary> {
  const claimed = await prisma.$queryRaw<ClaimedEscalation[]>`
    SELECT id_escalamiento::text, id_personal::text, correo, nombre, id_avisos::text[] AS id_avisos
    FROM helpdesk.reclamar_escalamientos_avisos()
  `;

  const summary: EscalationSummary = { enviados: 0, fallidos: 0, omitidos: 0 };
  for (const row of claimed) {
    const correlation = { idEscalamiento: row.id_escalamiento, idPersonal: row.id_personal };
    try {
      const avisos = await loadNoticesByIds(row.id_personal, row.id_avisos);
      if (avisos.length === 0) {
        // Todo se cerró entre la primera pasada y este reintento.
        await finish(row.id_escalamiento, { estado: "OMITIDO" });
        summary.omitidos += 1;
        continue;
      }
      const { subject, html } = buildEscalationMail({
        nombre: row.nombre,
        avisosUrl: publicNoticesUrl(),
        pendientes: avisos.map((aviso) => ({
          titulo: aviso.titulo,
          desde: formatDate(aviso.fecha),
          url: publicTicketUrl(aviso.idTicket),
        })),
      });
      await sendPortalMail({ kind: "ESCALAMIENTO", id: row.id_escalamiento, to: row.correo, subject, html });
      await finish(row.id_escalamiento, { estado: "ENVIADO" });
      summary.enviados += 1;
    } catch (error) {
      const motivo = error instanceof PortalMailError ? error.message : "No fue posible enviar el correo de escalamiento.";
      if (error instanceof PortalMailError) logEvent("warn", "avisos.escalamiento_fallido", { ...correlation, motivo });
      else logEvent("error", "avisos.escalamiento_fallido", correlation, error);
      // Si ni siquiera se puede registrar el fallo, la fila queda ENVIANDO y
      // la reclama la siguiente pasada pasados 15 minutos.
      await finish(row.id_escalamiento, { estado: "FALLIDO", error: motivo }).catch((finishError: unknown) =>
        logEvent("error", "avisos.escalamiento_no_registrado", correlation, finishError),
      );
      summary.fallidos += 1;
    }
  }

  logEvent("info", "avisos.escalamiento", { ...summary });
  return summary;
}
