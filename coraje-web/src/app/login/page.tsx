import Link from "next/link";

import { BrandLogo } from "@/design-system/components/BrandLogo";
import { BrandStripe } from "@/design-system/components/BrandStripe";
import { buttonRecipe } from "@/design-system/recipes/button";
import { sanitizeDestination } from "@/server/auth/sanitize-destination";

/**
 * Pantalla de acceso. Superficie pública y sobria (design/sistema-helpdesk.md
 * §6): logotipo oficial con su espacio libre, una sola acción explícita y
 * ninguna activación automática. Se dibuja sin el shell de Conecta porque
 * quien llega aquí todavía no tiene sesión que mostrar.
 *
 * Código de error cerrado (specs/acceso-empleados.md §8): un parámetro
 * desconocido no imprime nada. Un enlace fabricado no puede poner texto
 * propio en esta pantalla.
 */
const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_INVALID: "La cuenta de Microsoft no tiene un correo corporativo válido.",
  NOT_REGISTERED:
    "Esta cuenta no está registrada en el directorio de HelpDesk. Solicita el alta.",
  INACTIVE: "Esta cuenta está desactivada en el directorio de HelpDesk.",
  UNKNOWN_ROLE:
    "Esta cuenta no tiene un rol asignado en HelpDesk. Solicita el alta.",
  STATE_MISSING: "La sesión de ingreso expiró. Intenta de nuevo.",
  STATE_INVALID: "La sesión de ingreso no es válida. Intenta de nuevo.",
  STATE_MISMATCH: "La sesión de ingreso no coincide. Intenta de nuevo.",
  PROVIDER_ERROR: "Microsoft no pudo completar el ingreso. Intenta de nuevo.",
  VALIDATION_FAILED: "No se pudo validar el ingreso. Intenta de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; destino?: string }>;
}) {
  const params = await searchParams;
  const message = params.error ? ERROR_MESSAGES[params.error] : undefined;
  const destino = sanitizeDestination(params.destino);
  const startUrl = `/api/auth/microsoft/start?destino=${encodeURIComponent(destino)}&silent=0`;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-access-panel overflow-hidden rounded-surface border border-line bg-surface">
        <div className="flex justify-center border-b border-line">
          <BrandLogo placement="access" />
        </div>

        <div className="space-y-5 px-8 py-8">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-heading">Ingreso a HelpDesk</h1>
            <p className="text-ink-muted">Usa tu cuenta corporativa de Microsoft.</p>
          </div>

          {message ? (
            <p
              role="alert"
              className="rounded-control border border-danger/30 bg-danger-surface px-3 py-2 text-sm text-danger"
            >
              {message}
            </p>
          ) : null}

          {/* prefetch={false}: esta ruta no es de solo lectura — dispara el
              flujo de login (crea cookie de estado, redirige a Microsoft). Un
              prefetch al pasar el mouse lo activaría sin que la persona
              hiciera clic. Link (no <a>) para que anteponga el basePath de
              HelpDesk (next.config.ts) sin tenerlo que hacer a mano aquí. */}
          <Link href={startUrl} prefetch={false} className={buttonRecipe({ size: "lg", fullWidth: true })}>
            Continuar con Microsoft
          </Link>
        </div>

        <BrandStripe />
      </div>
    </main>
  );
}
