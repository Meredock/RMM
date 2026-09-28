import assert from "node:assert/strict";
import test from "node:test";
import { resolveSession, signSession, verifySessionToken, type Role, type SessionStore } from "./session";

function store(users: Record<string, { role: Role; sessionsRevokedAt: Date }>): SessionStore {
  return {
    findUser: async (username) => users[username] ?? null,
    countAdmins: async () => Object.values(users).filter((u) => u.role === "ADMIN").length,
  };
}

const t = (sec: number) => new Date(sec * 1000);

test("signed tokens round-trip with bootstrap flag", async () => {
  const normal = await verifySessionToken(await signSession({ username: "alice", role: "TECH" }));
  assert.equal(normal?.username, "alice");
  assert.equal(normal?.bootstrap, false);
  const boot = await verifySessionToken(await signSession({ username: "admin", role: "ADMIN" }, { bootstrap: true }));
  assert.equal(boot?.bootstrap, true);
  assert.equal(await verifySessionToken("not-a-jwt"), null);
});

test("role comes from the database, not the token", async () => {
  const user = await resolveSession(
    { username: "alice", bootstrap: false, issuedAt: 200 },
    store({ alice: { role: "TECH", sessionsRevokedAt: t(100) } })
  );
  assert.deepEqual(user, { username: "alice", role: "TECH" });
});

test("deleted users are rejected", async () => {
  assert.equal(await resolveSession({ username: "bob", bootstrap: false, issuedAt: 200 }, store({})), null);
});

test("tokens issued before sessions were revoked are rejected", async () => {
  const s = store({ alice: { role: "ADMIN", sessionsRevokedAt: t(300) } });
  assert.equal(await resolveSession({ username: "alice", bootstrap: false, issuedAt: 299 }, s), null);
  assert.ok(await resolveSession({ username: "alice", bootstrap: false, issuedAt: 300 }, s));
});

test("bootstrap sessions only work until an admin exists", async () => {
  const claims = { username: "admin", bootstrap: true, issuedAt: 100 };
  assert.deepEqual(await resolveSession(claims, store({ tech: { role: "TECH", sessionsRevokedAt: t(1) } })), {
    username: "admin",
    role: "ADMIN",
  });
  assert.equal(await resolveSession(claims, store({ boss: { role: "ADMIN", sessionsRevokedAt: t(1) } })), null);
});
