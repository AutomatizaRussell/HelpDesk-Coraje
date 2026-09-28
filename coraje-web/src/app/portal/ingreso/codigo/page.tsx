import Link from "next/link";

import { AccessPanel } from "@/design-system/patterns/access-panel/AccessPanel";
import { focusRing } from "@/design-system/recipes/interaction";
import { cn } from "@/design-system/utilities/cn";
import { VerifyCodeForm } from "@/features/portal/PortalForms";
import { OTP_TTL_MINUTES } from "@/server/portal/portal-policy";

/**
 * Segundo paso del ingreso. Pública, igual que el primero.
 *
 * El texto dice «si el correo tiene acceso» y no «te enviamos un código»: la
 * pantalla es la misma exista o no el correo (acceso-clientes.md §9). A quien
 * tiene acceso le llega el código; a quien no, nada, y la pantalla no lo
 * delata.
 */
export default function PortalCodePage() {
  return (
    <AccessPanel
      title="Revisa tu correo"
      description={`Si el correo tiene acceso al portal, te enviamos un código de seis dígitos. Vence en ${OTP_TTL_MINUTES} minutos.`}
    >
      <VerifyCodeForm />
      <p className="text-sm text-ink-muted">
        ¿No llegó? Revisa la carpeta de correo no deseado o{" "}
        <Link href="/portal/ingreso" className={cn("rounded-control font-bold text-heading underline", focusRing)}>
          pide otro código
        </Link>
        .
      </p>
    </AccessPanel>
  );
}
