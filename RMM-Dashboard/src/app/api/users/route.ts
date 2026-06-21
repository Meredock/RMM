import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { auditCurrentUser } from "@/lib/audit";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const users = await prisma.user.findMany({
    orderBy: { username: "asc" },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { username, password, role } = await req.json();
  if (!username?.trim() || !password) {
    return NextResponse.json({ error: "username and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (exists) {
    return NextResponse.json({ error: "username already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      username: username.trim(),
      passwordHash: await bcrypt.hash(password, 10),
      role: role === "ADMIN" ? "ADMIN" : "TECH",
    },
    select: { id: true, username: true, role: true, createdAt: true },
  });
  await auditCurrentUser("user.create", user.username, `role=${user.role}`);
  return NextResponse.json(user, { status: 201 });
}
