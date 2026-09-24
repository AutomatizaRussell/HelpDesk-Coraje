import type { ReactNode } from "react";

import { StandaloneShell } from "@/design-system/patterns/app-shell/StandaloneShell";
import { ConectaShell } from "@/design-system/patterns/conecta-shell/ConectaShell";
import type { EmployeeSessionContext } from "@/server/auth/employee-session";
import { readEntryContext } from "@/server/auth/entry-cookie";
import { signOutAction } from "@/server/auth/sign-out-action";

import { HELPDESK_SECTIONS } from "./helpdesk-sections";

/**
 * Marco de toda vista de empleado: elige el shell según por dónde entró la
 * persona (specs/integracion-conecta.md §2) y le pasa lo que debe mostrar.
 *
 * - Entró desde Conecta → `ConectaShell`, con su nombre corto, área y
 *   permisos SQF si el perfil de Conecta coincidió con la cuenta admitida; si
 *   no, con los datos propios de HelpDesk.
 * - Entró directo → `StandaloneShell`, sin nada de Conecta.
 *
 * Recibe al empleado ya resuelto por la vista (que es quien decide qué hacer
 * sin sesión) para no releer la sesión dos veces por petición. El contexto de
 * entrada es una cookie sellada: leerla no cuesta ninguna consulta.
 */
export async function AppFrame({
  employee,
  title,
  children,
}: {
  employee: EmployeeSessionContext;
  title: string;
  children: ReactNode;
}) {
  const entry = await readEntryContext();

  if (entry.via === "conecta") {
    const profile = entry.profile;
    return (
      <ConectaShell
        title={title}
        displayName={profile?.shortName ?? employee.nombreCompleto}
        subtitle={profile?.subtitle ?? null}
        sqfAccess={profile?.sqfAccess ?? false}
        moduleNav={HELPDESK_SECTIONS}
        signOutAction={signOutAction}
      >
        {children}
      </ConectaShell>
    );
  }

  return (
    <StandaloneShell
      title={title}
      displayName={employee.nombreCompleto}
      moduleNav={HELPDESK_SECTIONS}
      signOutAction={signOutAction}
    >
      {children}
    </StandaloneShell>
  );
}
