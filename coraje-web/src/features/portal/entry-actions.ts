"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { errorForm, invalidForm } from "@/features/forms/form-state";
import type { TicketFormState } from "@/features/tickets/action-state";
import { PORTAL_CHALLENGE_COOKIE, PORTAL_COOKIE_PATH } from "@/server/portal/portal-cookie";
import { activateInvitation } from "@/server/portal/portal-invitations";
import { requestPortalCode, verifyPortalCode } from "@/server/portal/portal-otp";
import { OTP_TTL_MINUTES } from "@/server/portal/portal-policy";

/**
 * `ENTRADA ANÓNIMA, DECLARADA` — las tres acciones de este archivo son las
 * únicas del sistema que no exigen identidad, porque su trabajo es
 * producirla: pedir un código, verificarlo y activar una invitación. La
 * prueba del perímetro (`perimeter.test.mts`) las nombra una por una; una
 * acción anónima nueva tiene que pasar por esa lista y por esta revisión.
 *
 * Lo que las hace seguras sin sesión:
 * - no devuelven datos de nadie, y sus respuestas no distinguen si un correo
 *   tiene acceso (acceso-clientes.md §9);
 * - el secreto que validan (código de un solo uso, enlace de un solo uso)
 *   solo existe en el correo de la persona;
 * - los límites de intentos y de emisiones viven en la base, no en el
 *   navegador.
 */

const emailSchema = z.object({ correo: z.email({ error: "Escribe un correo válido." }).max(254) });

export async function requestCodeAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const parsed = emailSchema.safeParse({ correo: String(formData.get("correo") ?? "").trim() });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  let reference: string;
  try {
    reference = await requestPortalCode(parsed.data.correo);
  } catch (error) {
    console.error("[portal] Fallo inesperado al emitir un código:", error);
    return errorForm("No fue posible continuar. Intenta de nuevo en unos minutos.", formData);
  }

  (await cookies()).set(PORTAL_CHALLENGE_COOKIE, reference, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: PORTAL_COOKIE_PATH,
    // Un poco más que el código: la cookie no alarga nada, el plazo lo
    // decide la base.
    maxAge: (OTP_TTL_MINUTES + 5) * 60,
  });
  redirect("/portal/ingreso/codigo");
}

const codeSchema = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, { error: "El código tiene seis dígitos." }) });

export async function verifyCodeAction(_prev: TicketFormState, formData: FormData): Promise<TicketFormState> {
  const parsed = codeSchema.safeParse({ codigo: formData.get("codigo") });
  if (!parsed.success) return invalidForm(parsed.error, formData);

  const cookieStore = await cookies();
  const reference = cookieStore.get(PORTAL_CHALLENGE_COOKIE)?.value ?? "";
  // Sin referencia válida no hay desafío que comprobar: es lo mismo que un
  // código vencido.
  if (!z.uuid().safeParse(reference).success) {
    return errorForm("El código venció. Pide uno nuevo.", formData);
  }

  let outcome: Awaited<ReturnType<typeof verifyPortalCode>>;
  try {
    outcome = await verifyPortalCode(reference, parsed.data.codigo);
  } catch (error) {
    console.error("[portal] Fallo inesperado al verificar un código:", error);
    return errorForm("No fue posible verificar el código. Intenta de nuevo en unos minutos.", formData);
  }

  if (outcome === "INCORRECTO") return errorForm("El código no es correcto. Revisa el último correo que recibiste.", formData);
  if (outcome === "VENCIDO") return errorForm("El código venció o ya no sirve. Pide uno nuevo.", formData);

  cookieStore.delete({ name: PORTAL_CHALLENGE_COOKIE, path: PORTAL_COOKIE_PATH });
  redirect("/portal");
}

const tokenSchema = z.object({ token: z.string().trim().min(20).max(200) });

/**
 * Activa la invitación y lleva a la URL limpia del portal, sin el enlace en
 * la barra (§6, paso 5): lo que quede en el historial o en un favorito no
 * sirve para entrar.
 */
export async function activateInvitationAction(formData: FormData): Promise<void> {
  const parsed = tokenSchema.safeParse({ token: formData.get("token") });
  const ok = parsed.success ? await activateInvitation(parsed.data.token) : false;
  // Fuera de cualquier try: redirect() funciona lanzando.
  if (!ok) redirect("/portal/ingreso?enlace=invalido");
  redirect("/portal?bienvenida=1");
}
