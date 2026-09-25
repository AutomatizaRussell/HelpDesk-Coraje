import { NextResponse } from "next/server";

import { APP_BASE_PATH } from "@/server/auth/base-path";
import { CONECTA_HOME_URL } from "@/server/auth/conecta-return";
import { revokeCurrentEmployeeSession } from "@/server/auth/employee-session";
import { ENTRY_COOKIE_NAME } from "@/server/auth/entry-cookie";

/**
 * Cierre de sesión por POST, equivalente a `signOutAction`: revoca la sesión
 * de HelpDesk y vuelve a Conecta (`conecta-return.ts`). 303 para que el
 * navegador siga con GET, no reenvíe el POST a Conecta.
 */
export async function POST() {
  await revokeCurrentEmployeeSession("LOGOUT");
  const response = NextResponse.redirect(CONECTA_HOME_URL, 303);
  // Mismo criterio que signOutAction: el próximo ingreso decide de nuevo el
  // modo de entrada (specs/integracion-conecta.md §2).
  response.cookies.delete({ name: ENTRY_COOKIE_NAME, path: APP_BASE_PATH });
  return response;
}
