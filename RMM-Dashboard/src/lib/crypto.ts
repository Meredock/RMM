import crypto from "crypto";
import { getJwtSecret } from "./secret";

// Vault encryption (AES-256-GCM). Stored secrets are never persisted in
// plaintext. Set VAULT_KEY to a base64-encoded 32-byte key for a dedicated key;
// otherwise a key is derived from JWT_SECRET so the vault works out of the box.
function getKey(): Buffer {
  const raw = process.env.VAULT_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  }
  return crypto.createHash("sha256").update(getJwtSecret()).digest();
}

// encryptSecret returns base64(iv | authTag | ciphertext).
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// safeEqual compares two strings in constant time (for secrets and passwords).
export function safeEqual(a: string, b: string): boolean {
  // Hash first so inputs of different lengths still take constant time.
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// generateApiKey returns a 40-char alphanumeric key from a CSPRNG.
export function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 40 }, () => chars[crypto.randomInt(chars.length)]).join("");
}
