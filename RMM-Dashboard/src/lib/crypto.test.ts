import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret, generateApiKey, safeEqual } from "./crypto";

test("safeEqual compares strings of any length", () => {
  assert.equal(safeEqual("secret", "secret"), true);
  assert.equal(safeEqual("secret", "secreT"), false);
  assert.equal(safeEqual("secret", "secret-longer"), false);
  assert.equal(safeEqual("", ""), true);
});

test("generateApiKey returns unique 40-char alphanumeric keys", () => {
  const a = generateApiKey();
  assert.match(a, /^[A-Za-z0-9]{40}$/);
  assert.notEqual(a, generateApiKey());
});

test("vault encryption round-trips", () => {
  assert.equal(decryptSecret(encryptSecret("hunter2")), "hunter2");
});
