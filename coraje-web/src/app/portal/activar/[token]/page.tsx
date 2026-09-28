import type { Metadata } from "next";
import Link from "next/link";

import { AccessPanel } from "@/design-system/patterns/access-panel/AccessPanel";
import { buttonRecipe } from "@/design-system/recipes/button";
import { activateInvitationAction } from "@/features/portal/entry-actions";
import { inspectInvitation } from "@/server/portal/portal-invitations";

/**
 * Enlace de invitación (acceso-clientes.md §6). Pública: el enlace es la
 * credencial.
 *
 * **Abrir la página no activa nada.** Los filtros de correo abren cada enlace
 * antes que la persona, y si el GET consumiera la invitación, el cliente
 * encontraría su enlace ya gastado por una máquina. La activación es el botón,
 * que envía un POST (`activateInvitationAction`).
 *
 * `referrer: no-referrer`: la URL lleva el secreto, y no debe viajar en la
 * cabecera Referer a ningún otro sitio.
 */
export const metadata: Metadata = { referrer: "no-referrer" };

export default async function ActivateInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await inspectInvitation(token);

  if (invitation.kind === "PENDIENTE") {
    return (
      <AccessPanel
        title={`Hola, ${invitation.nombreContacto}`}
        description={`Tu acceso al portal de tickets como contacto de ${invitation.nombreCliente} está listo.`}
      >
        <p className="text-base text-ink">
          Al activarlo, este navegador queda recordado. Desde otro navegador podrás entrar con tu correo y un código.
        </p>
        <form action={activateInvitationAction}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className={buttonRecipe({ size: "lg", fullWidth: true })}>
            Activar mi acceso
          </button>
        </form>
      </AccessPanel>
    );
  }

  return (
    <AccessPanel
      title={invitation.kind === "USADA" ? "Este enlace ya se usó" : "Este enlace ya no sirve"}
      description={
        invitation.kind === "USADA"
          ? "Tu acceso ya está activo. Entra con tu correo y te enviaremos un código."
          : "Pide una invitación nueva a tu contacto en Russell Bedford, o entra con tu correo si ya activaste tu acceso."
      }
    >
      <Link href="/portal/ingreso" className={buttonRecipe({ size: "lg", fullWidth: true })}>
        Entrar con mi correo
      </Link>
    </AccessPanel>
  );
}
