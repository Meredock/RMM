// Single source of truth for JWT_SECRET. Session signing, the WebSocket relay
// and the vault key derivation all read it through here so that a missing or
// placeholder secret is caught in one place instead of silently falling back.

const DEV_FALLBACK = "fallback-dev-secret-change-in-prod";
const MIN_LENGTH = 32;
const PLACEHOLDER_PREFIXES = ["change-me", "replace-with", DEV_FALLBACK];

// jwtSecretProblem returns why a secret is unusable in production, or null.
export function jwtSecretProblem(secret: string | undefined): string | null {
  if (!secret) return "JWT_SECRET is not set";
  if (PLACEHOLDER_PREFIXES.some((p) => secret.startsWith(p))) {
    return "JWT_SECRET is still the example placeholder";
  }
  if (secret.length < MIN_LENGTH) {
    return `JWT_SECRET must be at least ${MIN_LENGTH} characters`;
  }
  return null;
}

// getJwtSecret returns JWT_SECRET, throwing in production when it is missing or
// weak. Outside production it falls back to a fixed dev value. Read lazily so
// it picks up the value after Next.js has loaded .env.
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    const problem = jwtSecretProblem(secret);
    if (problem) {
      throw new Error(`${problem} (generate one with: openssl rand -base64 32)`);
    }
    return secret!;
  }
  return secret || DEV_FALLBACK;
}

export function getJwtSecretKey(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}
