import { redirectWithinApp } from "@/server/auth/app-redirect";
import { revokeCurrentEmployeeSession } from "@/server/auth/employee-session";

export async function POST() {
  await revokeCurrentEmployeeSession("LOGOUT");
  return redirectWithinApp("/login");
}
