import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, type SessionUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  let user: SessionUser | null = null;

  // 1. If a username is supplied, authenticate against the User table.
  if (username?.trim()) {
    const record = await prisma.user.findUnique({ where: { username: username.trim() } });
    if (record && (await bcrypt.compare(password, record.passwordHash))) {
      user = { username: record.username, role: record.role };
    }
  }

  // 2. Otherwise (or if that failed) fall back to the bootstrap DASHBOARD_PASSWORD,
  //    which signs in as an admin so the first real users can be created. This is
  //    only honoured while no users exist, or when no username was given.
  if (!user && process.env.DASHBOARD_PASSWORD && password === process.env.DASHBOARD_PASSWORD) {
    const userCount = await prisma.user.count();
    if (userCount === 0 || !username?.trim()) {
      user = { username: username?.trim() || "admin", role: "ADMIN" };
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signSession(user);
  await recordAudit(user.username, "auth.login", null, null);

  const response = NextResponse.json({ ok: true, role: user.role });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    domain: ".fixsmith.com.au",
  });

  return response;
}
