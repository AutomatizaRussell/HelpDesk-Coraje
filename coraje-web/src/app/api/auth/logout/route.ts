import { NextRequest, NextResponse } from "next/server";

import { revokeCurrentEmployeeSession } from "@/server/auth/employee-session";

export async function POST(request: NextRequest) {
  await revokeCurrentEmployeeSession("LOGOUT");
  return NextResponse.redirect(new URL("/login", request.url));
}
