import { redirect } from "next/navigation";

import { readEmployeeSession, type EmployeeSessionContext } from "./employee-session";
// SUPLANTACIÓN — bloque temporal para pruebas.
import { resolveActingEmployee } from "./suplantacion";
// FIN SUPLANTACIÓN

/**
 * Único punto de lectura de "quién hace esta petición" expuesto al resto de
 * la aplicación. Nada fuera de `src/server/auth/` debe leer la cookie de
 * sesión directamente.
 */

export async function getCurrentEmployee(): Promise<EmployeeSessionContext | null> {
  const session = await readEmployeeSession();
  if (!session) return null;
  // SUPLANTACIÓN — bloque temporal para pruebas. Es el único sitio donde la
  // suplantación entra en la aplicación: todo lo que pregunta «quién actúa»
  // pasa por aquí, así que la vista y los permisos de la persona suplantada
  // llegan a todas partes sin tocar nada más. La admisión ya la decidió la
  // sesión real, en `readEmployeeSession`.
  return resolveActingEmployee(session);
  // FIN SUPLANTACIÓN
}

/**
 * Exige sesión de empleado o redirige a `/login`, preservando el destino
 * pretendido en la propia URL de retorno (saneado en el punto de lectura de
 * `/login`, no aquí).
 */
export async function requireCurrentEmployee(
  destino?: string,
): Promise<EmployeeSessionContext> {
  const employee = await getCurrentEmployee();
  if (!employee) {
    const query = destino ? `?destino=${encodeURIComponent(destino)}` : "";
    redirect(`/login${query}`);
  }
  return employee;
}
