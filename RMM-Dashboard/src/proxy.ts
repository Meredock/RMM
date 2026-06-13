import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/agent/"];

async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;
  const hostname = request.headers.get("host") ?? "";

  // portal.fixsmith.com.au root → send to portal page
  if (hostname.startsWith("portal.") && pathname === "/") {
    return NextResponse.redirect(new URL("/portal", origin));
  }

  // Allow agent API routes and auth routes without session
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Protect all other routes
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

export default proxy;
export { proxy };

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
