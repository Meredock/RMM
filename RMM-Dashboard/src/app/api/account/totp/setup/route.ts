import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAccount } from "@/lib/account";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";
import { signTotpSetupToken } from "@/lib/totp-setup";

// Start 2FA setup: returns a new secret (as a QR code and text) plus a token the
// enable step needs. Nothing is saved until the user confirms a code.
export async function POST() {
  const account = await requireAccount();
  if (account.error) return account.error;
  const { user } = account;

  if (user.totpEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is already on" }, { status: 409 });
  }

  const secret = generateTotpSecret();
  const url = otpauthUrl(secret, user.username);
  return NextResponse.json({
    secret,
    otpauthUrl: url,
    qrDataUrl: await QRCode.toDataURL(url, { margin: 1, width: 220 }),
    setupToken: await signTotpSetupToken(user.username, secret),
  });
}
