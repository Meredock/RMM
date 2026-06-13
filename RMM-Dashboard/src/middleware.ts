import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "rmm_session";
const PUBLIC_PATHS = ["/login", "/_next", "/favicon.ico", "/api/auth/login"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET ?? "fallback-dev-secret-change-in-prod"
    );
    await jwtVerify(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname, origin } = req.nextUrl;
  const hostname = req.headers.get("host") ?? "";

  // portal.fixsmith.com.au → redirect / to /portal
  if (hostname.startsWith("portal.") && pathname === "/") {
    return NextResponse.redirect(new URL("/portal", origin));
  }

  // Let public paths and all non-auth API routes through
  if (isPublic(pathname) || pathname.startsWith("/api/agent/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const valid = token ? await verifyToken(token) : false;

  if (!valid) {
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
