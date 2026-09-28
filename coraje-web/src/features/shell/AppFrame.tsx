import type { ReactNode } from "react";

import { StandaloneShell } from "@/design-system/patterns/app-shell/StandaloneShell";
import { ConectaShell } from "@/design-system/patterns/conecta-shell/ConectaShell";
import type { EmployeeSessionContext } from "@/server/auth/employee-session";
import { readEntryContext } from "@/server/auth/entry-cookie";
import { signOutAction } from "@/server/auth/sign-out-action";
import { resolveGrants } from "@/server/authorization/authorizer";
import { PORTAL_ACTIONS, TICKET_ACTIONS } from "@/server/authorization/catalog";

import { helpdeskSections } from "./helpdesk-sections";

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
 *
 * Las secciones con permiso cuestan dos consultas pequeñas por página
 * (`resolveGrants`: la persona y sus reglas). Se acepta: la alternativa
 * —mostrar pestañas que luego responden «no autorizado»— hace que la interfaz
 * mienta (permisos.md §4).
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
  const [entry, grants] = await Promise.all([
    readEntryContext(),
    resolveGrants(employee.idPersonal, [TICKET_ACTIONS.redirigir, PORTAL_ACTIONS.administrarAccesos]),
  ]);
  const sections = helpdeskSections({
    clasificar: grants.has(TICKET_ACTIONS.redirigir),
    administrarAccesos: grants.has(PORTAL_ACTIONS.administrarAccesos),
  });

  if (entry.via === "conecta") {
    const profile = entry.profile;
    return (
      <ConectaShell
        title={title}
        displayName={profile?.shortName ?? employee.nombreCompleto}
        subtitle={profile?.subtitle ?? null}
        sqfAccess={profile?.sqfAccess ?? false}
        moduleNav={sections}
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
      moduleNav={sections}
      signOutAction={signOutAction}
    >
      {children}
    </StandaloneShell>
  );
}
