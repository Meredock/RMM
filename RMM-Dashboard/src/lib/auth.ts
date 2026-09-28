import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  verifySessionUser,
  signSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  BOOTSTRAP_MAX_AGE_SEC,
  type SessionUser,
} from "./session";

export {
  SESSION_COOKIE,
  signSession,
  verifySessionToken,
  verifySessionUser,
  resolveSession,
  type Role,
  type SessionUser,
  type SessionClaims,
  type SessionStore,
} from "./session";

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionUser(token) : null;
}

export async function getSessionUserFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifySessionUser(token) : null;
}

// Boolean check used by the proxy (any authenticated user).
export async function getSessionFromRequest(req: NextRequest): Promise<boolean> {
  return (await getSessionUserFromRequest(req)) !== null;
}

// issueSession signs a session for user and sets it as the session cookie on res.
export async function issueSession(
  req: NextRequest,
  res: NextResponse,
  user: SessionUser,
  opts: { bootstrap?: boolean } = {}
) {
  const token = await signSession(user, opts);
  const secure = process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && req.nextUrl.protocol === "https:");
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: opts.bootstrap ? BOOTSTRAP_MAX_AGE_SEC : SESSION_MAX_AGE_SEC,
    path: "/",
    // Host-only by default; set COOKIE_DOMAIN (e.g. ".example.com") only when you
    // need the session shared across subdomains.
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  });
}
