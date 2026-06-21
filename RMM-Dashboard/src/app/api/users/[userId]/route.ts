import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { auditCurrentUser } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { userId } = await params;
  const { password, role } = await req.json();
  const data: Record<string, unknown> = {};
  if (password) {
    if (password.length < 8) {
      return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
  }
  if (role !== undefined) data.role = role === "ADMIN" ? "ADMIN" : "TECH";

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, username: true, role: true },
  });
  await auditCurrentUser("user.update", user.username, Object.keys(data).join(","));
  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { userId } = await params;
  const user = await prisma.user.delete({ where: { id: userId } });
  await auditCurrentUser("user.delete", user.username, null);
  return NextResponse.json({ ok: true });
}
