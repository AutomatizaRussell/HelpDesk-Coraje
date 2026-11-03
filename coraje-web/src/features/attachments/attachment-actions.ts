"use server";

import { z } from "zod";

import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { resolveGrants } from "@/server/authorization/authorizer";
import { TICKET_ACTIONS } from "@/server/authorization/catalog";
import { createUploadSession, isAttachmentError, type UploadSession } from "@/server/attachments/attachment-broker";
import { MAX_ATTACHMENT_BYTES } from "@/server/attachments/attachment-rules";
import { logEvent } from "@/server/observability/log";

/**
 * Autoriza la subida de un archivo (specs/tickets.md §14.2, paso 1).
 *
 * Abrir una sesión de carga le da al navegador una capacidad de escritura en
 * la carpeta de adjuntos, así que exige lo mismo que adjuntar: sesión de
 * empleado y alguna de las acciones que admiten adjuntos (crear, responder o
 * la nota interna). El permiso sobre el ticket concreto se comprueba al
 * enviar, dentro de la transacción del comando: un archivo subido y nunca
 * enviado queda en OneDrive sin ticket, y no da acceso a nada.
 */

const prepareSchema = z.object({
  nombre: z.string().trim().min(1).max(255),
  tamano: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});

export type PrepareUploadResult = { ok: true; session: UploadSession } | { ok: false; message: string };

const ATTACHING_ACTIONS = [TICKET_ACTIONS.crear, TICKET_ACTIONS.responder, TICKET_ACTIONS.notaInterna] as const;

export async function prepareAttachmentUploadAction(input: { nombre: string; tamano: number }): Promise<PrepareUploadResult> {
  const employee = await requireCurrentEmployee();
  const parsed = prepareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "El archivo no es válido." };

  const grants = await resolveGrants(employee.idPersonal, [...ATTACHING_ACTIONS]);
  if (grants.size === 0) return { ok: false, message: "No tienes permiso para adjuntar archivos." };

  try {
    return { ok: true, session: await createUploadSession({ name: parsed.data.nombre, size: parsed.data.tamano }) };
  } catch (error) {
    if (isAttachmentError(error)) return { ok: false, message: error.message };
    logEvent("error", "adjuntos.sesion_fallida", { idPersonal: employee.idPersonal }, error);
    return { ok: false, message: "No fue posible preparar la carga. Intenta de nuevo en unos minutos." };
  }
}
