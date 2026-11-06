import type { ReactNode } from "react";

import { StandaloneShell } from "@/design-system/patterns/app-shell/StandaloneShell";
import { ConectaShell } from "@/design-system/patterns/conecta-shell/ConectaShell";
import { ToastProvider } from "@/design-system/patterns/toast/Toaster";
import type { EmployeeSessionContext } from "@/server/auth/employee-session";
import { readEntryContext } from "@/server/auth/entry-cookie";
import { signOutAction } from "@/server/auth/sign-out-action";
import { resolveGrants } from "@/server/authorization/authorizer";
import { AVISO_ACTIONS, INDICADORES_ACTIONS, SALUD_ACTIONS } from "@/server/authorization/catalog";
import { countBellNotices } from "@/server/notifications/ticket-notices";
import { getPersonAreaName } from "@/server/personal/person-area";
import { getModeAccess } from "@/server/tickets/mode-access";
import type { TicketMode } from "@/server/tickets/ticket-mode";
import { areaThemeKey } from "@/features/areas/area-theme";
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
 * - Entró desde Conecta → `ConectaShell`, con su nombre corto y sus módulos
 *   de Conecta si el perfil de Conecta coincidió con la cuenta admitida; si
 *   no, con los datos propios de HelpDesk y el menú mínimo.
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
 *
 * `mode` (U17) lo decide la vista: la bandeja, por la URL; el detalle, por el
 * ticket; los accesos de clientes son siempre Externo. El interruptor de modo
 * vive en la bandeja desde U32 (`InboxModeSwitch`).
 */
export async function AppFrame({
  employee,
  title,
  mode = "interno",
  hero,
  children,
}: {
  employee: EmployeeSessionContext;
  title: string;
  mode?: TicketMode;
  /**
   * Cabecera de ancho completo de la vista (U30, la del área en la bandeja).
   * Es una función porque necesita el área de quien entra, que este marco ya
   * consulta para el color: así la vista no la vuelve a pedir.
   */
  hero?: (context: { areaName: string | null }) => ReactNode;
  children: ReactNode;
}) {
  const [entry, grants, modeAccess, areaName, suplantacion] = await Promise.all([
    readEntryContext(),
    resolveGrants(employee.idPersonal, [SALUD_ACTIONS.consultar, AVISO_ACTIONS.consultar, INDICADORES_ACTIONS.ver]),
    getModeAccess(employee.idPersonal),
    // U16: el color de la interfaz sigue el área de quien entra.
    getPersonAreaName(employee.idPersonal),
    // SUPLANTACIÓN — bloque temporal para pruebas.
    getSuplantacionPanel(employee),
    // FIN SUPLANTACIÓN
  ]);
  // U15: el número de la campana, dos conteos sobre índices parciales. Va
  // después de los permisos porque sin `aviso.consultar` no hay campana.
  // El interruptor de modo ya no es del marco (U32): va en la bandeja
  // (`InboxModeSwitch`), que es donde cambia algo.
  const bellCount = grants.has(AVISO_ACTIONS.consultar) ? await countBellNotices(employee.idPersonal) : null;
  // La campana es la misma en los dos modos; «Ver todos» deja en el modo actual.
  const noticeBell = (anchor: "topbar" | "appBar") =>
    bellCount === null ? undefined : (
      <NoticeBellMenu count={bellCount} anchor={anchor} allHref={mode === "externo" ? "/avisos?modo=externo" : "/avisos"} />
    );

  const areaTheme = areaThemeKey(areaName);
  const heroNode = hero?.({ areaName });

  const sections = helpdeskSections(mode, {
    administrarAccesos: modeAccess.administrarAccesos,
    consultarSalud: grants.has(SALUD_ACTIONS.consultar),
    verIndicadores: grants.has(INDICADORES_ACTIONS.ver),
  });
  // SUPLANTACIÓN — bloque temporal para pruebas. Encima del contenido y no
  // dentro de los shells: así ninguno de los dos patrones del sistema de
  // diseño cambia por algo que se retira.
  // U29: los toasts de toda vista de empleado salen de aquí.
  const content = (
    <ToastProvider>
      {suplantacion && <SuplantacionSelector panel={suplantacion} />}
      {children}
    </ToastProvider>
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
        conectaModules={profile?.modules ?? []}
        moduleNav={sections}
        areaTheme={areaTheme}
        mode={mode}
        moduleName="HelpDesk"
        noticeBell={noticeBell("topbar")}
        hero={heroNode}
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
      areaTheme={areaTheme}
      mode={mode}
      noticeBell={noticeBell("appBar")}
      hero={heroNode}
      signOutAction={signOutAction}
    >
      {content}
    </StandaloneShell>
  );
}
