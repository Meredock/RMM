import assert from "node:assert/strict";
import test from "node:test";
import { base32Decode, base32Encode, generateTotpSecret, hotp, otpauthUrl, verifyTotp } from "./totp";

// RFC 6238 appendix B test secret (SHA1).
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);

test("base32 round-trips", () => {
  assert.equal(RFC_SECRET_B32, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode(RFC_SECRET_B32), RFC_SECRET);
  assert.deepEqual(base32Decode("gezd gnbv-gy3tqojq gezdgnbvgy3tqojq"), RFC_SECRET);
  const s = generateTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
});

test("matches RFC 6238 SHA1 test vectors", () => {
  // Vectors are 8 digits; authenticator codes are the last 6.
  const vectors: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];
  for (const [t, code] of vectors) {
    assert.equal(hotp(RFC_SECRET, Math.floor(t / 30), 8), code);
  }
});

test("verifyTotp accepts the current and adjacent steps only", () => {
  const nowMs = 1234567890 * 1000;
  const step = Math.floor(1234567890 / 30);
  const code = hotp(RFC_SECRET, step);
  assert.equal(verifyTotp(RFC_SECRET_B32, code, { nowMs }), step);
  assert.equal(verifyTotp(RFC_SECRET_B32, code, { nowMs: nowMs + 30_000 }), step);
  assert.equal(verifyTotp(RFC_SECRET_B32, code, { nowMs: nowMs + 90_000 }), null);
  assert.equal(verifyTotp(RFC_SECRET_B32, "000000", { nowMs }) === step, false);
  assert.equal(verifyTotp(RFC_SECRET_B32, "12345", { nowMs }), null);
  assert.equal(verifyTotp(RFC_SECRET_B32, code.slice(0, 3) + " " + code.slice(3), { nowMs }), step);
});

test("verifyTotp rejects replayed steps", () => {
  const nowMs = 1234567890 * 1000;
  const step = Math.floor(1234567890 / 30);
  const code = hotp(RFC_SECRET, step);
  assert.equal(verifyTotp(RFC_SECRET_B32, code, { nowMs, lastStep: step }), null);
  assert.equal(verifyTotp(RFC_SECRET_B32, code, { nowMs, lastStep: step - 1 }), step);
});

test("otpauthUrl encodes account and secret", () => {
  const url = otpauthUrl("ABC", "alice");
  assert.ok(url.startsWith("otpauth://totp/Fixsmith%20RMM%3Aalice?"));
  assert.match(url, /secret=ABC/);
  assert.match(url, /issuer=Fixsmith\+RMM/);
});
