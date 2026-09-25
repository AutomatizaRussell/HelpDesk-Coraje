"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { APP_BASE_PATH } from "./base-path";
import { CONECTA_HOME_URL } from "./conecta-return";
import { revokeCurrentEmployeeSession } from "./employee-session";
import { ENTRY_COOKIE_NAME } from "./entry-cookie";

/**
 * Cierre de la sesión de HelpDesk, como Server Action.
 *
 * Server Action y no `<form action="/api/auth/logout">`: un `action` literal no
 * antepone el basePath de HelpDesk (D7), mientras que `redirect()` y las Server
 * Actions sí lo hacen, así que no hay que construir esa URL a mano.
 *
 * Vive aquí y no en una página porque la dispara el shell, que es el mismo en
 * todas las vistas. Solo revoca la sesión **de HelpDesk**: la de Conecta es
 * independiente (specs/acceso-empleados.md §2) y sigue abierta. Borra también
 * el contexto de entrada: el próximo ingreso vuelve a decidir si llega desde
 * Conecta o directo (specs/integracion-conecta.md §2).
 *
 * Termina en Conecta, no en `/login` (`conecta-return.ts`).
 */
export async function signOutAction() {
  await revokeCurrentEmployeeSession("LOGOUT");
  (await cookies()).delete({ name: ENTRY_COOKIE_NAME, path: APP_BASE_PATH });
  redirect(CONECTA_HOME_URL);
}
