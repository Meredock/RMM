import crypto from "crypto";

// Vault encryption (AES-256-GCM). Stored secrets are never persisted in
// plaintext. Set VAULT_KEY to a base64-encoded 32-byte key for a dedicated key;
// otherwise a key is derived from JWT_SECRET so the vault works out of the box.
function getKey(): Buffer {
  const raw = process.env.VAULT_KEY;
  if (raw) {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  }
  const secret = process.env.JWT_SECRET ?? "fallback-dev-secret-change-in-prod";
  return crypto.createHash("sha256").update(secret).digest();
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
