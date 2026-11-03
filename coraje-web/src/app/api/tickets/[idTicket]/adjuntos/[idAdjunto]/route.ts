import { NextResponse } from "next/server";
import { z } from "zod";

import { getDownloadUrl, isAttachmentError } from "@/server/attachments/attachment-broker";
import { getCurrentEmployee } from "@/server/auth/current-employee";
import { logEvent } from "@/server/observability/log";
import { getDownloadableAttachment } from "@/server/tickets/ticket-queries";

/**
 * Descarga de un adjunto (specs/tickets.md §14.1). HelpDesk decide quién
 * descarga, no un enlace compartido: la carpeta de OneDrive no se comparte con
 * nadie, y esta ruta entrega la URL de corta duración de Graph solo a quien
 * puede ver el evento que trajo el archivo.
 *
 * Responde con una redirección a esa URL. El archivo va de OneDrive al
 * navegador sin pasar por la VPS, y la URL no se guarda en ninguna parte.
 *
 * Sin sesión, 401. Ticket o adjunto inexistente, o fuera de alcance, 404: las
 * dos respuestas son iguales a propósito, como en el detalle.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

const paramsSchema = z.object({ idTicket: z.uuid(), idAdjunto: z.uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ idTicket: string; idAdjunto: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) return new NextResponse("Inicia sesión para descargar el archivo.", { status: 401, headers: NO_STORE });

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new NextResponse("Archivo no encontrado.", { status: 404, headers: NO_STORE });

  const adjunto = await getDownloadableAttachment({ idPersonal: employee.idPersonal, ...parsed.data });
  if (!adjunto) return new NextResponse("Archivo no encontrado.", { status: 404, headers: NO_STORE });

  try {
    const url = await getDownloadUrl(adjunto.driveItemId);
    logEvent("info", "adjuntos.descarga", { idTicket: parsed.data.idTicket, idAdjunto: parsed.data.idAdjunto, idPersonal: employee.idPersonal });
    return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
  } catch (error) {
    if (!isAttachmentError(error)) logEvent("error", "adjuntos.descarga_fallida", { idTicket: parsed.data.idTicket }, error);
    const message = isAttachmentError(error) ? error.message : "No fue posible descargar el archivo. Intenta de nuevo en unos minutos.";
    return new NextResponse(message, { status: 502, headers: NO_STORE });
  }
}
