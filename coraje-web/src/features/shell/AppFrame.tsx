import type { ReactNode } from "react";

import { StandaloneShell } from "@/design-system/patterns/app-shell/StandaloneShell";
import { ConectaShell } from "@/design-system/patterns/conecta-shell/ConectaShell";
import type { EmployeeSessionContext } from "@/server/auth/employee-session";
import { readEntryContext } from "@/server/auth/entry-cookie";
import { signOutAction } from "@/server/auth/sign-out-action";
import { resolveGrants } from "@/server/authorization/authorizer";
import { AVISO_ACTIONS, PORTAL_ACTIONS, SALUD_ACTIONS, TICKET_ACTIONS } from "@/server/authorization/catalog";
import { countUnreadNotices } from "@/server/notifications/ticket-notices";
import { NoticeBellMenu } from "@/features/avisos/NoticeBellMenu";
// SUPLANTACIÓN — bloque temporal para pruebas.
import { SuplantacionSelector } from "@/features/suplantacion/SuplantacionSelector";
import { getSuplantacionPanel } from "@/server/auth/suplantacion";
// FIN SUPLANTACIÓN

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
 * mienta (permisos.md §4). La campana de avisos (U15) añade un conteo; su
 * lista solo se consulta al abrirla.
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
  const [entry, grants, suplantacion] = await Promise.all([
    readEntryContext(),
    resolveGrants(employee.idPersonal, [
      TICKET_ACTIONS.redirigir,
      PORTAL_ACTIONS.administrarAccesos,
      SALUD_ACTIONS.consultar,
      AVISO_ACTIONS.consultar,
    ]),
    // SUPLANTACIÓN — bloque temporal para pruebas.
    getSuplantacionPanel(employee),
    // FIN SUPLANTACIÓN
  ]);
  // U15: el número de la campana, un conteo sobre un índice parcial. Va
  // después de los permisos porque sin `aviso.consultar` no hay campana.
  const unreadNotices = grants.has(AVISO_ACTIONS.consultar) ? await countUnreadNotices(employee.idPersonal) : null;
  const noticeBell = (anchor: "topbar" | "appBar") =>
    unreadNotices === null ? undefined : <NoticeBellMenu count={unreadNotices} anchor={anchor} />;

  const sections = helpdeskSections({
    clasificar: grants.has(TICKET_ACTIONS.redirigir),
    administrarAccesos: grants.has(PORTAL_ACTIONS.administrarAccesos),
    consultarSalud: grants.has(SALUD_ACTIONS.consultar),
  });
  // SUPLANTACIÓN — bloque temporal para pruebas. Encima del contenido y no
  // dentro de los shells: así ninguno de los dos patrones del sistema de
  // diseño cambia por algo que se retira.
  const content = (
    <>
      {suplantacion && <SuplantacionSelector panel={suplantacion} />}
      {children}
    </>
  );
  // FIN SUPLANTACIÓN

  if (entry.via === "conecta") {
    // SUPLANTACIÓN — bloque temporal. El perfil de Conecta es de quien inició
    // sesión; mientras suplanta, la barra muestra a la persona suplantada.
    const profile = employee.suplantacion ? null : entry.profile;
    // FIN SUPLANTACIÓN
    return (
      <ConectaShell
        title={title}
        displayName={profile?.shortName ?? employee.nombreCompleto}
        subtitle={profile?.subtitle ?? null}
        sqfAccess={profile?.sqfAccess ?? false}
        moduleNav={sections}
        noticeBell={noticeBell("topbar")}
        signOutAction={signOutAction}
      >
        {content}
      </ConectaShell>
    );
  }

  return (
    <StandaloneShell
      title={title}
      displayName={employee.nombreCompleto}
      moduleNav={sections}
      noticeBell={noticeBell("appBar")}
      signOutAction={signOutAction}
    >
      {content}
    </StandaloneShell>
  );
}
