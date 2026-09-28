import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Registro de auditoría del acceso externo (acceso-clientes.md §9), en un
 * solo sitio para que los nombres de evento no se escriban de cuatro maneras.
 *
 * Regla que no se negocia: **metadata lleva identificadores, nunca secretos.**
 * Ni el código, ni el enlace, ni el token, ni su hash. Lo que sí: ids de
 * invitación, desafío o dispositivo, y el id de ejecución de n8n.
 */
export type PortalAuditEvent =
  | "ACCESO_CONCEDIDO"
  | "ACCESO_REVOCADO"
  | "SOLO_LECTURA_CAMBIADO"
  | "INVITACION_EMITIDA"
  | "INVITACION_ENVIADA"
  | "INVITACION_ACTIVADA"
  | "CODIGO_EMITIDO"
  | "CODIGO_ENVIADO"
  | "CODIGO_VERIFICADO"
  | "CODIGO_FALLIDO"
  | "ACCESO_DENEGADO"
  | "SALIDA"
  | "TICKET_RADICADO";

type Db = Prisma.TransactionClient | typeof prisma;

export async function recordPortalAudit(
  db: Db,
  entry: {
    evento: PortalAuditEvent;
    resultado: "EXITO" | "FALLO";
    idContacto?: string | null;
    idAutorizacion?: string | null;
    idPersonal?: string | null;
    motivo?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await db.portalAuditoria.create({
    data: {
      evento: entry.evento,
      resultado: entry.resultado,
      idContacto: entry.idContacto ?? null,
      idAutorizacion: entry.idAutorizacion ?? null,
      idPersonal: entry.idPersonal ?? null,
      // Recortado al límite de la columna: un motivo largo no debe tumbar la
      // operación que se está auditando.
      motivo: entry.motivo?.slice(0, 500) ?? null,
      metadata: entry.metadata ?? {},
    },
  });
}
