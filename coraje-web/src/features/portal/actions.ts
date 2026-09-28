"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { errorForm, invalidForm, unexpectedForm } from "@/features/forms/form-state";
import type { TicketFormState } from "@/features/tickets/action-state";
import { PortalReadOnlyError, requirePortalWriteAccess, signOutPortalDevice } from "@/server/portal/portal-access";
import { createPortalTicket } from "@/server/tickets/ticket-commands";
import { isTicketDomainError } from "@/server/tickets/ticket-errors";

/**
 * Acciones del portal que exigen un acceso vivo. El contacto y el cliente
 * salen siempre del acceso resuelto en servidor, nunca del formulario.
 */

const MAX_TEXT = 10_000;

const createSchema = z.object({
  descripcion: z
    .string()
    .trim()
    .min(10, { error: "Cuéntanos un poco más: al menos 10 caracteres." })
    .max(MAX_TEXT, { error: `La descripción no puede superar ${MAX_TEXT.toLocaleString("es-CO")} caracteres.` }),
});

export async function createPortalTicketAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  // Sin acceso, requirePortalWriteAccess redirige al ingreso. Solo lectura se
  // rechaza aquí, en servidor, aunque la vista no ofrezca el botón.
  let access: Awaited<ReturnType<typeof requirePortalWriteAccess>>;
  try {
    access = await requirePortalWriteAccess();
  } catch (error) {
    if (error instanceof PortalReadOnlyError) return errorForm(error.message, formData);
    throw error;
  }

  const parsed = createSchema.safeParse({ descripcion: formData.get("descripcion") });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  let idTicket: string;
  try {
    ({ idTicket } = await createPortalTicket({ access, descripcion: parsed.data.descripcion }));
  } catch (error) {
    if (isTicketDomainError(error)) return errorForm(error.message, formData);
    return unexpectedForm(error, formData, "radicar desde el portal");
  }

  revalidatePath("/portal");
  redirect(`/portal/tickets/${idTicket}?radicado=1`);
}

export async function signOutPortalAction(): Promise<void> {
  await signOutPortalDevice();
  redirect("/portal/ingreso?salida=1");
}
