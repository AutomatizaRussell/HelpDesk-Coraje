import Link from "next/link";

import { PortalShell } from "@/design-system/patterns/portal-shell/PortalShell";
import { buttonRecipe } from "@/design-system/recipes/button";
import { notice } from "@/design-system/recipes/surface";
import { signOutPortalAction } from "@/features/portal/actions";
import { CreatePortalTicketForm } from "@/features/portal/PortalForms";
import { requirePortalAccess } from "@/server/portal/portal-access";

/**
 * Radicar una solicitud (T1). El cliente escribe qué necesita; clasificarla
 * —área, tipo, responsable— es trabajo de la firma (T3), no suyo.
 *
 * Con acceso de solo lectura la vista no ofrece el formulario, y la acción lo
 * rechaza igual en servidor (`requirePortalWriteAccess`).
 */
export default async function NewPortalTicketPage() {
  const access = await requirePortalAccess();
  return (
    <PortalShell title="Nueva solicitud" contactName={access.nombreContacto} clientName={access.nombreCliente} signOutAction={signOutPortalAction}>
      {access.soloLectura ? (
        <div className="space-y-4">
          <p className={notice("info")}>Tu acceso es de solo consulta: no puedes radicar solicitudes nuevas.</p>
          <Link href="/portal" className={buttonRecipe({ variant: "secondary" })}>Volver a mis solicitudes</Link>
        </div>
      ) : (
        <CreatePortalTicketForm />
      )}
    </PortalShell>
  );
}
