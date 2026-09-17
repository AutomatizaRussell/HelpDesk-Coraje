import { NextRequest, NextResponse } from "next/server";

import { buildAppUrl } from "@/server/auth/base-path";
import { revokeCurrentEmployeeSession } from "@/server/auth/employee-session";

export async function POST(request: NextRequest) {
  await revokeCurrentEmployeeSession("LOGOUT");
  return NextResponse.redirect(buildAppUrl("/login", request.url));
}
