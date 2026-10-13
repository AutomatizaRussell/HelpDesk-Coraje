import { NextResponse, type NextRequest } from "next/server";

import { APP_BASE_PATH } from "@/server/auth/base-path";
import { signOutDestination } from "@/server/auth/conecta-return";
import { revokeCurrentEmployeeSession } from "@/server/auth/employee-session";
import { ENTRY_COOKIE_NAME } from "@/server/auth/entry-cookie";

/**
 * Cierre de sesión por POST, equivalente a `signOutAction`: revoca la sesión
 * de HelpDesk y vuelve a Conecta, o al ingreso del dominio directo si se entró
 * por él (`signOutDestination`). 303 para que el navegador siga con GET y no
 * reenvíe el POST.
 */
export async function POST(request: NextRequest) {
  await revokeCurrentEmployeeSession("LOGOUT");
  const response = NextResponse.redirect(signOutDestination(request.headers), 303);
  // Mismo criterio que signOutAction: el próximo ingreso decide de nuevo el
  // modo de entrada (specs/integracion-conecta.md §2).
  response.cookies.delete({ name: ENTRY_COOKIE_NAME, path: APP_BASE_PATH });
  return response;
}
