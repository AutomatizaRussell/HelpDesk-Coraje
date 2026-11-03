import { after } from "next/server";

import { prisma } from "@/lib/prisma";

import { organizeAttachments, type ConfirmedAttachment } from "./attachment-broker";

/**
 * Después de guardar, mueve los adjuntos del envío a la carpeta del ticket
 * (U29, tickets.md §14.9). Corre con `after()`, cuando la respuesta ya salió:
 * la persona no espera a OneDrive, y un fallo no deshace nada (los archivos se
 * quedan en la carpeta general, igual de accesibles).
 *
 * El código se lee aquí y no lo pasa el comando: responder o anotar no lo
 * devuelven, y un ticket del portal sin clasificar no tiene código (entonces
 * no se mueve nada).
 */
export function organizeAfterResponse(idTicket: string, adjuntos: readonly ConfirmedAttachment[]): void {
  if (adjuntos.length === 0) return;
  after(async () => {
    const ticket = await prisma.factTicket.findUnique({ where: { idTicket }, select: { codigoTicket: true } });
    if (!ticket?.codigoTicket) return;
    await organizeAttachments({ codigoTicket: ticket.codigoTicket, driveItemIds: adjuntos.map((adjunto) => adjunto.driveItemId) });
  });
}
