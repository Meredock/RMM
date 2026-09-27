// Session token logic with no Next.js imports, so the custom server (WebSocket
// relay) can use it before Next.js has booted.
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import { getJwtSecretKey } from "./secret";

export const SESSION_COOKIE = "rmm_session";
const SESSION_TTL = "7d";
// Bootstrap (DASHBOARD_PASSWORD) sessions exist only to create the first admin,
// so they are short-lived.
const BOOTSTRAP_TTL = "1h";

export type Role = "ADMIN" | "TECH";
export interface SessionUser {
  username: string;
  role: Role;
}

export interface SessionClaims {
  username: string;
  bootstrap: boolean;
  issuedAt: number; // seconds since epoch
}

export async function signSession(user: SessionUser, opts: { bootstrap?: boolean } = {}): Promise<string> {
  const jwt = new SignJWT({ role: user.role, ...(opts.bootstrap ? { bootstrap: true } : {}) })
    .setSubject(user.username)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts.bootstrap ? BOOTSTRAP_TTL : SESSION_TTL);
  return jwt.sign(getJwtSecretKey());
}

// verifySessionToken checks the token's signature and expiry only.
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    const username = typeof payload.sub === "string" ? payload.sub : "";
    if (!username || typeof payload.iat !== "number") return null;
    return { username, bootstrap: payload.bootstrap === true, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

export interface SessionStore {
  findUser(username: string): Promise<{ role: Role; updatedAt: Date } | null>;
  countAdmins(): Promise<number>;
}

// resolveSession turns verified claims into the current user, using the
// database as the source of truth so that deleting a user, changing their role
// or resetting their password takes effect immediately rather than when the
// token expires.
export async function resolveSession(claims: SessionClaims, store: SessionStore): Promise<SessionUser | null> {
  if (claims.bootstrap) {
    // Valid only until a real admin account exists.
    return (await store.countAdmins()) === 0 ? { username: claims.username, role: "ADMIN" } : null;
  }
  const user = await store.findUser(claims.username);
  if (!user) return null;
  // Any change to the user row (password, role) invalidates tokens issued before it.
  if (claims.issuedAt < Math.floor(user.updatedAt.getTime() / 1000)) return null;
  return { username: claims.username, role: user.role };
}

const prismaStore: SessionStore = {
  findUser: (username) =>
    prisma.user.findUnique({ where: { username }, select: { role: true, updatedAt: true } }),
  countAdmins: () => prisma.user.count({ where: { role: "ADMIN" } }),
};

export async function verifySessionUser(token: string): Promise<SessionUser | null> {
  const claims = await verifySessionToken(token);
  return claims ? resolveSession(claims, prismaStore) : null;
}
