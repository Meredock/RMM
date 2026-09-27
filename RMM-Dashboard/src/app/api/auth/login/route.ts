import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, type SessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createRateLimiter } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/crypto";

const WINDOW_MS = 15 * 60 * 1000;
// Per-IP limit is looser so an office behind one NAT isn't locked out together;
// the per-username limit stops targeted guessing from many IPs.
const ipLimiter = createRateLimiter(20, WINDOW_MS);
const userLimiter = createRateLimiter(10, WINDOW_MS);

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const secureCookie = process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && req.nextUrl.protocol === "https:");

  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const ipKey = `ip:${clientIp(req)}`;
  const userKey = `user:${username.toLowerCase()}`;
  const limited = [ipLimiter.isBlocked(ipKey), userLimiter.isBlocked(userKey)].find((r) => r.blocked);
  if (limited) {
    return NextResponse.json(
      { error: "Too many failed login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  let user: SessionUser | null = null;
  let bootstrap = false;

  // 1. If a username is supplied, authenticate against the User table.
  if (username) {
    const record = await prisma.user.findUnique({ where: { username } });
    if (record && (await bcrypt.compare(password, record.passwordHash))) {
      user = { username: record.username, role: record.role };
    }
  }

  // 2. Otherwise fall back to the bootstrap DASHBOARD_PASSWORD, which signs in
  //    as a short-lived admin so the first admin account can be created. It is
  //    only honoured while no admin account exists.
  if (!user && process.env.DASHBOARD_PASSWORD && safeEqual(password, process.env.DASHBOARD_PASSWORD)) {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount === 0) {
      user = { username: username || "admin", role: "ADMIN" };
      bootstrap = true;
    }
  }

  if (!user) {
    ipLimiter.recordFailure(ipKey);
    userLimiter.recordFailure(userKey);
    await recordAudit(username || "(none)", "auth.login.failed", null, `ip=${clientIp(req)}`);
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  userLimiter.reset(userKey);
  const token = await signSession(user, { bootstrap });
  await recordAudit(user.username, bootstrap ? "auth.login.bootstrap" : "auth.login", null, null);

  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: "lax",
    maxAge: bootstrap ? 60 * 60 : 60 * 60 * 24 * 7,
    path: "/",
    // Host-only by default; set COOKIE_DOMAIN (e.g. ".example.com") only when you
    // need the session shared across subdomains.
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  });

  return response;
}
