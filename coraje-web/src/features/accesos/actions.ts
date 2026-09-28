"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { errorForm, invalidForm, successForm, unexpectedForm } from "@/features/forms/form-state";
import type { TicketFormState } from "@/features/tickets/action-state";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import {
  grantAccessAgain,
  grantAccessToNewContact,
  isPortalAdminError,
  reissueInvitation,
  revokeAccess,
  setReadOnly,
  type InvitationDelivery,
} from "@/server/portal/portal-invitations";

/**
 * Acciones de la consola de accesos de clientes. Cada una es un endpoint
 * alcanzable por sí mismo: exige sesión, valida con `zod`, y el servicio
 * exige `portal.acceso.administrar` antes de tocar nada.
 */

const idSchema = z.uuid({ error: "Identificador inválido." });

/** Lo que se le dice a quien emitió la invitación sobre su envío. */
function deliveryMessage(action: string, delivery: InvitationDelivery): TicketFormState {
  if (delivery.fallidos.length === 0) {
    return successForm(`${action} Invitación enviada a ${delivery.enviados.join(", ")}.`);
  }
  const warning = `La invitación no salió hacia ${delivery.fallidos.map((f) => f.correo).join(", ")}: ${delivery.fallidos[0].error} Puedes emitir otra con «Reenviar invitación».`;
  return successForm(action, warning);
}

function failed(error: unknown, formData: FormData, context: string): TicketFormState {
  if (isPortalAdminError(error)) return errorForm(error.message, formData);
  return unexpectedForm(error, formData, context);
}

// ---------------------------------------------------------------------------

const newContactSchema = z.object({
  idCliente: idSchema,
  nombre: z.string().trim().min(3, { error: "Escribe el nombre completo del contacto." }).max(200),
  correo: z.email({ error: "Escribe un correo válido." }).max(254),
});

export async function grantNewContactAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/accesos");
  const parsed = newContactSchema.safeParse({
    idCliente: formData.get("idCliente"),
    nombre: formData.get("nombre"),
    correo: String(formData.get("correo") ?? "").trim(),
  });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  let delivery: InvitationDelivery;
  try {
    ({ delivery } = await grantAccessToNewContact({ idPersonal: employee.idPersonal, ...parsed.data }));
  } catch (error) {
    return failed(error, formData, "dar de alta el contacto");
  }
  revalidatePath(`/accesos/${parsed.data.idCliente}`);
  return deliveryMessage("Contacto creado con acceso.", delivery);
}

// ---------------------------------------------------------------------------

const contactSchema = z.object({ idCliente: idSchema, idContacto: idSchema });

export async function grantAgainAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/accesos");
  const parsed = contactSchema.safeParse({ idCliente: formData.get("idCliente"), idContacto: formData.get("idContacto") });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  let delivery: InvitationDelivery;
  try {
    delivery = await grantAccessAgain({ idPersonal: employee.idPersonal, idContacto: parsed.data.idContacto });
  } catch (error) {
    return failed(error, formData, "conceder acceso de nuevo");
  }
  revalidatePath(`/accesos/${parsed.data.idCliente}`);
  return deliveryMessage("Acceso concedido de nuevo.", delivery);
}

// ---------------------------------------------------------------------------

const authorizationSchema = z.object({ idCliente: idSchema, idAutorizacion: idSchema });

export async function reissueInvitationAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/accesos");
  const parsed = authorizationSchema.safeParse({
    idCliente: formData.get("idCliente"),
    idAutorizacion: formData.get("idAutorizacion"),
  });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  let delivery: InvitationDelivery;
  try {
    delivery = await reissueInvitation({ idPersonal: employee.idPersonal, idAutorizacion: parsed.data.idAutorizacion });
  } catch (error) {
    return failed(error, formData, "reenviar la invitación");
  }
  revalidatePath(`/accesos/${parsed.data.idCliente}`);
  return deliveryMessage("Invitación nueva emitida; la anterior dejó de servir.", delivery);
}

// ---------------------------------------------------------------------------

const revokeSchema = authorizationSchema.extend({
  motivo: z.string().trim().min(5, { error: "Escribe por qué se revoca el acceso." }).max(500),
});

export async function revokeAccessAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/accesos");
  const parsed = revokeSchema.safeParse({
    idCliente: formData.get("idCliente"),
    idAutorizacion: formData.get("idAutorizacion"),
    motivo: formData.get("motivo"),
  });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  try {
    await revokeAccess({ idPersonal: employee.idPersonal, idAutorizacion: parsed.data.idAutorizacion, motivo: parsed.data.motivo });
  } catch (error) {
    return failed(error, formData, "revocar el acceso");
  }
  revalidatePath(`/accesos/${parsed.data.idCliente}`);
  return successForm("Acceso revocado. Sus navegadores ya no entran; sus tickets abiertos siguen en atención.");
}

// ---------------------------------------------------------------------------

const readOnlySchema = authorizationSchema.extend({ soloLectura: z.enum(["si", "no"]) });

export async function setReadOnlyAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/accesos");
  const parsed = readOnlySchema.safeParse({
    idCliente: formData.get("idCliente"),
    idAutorizacion: formData.get("idAutorizacion"),
    soloLectura: formData.get("soloLectura"),
  });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  const soloLectura = parsed.data.soloLectura === "si";
  try {
    await setReadOnly({ idPersonal: employee.idPersonal, idAutorizacion: parsed.data.idAutorizacion, soloLectura });
  } catch (error) {
    return failed(error, formData, "cambiar el modo de acceso");
  }
  revalidatePath(`/accesos/${parsed.data.idCliente}`);
  return successForm(soloLectura ? "El acceso quedó en solo consulta." : "El acceso puede volver a radicar tickets.");
}
