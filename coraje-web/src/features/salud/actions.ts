"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { errorForm, invalidForm, successForm, unexpectedForm } from "@/features/forms/form-state";
import type { TicketFormState } from "@/features/tickets/action-state";
import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { isHealthActionError, markDivergenceReviewed } from "@/server/health/health-commands";

/**
 * Acción de la vista `/salud`. Es un endpoint alcanzable por sí mismo: exige
 * sesión, valida con `zod`, y el servicio exige `salud.divergencia.revisar`
 * antes de escribir.
 */

const reviewSchema = z.object({
  idDivergencia: z.uuid({ error: "Identificador inválido." }),
  // Los mismos límites que helpdesk.marcar_divergencia_revisada.
  motivo: z
    .string()
    .trim()
    .min(5, { error: "Escribe qué se hizo o por qué no hace falta hacer nada (mínimo 5 caracteres)." })
    .max(500, { error: "Máximo 500 caracteres." }),
});

export async function reviewDivergenceAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const employee = await requireCurrentEmployee("/salud");
  const parsed = reviewSchema.safeParse({ idDivergencia: formData.get("idDivergencia"), motivo: formData.get("motivo") });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  try {
    await markDivergenceReviewed({ idPersonal: employee.idPersonal, ...parsed.data });
  } catch (error) {
    if (isHealthActionError(error)) return errorForm(error.message, formData);
    return unexpectedForm(error, formData, "revisar la divergencia");
  }
  revalidatePath("/salud");
  return successForm("Divergencia marcada como revisada.");
}
