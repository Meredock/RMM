import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { issueSession, type SessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { createRateLimiter } from "@/lib/rate-limit";
import { decryptSecret, safeEqual } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";

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
  const code = typeof body.code === "string" ? body.code.trim() : "";

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
      if (record.totpEnabled && record.totpSecretEnc) {
        // Password is right; the second factor is still needed.
        if (!code) {
          return NextResponse.json({ error: "Enter the code from your authenticator app", totpRequired: true }, { status: 401 });
        }
        const step = verifyTotp(decryptSecret(record.totpSecretEnc), code, { lastStep: record.totpLastStep });
        // Claim the step atomically so two logins can't reuse the same code.
        const claimed = step !== null && (await prisma.user.updateMany({
          where: { id: record.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
          data: { totpLastStep: step },
        })).count === 1;
        if (!claimed) {
          ipLimiter.recordFailure(ipKey);
          userLimiter.recordFailure(userKey);
          await recordAudit(username, "auth.login.failed", null, `ip=${clientIp(req)}; reason=totp`);
          return NextResponse.json({ error: "Invalid authentication code", totpRequired: true }, { status: 401 });
        }
      }
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
  await recordAudit(user.username, bootstrap ? "auth.login.bootstrap" : "auth.login", null, null);

  const response = NextResponse.json({ ok: true, role: user.role });
  await issueSession(req, response, user, { bootstrap });
  return response;
}
