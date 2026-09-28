import { SignJWT, jwtVerify } from "jose";
import { getJwtSecretKey } from "./secret";

// During 2FA setup the new secret travels in a short-lived signed token instead
// of being written to the user row, so nothing changes until the user proves
// their authenticator works.
const PURPOSE = "totp-setup";

export function signTotpSetupToken(username: string, secret: string): Promise<string> {
  return new SignJWT({ purpose: PURPOSE, secret })
    .setSubject(username)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getJwtSecretKey());
}

// verifyTotpSetupToken returns the pending secret if the token is valid and was
// issued to username.
export async function verifyTotpSetupToken(token: string, username: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    if (payload.purpose !== PURPOSE || payload.sub !== username || typeof payload.secret !== "string") return null;
    return payload.secret;
  } catch {
    return null;
  }
}
