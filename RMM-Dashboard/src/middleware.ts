import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/agent/"];

export async function middleware(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  if (hostname.startsWith("portal.") && pathname === "/") {
    return NextResponse.redirect(new URL("/portal", origin));
  }

  // backup.fixsmith.com.au lands on the device list, the entry point to each
  // device's backup jobs and history.
  if (hostname.startsWith("backup.") && pathname === "/") {
    return NextResponse.redirect(new URL("/devices", origin));
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const authenticated = await getSessionFromRequest(request);
  if (!authenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
