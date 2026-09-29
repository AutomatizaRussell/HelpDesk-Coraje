import { prisma } from "@/lib/prisma";

import { evaluateAdmissionRules } from "./employee-admission";
import type { EmployeeSessionContext } from "./employee-session";

/**
 * SUPLANTACIÓN — bloque temporal para pruebas. Se retira antes de que
 * HelpDesk sea la herramienta de trabajo de cualquier área; los pasos están en
 * docs/estado/operacion.md, «Suplantación para pruebas».
 *
 * Una persona habilitada a mano (`app.suplantacion_habilitada`, por psql)
 * trabaja como otro empleado sin salir de su sesión de Microsoft: recibe su
 * vista y sus permisos, porque todo lo que pregunta «quién actúa» recibe a la
 * persona suplantada. Concepto de Impulsa (`src/server/dev-impersonation/`),
 * con dos diferencias aceptadas por el usuario el 29-sep-2026:
 *
 * - **Vive en producción.** Impulsa la apaga ahí; HelpDesk no tiene otro
 *   entorno.
 * - **Cualquier empleado admisible es destino**, incluido un `ADMIN`. Impulsa
 *   excluye a Admin porque sus testers se habilitan desde la aplicación y un
 *   Admin suplantado podría habilitar a otros; aquí la habilitación solo
 *   existe por psql, así que ese camino no existe.
 *
 * Lo que no cambia: el ingreso sigue siendo el federado y la admisión la
 * decide la sesión real (`readEmployeeSession`). Este módulo no lee la cookie:
 * recibe la sesión ya leída, y el único punto que lo invoca es
 * `current-employee.ts`.
 *
 * Los correos que genera una acción hecha suplantando salen del buzón de la
 * persona real y llegan solo a ella (`ticket-notifications.ts`): el suplantado
 * casi nunca ha dado permiso de correo, y una prueba no debe llegar a un
 * compañero ni a un cliente.
 */

/**
 * Un destino tiene que ser admisible: activo y con rol. Sin rol, el
 * autorizador no concede nada y la aplicación se vería vacía, que no prueba
 * nada. Es la misma regla de la entrada, no una restricción nueva.
 */
function isAdmissibleTarget(row: Parameters<typeof evaluateAdmissionRules>[0]): boolean {
  return evaluateAdmissionRules(row).allowed;
}

const TARGET_SELECT = {
  idPersonal: true,
  nombreCompleto: true,
  estadoActivo: true,
  rolAplicacion: true,
  esResponsableHistoricoNoIdentificado: true,
} as const;

async function isEnabled(idPersonalReal: string): Promise<boolean> {
  const row = await prisma.suplantacionHabilitada.findUnique({
    where: { idPersonal: idPersonalReal },
    select: { idPersonal: true },
  });
  return row !== null;
}

/**
 * Devuelve a quién actúa la petición: la persona suplantada si la sesión
 * suplanta a alguien, o la propia sesión si no.
 *
 * Se evalúa en **cada petición**, como la admisión: si se retira la
 * habilitación o la persona suplantada pierde el rol, la suplantación termina
 * en la siguiente navegación. Ante cualquier duda devuelve la identidad real:
 * el fallo va siempre hacia quien inició sesión.
 */
export async function resolveActingEmployee(owner: EmployeeSessionContext): Promise<EmployeeSessionContext> {
  const active = await prisma.suplantacionActiva.findUnique({
    where: { idSesion: owner.idSesion },
    select: { suplantado: { select: TARGET_SELECT } },
  });
  if (!active) return owner;
  if (!(await isEnabled(owner.idPersonal))) return owner;

  const target = active.suplantado;
  if (target.esResponsableHistoricoNoIdentificado || target.idPersonal === owner.idPersonal) return owner;
  const admission = evaluateAdmissionRules(target);
  if (!admission.allowed) return owner;

  return {
    idPersonal: admission.employee.idPersonal,
    nombreCompleto: admission.employee.nombreCompleto,
    rolAplicacion: admission.employee.rolAplicacion,
    idSesion: owner.idSesion,
    suplantacion: { idPersonalReal: owner.idPersonal, nombreReal: owner.nombreCompleto },
  };
}

