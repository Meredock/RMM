import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/account";
import { decryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { recordAudit } from "@/lib/audit";

// Turn off 2FA. Requires both the password and a current code, so a stolen
// session alone can't remove the second factor.
export async function POST(req: NextRequest) {
  const account = await requireAccount();
  if (account.error) return account.error;
  const { user } = account;

  if (!user.totpEnabled || !user.totpSecretEnc) {
    return NextResponse.json({ error: "Two-factor authentication is not on" }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  if (!(await bcrypt.compare(String(body.password ?? ""), user.passwordHash))) {
    return NextResponse.json({ error: "Password is incorrect" }, { status: 400 });
  }
  if (verifyTotp(decryptSecret(user.totpSecretEnc), String(body.code ?? ""), { lastStep: user.totpLastStep }) === null) {
    return NextResponse.json({ error: "Invalid authentication code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null },
  });
  await recordAudit(user.username, "account.totp.disable", user.username, null);
  return NextResponse.json({ ok: true });
}
