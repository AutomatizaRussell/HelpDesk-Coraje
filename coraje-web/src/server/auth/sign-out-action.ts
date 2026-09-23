"use server";

import { redirect } from "next/navigation";

import { revokeCurrentEmployeeSession } from "./employee-session";

/**
 * Cierre de la sesión de HelpDesk, como Server Action.
 *
 * Server Action y no `<form action="/api/auth/logout">`: un `action` literal no
 * antepone el basePath de HelpDesk (D7), mientras que `redirect()` y las Server
 * Actions sí lo hacen, así que no hay que construir esa URL a mano.
 *
 * Vive aquí y no en una página porque la dispara el shell, que es el mismo en
 * todas las vistas. Solo revoca la sesión **de HelpDesk**: la de Conecta es
 * independiente (specs/acceso-empleados.md §2) y sigue abierta.
 */
export async function signOutAction() {
  await revokeCurrentEmployeeSession("LOGOUT");
  redirect("/login");
}
