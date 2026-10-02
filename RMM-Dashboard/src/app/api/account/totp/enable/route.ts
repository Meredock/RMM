import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAccount } from "@/lib/account";
import { encryptSecret } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { verifyTotpSetupToken } from "@/lib/totp-setup";
import { recordAudit } from "@/lib/audit";

// Finish 2FA setup: the user proves their authenticator works by entering a code.
export async function POST(req: NextRequest) {
  const account = await requireAccount();
  if (account.error) return account.error;
  const { user } = account;

  const body = await req.json().catch(() => ({}));
  const secret = await verifyTotpSetupToken(String(body.setupToken ?? ""), user.username);
  if (!secret) {
    return NextResponse.json({ error: "Setup expired. Start again." }, { status: 400 });
  }
  const step = verifyTotp(secret, String(body.code ?? ""));
  if (step === null) {
    return NextResponse.json({ error: "That code didn't match. Check your authenticator and try again." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, totpSecretEnc: encryptSecret(secret), totpLastStep: step },
  });
  await recordAudit(user.username, "account.totp.enable", user.username, null);
  return NextResponse.json({ ok: true });
}
