import Link from "next/link";

import { sanitizeDestination } from "@/server/auth/sanitize-destination";

/**
 * Pantalla de acceso. Sin estilo propio a propósito: el contrato de diseño
 * de HelpDesk todavía no existe como código (docs/design/sistema-helpdesk.md),
 * y esa es la unidad que lo construye (U5) — no esta. Renderizar sin tokens
 * inventados es más honesto que quemar valores visuales locales que la
 * regla dura del proyecto prohíbe.
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
    <main>
      <h1>HelpDesk</h1>
      {message ? <p role="alert">{message}</p> : null}
      {/* prefetch={false}: esta ruta no es de solo lectura — dispara el
          flujo de login (crea cookie de estado, redirige a Microsoft). Un
          prefetch al pasar el mouse lo activaría sin que la persona
          hiciera clic. Link (no <a>) para que anteponga el basePath de
          HelpDesk (next.config.ts) sin tenerlo que hacer a mano aquí. */}
      <Link href={startUrl} prefetch={false}>
        Continuar con Microsoft
      </Link>
    </main>
  );
}
