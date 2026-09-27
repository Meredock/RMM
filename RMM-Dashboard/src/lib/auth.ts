import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { verifySessionUser, SESSION_COOKIE, type SessionUser } from "./session";

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
