"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { errorForm, invalidForm, successForm, unexpectedForm } from "@/features/forms/form-state";
import type { TicketFormState } from "@/features/tickets/action-state";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { changeSuplantacion } from "@/server/auth/suplantacion";

/**
 * SUPLANTACIÓN — bloque temporal para pruebas.
 *
 * Endpoint alcanzable por sí mismo: exige sesión y valida la entrada, y deja
 * todas las comprobaciones —habilitación de la persona real, destino
 * admisible— al servicio. Aquí no puede quedar ninguna condición.
 */

const changeSchema = z.object({
  idPersonal: z.uuid({ error: "Elige una persona de la lista." }),
});

export async function changeSuplantacionAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee();
  const parsed = changeSchema.safeParse({ idPersonal: formData.get("idPersonal") });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  try {
    const result = await changeSuplantacion(employee, parsed.data.idPersonal);
    if (!result.ok) return errorForm(result.message, formData);
    // Todo cambia de dueño: la bandeja, las pestañas y los permisos de cada
    // vista. Se revalida el layout completo, no solo la ruta actual.
    revalidatePath("/", "layout");
    return successForm(result.message);
  } catch (error) {
    return unexpectedForm(error, formData, "cambiar de persona");
  }
}
