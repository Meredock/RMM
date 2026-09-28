import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/account";
import { issueSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

// Change your own password. Signs out every other session and re-issues this one.
export async function POST(req: NextRequest) {
  const account = await requireAccount();
  if (account.error) return account.error;
  const { user } = account;

  const body = await req.json().catch(() => ({}));
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10), sessionsRevokedAt: new Date() },
  });
  await recordAudit(user.username, "account.password.change", user.username, null);

  const res = NextResponse.json({ ok: true });
  await issueSession(req, res, { username: user.username, role: user.role });
  return res;
}
