import { NextResponse } from "next/server";
import { z } from "zod";

import { getPreviewUrl, isAttachmentError } from "@/server/attachments/attachment-broker";
import { isPreviewable } from "@/server/attachments/attachment-rules";
import { getCurrentEmployee } from "@/server/auth/current-employee";
import { logEvent } from "@/server/observability/log";
import { getDownloadableAttachment } from "@/server/tickets/ticket-queries";

/**
 * Vista previa de un adjunto dentro de HelpDesk (U29, decisión del usuario del
 * 03-nov-2026: «que todo se me abra dentro de la app»). La carga el iframe de
 * la ventana de vista previa: redirige al visor de OneDrive, que muestra PDF,
 * imágenes y Office renderizados en los servidores de Microsoft. El archivo no
 * se ejecuta en el equipo de quien lo abre ni pasa por la VPS.
 *
 * Mismas reglas que la descarga (`../route.ts`): sin sesión, 401; adjunto
 * fuera de alcance o inexistente, 404. Un tipo sin vista previa (CSV, ZIP)
 * también responde 404: la interfaz no la ofrece, y aquí no se inventa.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

const paramsSchema = z.object({ idTicket: z.uuid(), idAdjunto: z.uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ idTicket: string; idAdjunto: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) return new NextResponse("Inicia sesión para ver el archivo.", { status: 401, headers: NO_STORE });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new NextResponse("Archivo no encontrado.", { status: 404, headers: NO_STORE });

  const adjunto = await getDownloadableAttachment({ idPersonal: employee.idPersonal, ...parsed.data });
  if (!adjunto || !isPreviewable(adjunto.nombre)) return new NextResponse("Archivo no encontrado.", { status: 404, headers: NO_STORE });

  try {
    const url = await getPreviewUrl(adjunto.driveItemId);
    logEvent("info", "adjuntos.vista", { idTicket: parsed.data.idTicket, idAdjunto: parsed.data.idAdjunto, idPersonal: employee.idPersonal });
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  } catch (error) {
    if (!isAttachmentError(error)) logEvent("error", "adjuntos.vista_fallida", { idTicket: parsed.data.idTicket }, error);
    const message = isAttachmentError(error) ? error.message : "No fue posible mostrar el archivo. Puedes descargarlo.";
    return new NextResponse(message, { status: 502, headers: NO_STORE });
  }
}
