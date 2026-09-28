import { redirect } from "next/navigation";

import { AccessPanel } from "@/design-system/patterns/access-panel/AccessPanel";
import { notice } from "@/design-system/recipes/surface";
import { RequestCodeForm } from "@/features/portal/PortalForms";
import { resolvePortalAccess } from "@/server/portal/portal-access";

/**
 * Ingreso al portal con correo y código (acceso-clientes.md §6). Pública:
 * es donde se produce la identidad. Quien ya tiene un navegador recordado y
 * vivo pasa directo a sus tickets.
 *
 * Mensajes de código cerrado, como en `/login`: un parámetro desconocido no
 * imprime nada, y ninguno dice si un correo o un enlace existían.
 */
const MESSAGES: Record<string, { tone: "info" | "warning"; text: string }> = {
  invalido: {
    tone: "warning",
    text: "Ese enlace ya no sirve. Si ya activaste tu acceso, entra con tu correo; si no, pide una invitación nueva a tu contacto en Russell Bedford.",
  },
  salida: { tone: "info", text: "Cerraste la sesión en este navegador." },
};

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ enlace?: string; salida?: string }>;
}) {
  if (await resolvePortalAccess()) redirect("/portal");
  const params = await searchParams;
  const message = params.enlace ? MESSAGES[params.enlace] : params.salida ? MESSAGES.salida : undefined;

  return (
    <AccessPanel title="Portal de clientes" description="Escribe tu correo y te enviaremos un código para entrar.">
      {message && <p className={notice(message.tone)}>{message.text}</p>}
      <RequestCodeForm />
    </AccessPanel>
  );
}
