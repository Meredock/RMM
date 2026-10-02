import assert from "node:assert/strict";
import test from "node:test";
import { signTotpSetupToken, verifyTotpSetupToken } from "./totp-setup";

test("setup token returns the pending secret to the same user only", async () => {
  const token = await signTotpSetupToken("alice", "SECRETB32");
  assert.equal(await verifyTotpSetupToken(token, "alice"), "SECRETB32");
  assert.equal(await verifyTotpSetupToken(token, "bob"), null);
  assert.equal(await verifyTotpSetupToken("garbage", "alice"), null);
});
