"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { errorForm, invalidForm, unexpectedForm } from "@/features/forms/form-state";
import type { TicketFormState } from "@/features/tickets/action-state";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { dispatchTicketMail } from "@/server/notifications/ticket-notifications";
import { redirectTicket } from "@/server/tickets/ticket-commands";
import { kickSharePointMirror } from "@/server/sync/sharepoint-mirror";
import { isTicketDomainError } from "@/server/tickets/ticket-errors";
import { modeQuery } from "@/server/tickets/ticket-mode";

/**
 * Redirigir al área un ticket del portal (T3). Endpoint alcanzable por sí
 * mismo: exige sesión, valida con `zod` y deja la autorización al comando,
 * que evalúa `ticket.redirigir` contra la fila bloqueada.
 */

const redirectSchema = z.object({
  idTicket: z.uuid({ error: "Identificador inválido." }),
  idTipoReq: z.uuid({ error: "Elige el tipo y las categorías del requerimiento." }),
});

export async function redirectTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/tickets");
  const parsed = redirectSchema.safeParse({
    idTicket: formData.get("idTicket"),
    idTipoReq: formData.get("idTipoReq"),
  });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  let result: Awaited<ReturnType<typeof redirectTicket>>;
  try {
    result = await redirectTicket({ idPersonal: employee.idPersonal, ...parsed.data });
  } catch (error) {
    if (isTicketDomainError(error)) return errorForm(error.message, formData);
    return unexpectedForm(error, formData, "redirigir el ticket");
  }

  // Desde U15 la persona que lo recibe se entera por un aviso, no por correo:
  // hoy `mailIds` llega vacío. Se despacha igual, para que un correo que el
  // comando llegue a encolar no se quede sin salir.
  const failures = (await dispatchTicketMail(result.mailIds)).filter((mail) => !mail.ok);
  // Redirigir le da área al ticket del portal: es cuando el trigger encola
  // su creación en HelpDeskBd.
  kickSharePointMirror();
  revalidatePath("/tickets");
  // De vuelta a «Por redirigir», no al detalle: el ticket quedó en el área
  // que le corresponde, que puede no ser la de quien lo redirigió, y su
  // detalle le respondería como a cualquiera fuera de alcance. El aviso lo
  // nombra por su código, que acaba de nacer con el área.
  const query = modeQuery("coraje");
  query.set("vista", "redirigir");
  query.set("redirigido", result.codigoTicket ?? "1");
  if (failures.length > 0) query.set("correo", "fallido");
  // Fuera del try: redirect() funciona lanzando, y un catch lo tragaría.
  redirect(`/tickets?${query.toString()}`);
}