export interface SuplantacionOption {
  idPersonal: string;
  nombreCompleto: string;
  rolAplicacion: string;
}

export interface SuplantacionPanel {
  idPersonalReal: string;
  nombreReal: string;
  /** A quién mira la sesión ahora; igual al real cuando no suplanta. */
  idPersonalActivo: string;
  opciones: SuplantacionOption[];
}

/**
 * Datos del selector, o `null` para la inmensa mayoría de sesiones, que no
 * están habilitadas. Ocultar el selector no es el control: el cambio vuelve a
 * comprobarlo todo en servidor.
 *
 * La lista sale filtrada de la base (activas, con rol, sin el marcador
 * histórico de F10): son pocas decenas de filas y el filtro usa las mismas
 * columnas que la admisión.
 */
export async function getSuplantacionPanel(employee: EmployeeSessionContext): Promise<SuplantacionPanel | null> {
  const idPersonalReal = employee.suplantacion?.idPersonalReal ?? employee.idPersonal;
  if (!(await isEnabled(idPersonalReal))) return null;

  const opciones = await prisma.dimPersonal.findMany({
    where: { estadoActivo: true, rolAplicacion: { not: null }, esResponsableHistoricoNoIdentificado: false },
    orderBy: { nombreCompleto: "asc" },
    select: { idPersonal: true, nombreCompleto: true, rolAplicacion: true },
  });

  return {
    idPersonalReal,
    nombreReal: employee.suplantacion?.nombreReal ?? employee.nombreCompleto,
    idPersonalActivo: employee.idPersonal,
    opciones: opciones.flatMap((row) => (row.rolAplicacion ? [{ ...row, rolAplicacion: row.rolAplicacion }] : [])),
  };
}

export type SuplantacionChange = { ok: true; message: string } | { ok: false; message: string };

/**
 * Cambia a quién mira la sesión, o vuelve a la identidad real
 * (`idDestino` igual al real). Comprueba en servidor, en este orden, que la
 * persona real esté habilitada y que el destino sea admisible. Cada cambio,
 * incluido el regreso, se audita en la misma transacción que lo aplica: sin
 * auditoría no hay cambio.
 */
export async function changeSuplantacion(employee: EmployeeSessionContext, idDestino: string): Promise<SuplantacionChange> {
  const idPersonalReal = employee.suplantacion?.idPersonalReal ?? employee.idPersonal;
  const nombreReal = employee.suplantacion?.nombreReal ?? employee.nombreCompleto;
  if (!(await isEnabled(idPersonalReal))) {
    return { ok: false, message: "Tu usuario no está habilitado para trabajar como otra persona." };
  }

  if (idDestino === idPersonalReal) {
    await prisma.$transaction([
      prisma.suplantacionActiva.deleteMany({ where: { idSesion: employee.idSesion } }),
      prisma.suplantacionAuditoria.create({
        data: { idSesion: employee.idSesion, idPersonalReal, idPersonalSuplantado: null },
      }),
    ]);
    return { ok: true, message: `Volviste a tu usuario, ${nombreReal}.` };
  }

  const target = await prisma.dimPersonal.findUnique({ where: { idPersonal: idDestino }, select: TARGET_SELECT });
  if (!target || target.esResponsableHistoricoNoIdentificado || !isAdmissibleTarget(target)) {
    return { ok: false, message: "Esa persona no está activa o no tiene rol en HelpDesk." };
  }

  await prisma.$transaction([
    prisma.suplantacionActiva.upsert({
      where: { idSesion: employee.idSesion },
      create: { idSesion: employee.idSesion, idPersonalSuplantado: target.idPersonal },
      update: { idPersonalSuplantado: target.idPersonal, iniciadaAt: new Date() },
    }),
    prisma.suplantacionAuditoria.create({
      data: { idSesion: employee.idSesion, idPersonalReal, idPersonalSuplantado: target.idPersonal },
    }),
  ]);
  return { ok: true, message: `Ahora trabajas como ${target.nombreCompleto}.` };
}
