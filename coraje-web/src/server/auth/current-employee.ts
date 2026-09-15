import { redirect } from "next/navigation";

import { readEmployeeSession, type EmployeeSessionContext } from "./employee-session";

/**
 * Único punto de lectura de "quién hace esta petición" expuesto al resto de
 * la aplicación. Nada fuera de `src/server/auth/` debe leer la cookie de
 * sesión directamente.
 */

export async function getCurrentEmployee(): Promise<EmployeeSessionContext | null> {
  return readEmployeeSession();
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
