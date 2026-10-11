import { NextResponse, type NextRequest } from "next/server";
import { accessConfigFromEnv, checkAccess } from "@/lib/access";

export function proxy(request: NextRequest) {
  const decision = checkAccess(request.nextUrl.pathname, request.headers.get("tailscale-user-login"), accessConfigFromEnv());
  if (!decision.allowed) {
    return new NextResponse(decision.reason, { status: decision.status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
