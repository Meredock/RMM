import assert from "node:assert/strict";
import test from "node:test";
import { getJwtSecret, jwtSecretProblem } from "./secret";

const STRONG = "k3Jz9vQ0mR7tYp2wX8cN5bL1hG6fD4sA0eU+iO=";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  const vars = process.env as Record<string, string | undefined>;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete vars[k];
    else vars[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete vars[k];
      else vars[k] = v;
    }
  }
}

test("rejects missing, placeholder and short secrets", () => {
  assert.match(jwtSecretProblem(undefined)!, /not set/);
  assert.match(jwtSecretProblem("")!, /not set/);
  assert.match(jwtSecretProblem("change-me-to-a-random-secret-that-is-long")!, /placeholder/);
  assert.match(jwtSecretProblem("replace-with-a-long-random-secret")!, /placeholder/);
  assert.match(jwtSecretProblem("fallback-dev-secret-change-in-prod")!, /placeholder/);
  assert.match(jwtSecretProblem("too-short")!, /at least 32/);
  assert.equal(jwtSecretProblem(STRONG), null);
});

test("throws in production instead of falling back", () => {
  withEnv({ NODE_ENV: "production", JWT_SECRET: undefined }, () => {
    assert.throws(() => getJwtSecret(), /not set/);
  });
  withEnv({ NODE_ENV: "production", JWT_SECRET: STRONG }, () => {
    assert.equal(getJwtSecret(), STRONG);
  });
});

test("falls back to a dev secret outside production", () => {
  withEnv({ NODE_ENV: "development", JWT_SECRET: undefined }, () => {
    assert.ok(getJwtSecret().length > 0);
  });
});
