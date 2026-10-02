import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter } from "./rate-limit";

test("blocks after max failures until the window resets", () => {
  const limiter = createRateLimiter(3, 60_000);
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.equal(limiter.isBlocked("k", t0).blocked, false);
    limiter.recordFailure("k", t0);
  }
  const blocked = limiter.isBlocked("k", t0 + 10_000);
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.retryAfterSec, 50);
  assert.equal(limiter.isBlocked("k", t0 + 60_000).blocked, false);
});

test("keys are independent and reset clears a key", () => {
  const limiter = createRateLimiter(1, 60_000);
  limiter.recordFailure("a");
  assert.equal(limiter.isBlocked("a").blocked, true);
  assert.equal(limiter.isBlocked("b").blocked, false);
  limiter.reset("a");
  assert.equal(limiter.isBlocked("a").blocked, false);
});
