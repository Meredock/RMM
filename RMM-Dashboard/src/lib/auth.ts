import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const SESSION_COOKIE = "rmm_session";
const secret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-in-prod"
);

export type Role = "ADMIN" | "TECH";
export interface SessionUser {
  username: string;
  role: Role;
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ role: user.role })
    .setSubject(user.username)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionUser(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const username = typeof payload.sub === "string" ? payload.sub : "";
    if (!username) return null;
    return { username, role: payload.role === "ADMIN" ? "ADMIN" : "TECH" };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionUser(token) : null;
}

export async function getSessionUserFromRequest(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifySessionUser(token) : null;
}

// Boolean check used by middleware (any authenticated user).
export async function getSessionFromRequest(req: NextRequest): Promise<boolean> {
  return (await getSessionUserFromRequest(req)) !== null;
}

export { SESSION_COOKIE };
