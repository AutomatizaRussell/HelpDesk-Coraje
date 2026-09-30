"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireCurrentEmployee } from "@/server/auth/current-employee";
import { resolveGrant } from "@/server/authorization/authorizer";
import { AVISO_ACTIONS } from "@/server/authorization/catalog";
import { markAllNoveltiesRead, openNotice } from "@/server/notifications/ticket-notices";

/**
 * Acciones de los avisos (U15). Cada una es un endpoint alcanzable por sí
 * mismo: exige sesión y `aviso.consultar`, y opera solo sobre avisos de quien
 * la llama (las consultas filtran por destinatario). Un aviso ajeno responde
 * igual que uno inexistente.
 */

const idSchema = z.uuid();

/** Abre un aviso: lo marca leído y lleva a su ticket. */
export async function openNoticeAction(formData: FormData): Promise<void> {
  const employee = await requireCurrentEmployee("/avisos");
  if (!(await resolveGrant(employee.idPersonal, AVISO_ACTIONS.consultar))) redirect("/avisos");

  const parsed = idSchema.safeParse(formData.get("idAviso"));
  const idTicket = parsed.success ? await openNotice({ idPersonal: employee.idPersonal, idAviso: parsed.data }) : null;
  // `redirect` lanza: va fuera de cualquier try.
  redirect(idTicket ? `/tickets/${idTicket}` : "/avisos");
}

/** «Marcar todas como leídas»: solo las novedades. */
export async function markAllNoveltiesReadAction(): Promise<void> {
  const employee = await requireCurrentEmployee("/avisos?seccion=novedades");
  if (!(await resolveGrant(employee.idPersonal, AVISO_ACTIONS.consultar))) redirect("/avisos");
  await markAllNoveltiesRead(employee.idPersonal);
  revalidatePath("/avisos");
}
