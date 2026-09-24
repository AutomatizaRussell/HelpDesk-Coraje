import { redirectWithinApp } from "@/server/auth/app-redirect";
import { APP_BASE_PATH } from "@/server/auth/base-path";
import { revokeCurrentEmployeeSession } from "@/server/auth/employee-session";
import { ENTRY_COOKIE_NAME } from "@/server/auth/entry-cookie";

export async function POST() {
  await revokeCurrentEmployeeSession("LOGOUT");
  const response = redirectWithinApp("/login");
  // Mismo criterio que signOutAction: el próximo ingreso decide de nuevo el
  // modo de entrada (specs/integracion-conecta.md §2).
  response.cookies.delete({ name: ENTRY_COOKIE_NAME, path: APP_BASE_PATH });
  return response;
}
