import assert from "node:assert/strict";
import test from "node:test";
import { createSessionChecker, type FetchLike } from "./session-check.js";

function fakeDashboard(statusFor: (token: string) => number | "error") {
  const calls: { url: string; cookie: string }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    const cookie = init.headers.cookie;
    calls.push({ url, cookie });
    const status = statusFor(decodeURIComponent(cookie.split("=")[1]));
    if (status === "error") throw new Error("ECONNREFUSED");
    return { status };
  };
  return { calls, fetchImpl };
}

test("asks the dashboard's session endpoint with the session cookie", async () => {
  const dash = fakeDashboard(() => 200);
  const check = createSessionChecker({ dashboardUrl: "http://dashboard:3000/", cookieName: "rmm_session", fetchImpl: dash.fetchImpl });
  assert.equal(await check("tok"), true);
  assert.deepEqual(dash.calls, [{ url: "http://dashboard:3000/api/auth/session", cookie: "rmm_session=tok" }]);
});

test("rejects sessions the dashboard has revoked", async () => {
  const dash = fakeDashboard(() => 401);
  const check = createSessionChecker({ dashboardUrl: "http://d", cookieName: "c", fetchImpl: dash.fetchImpl });
  assert.equal(await check("tok"), false);
});

test("fails closed when the dashboard is unreachable", async () => {
  const dash = fakeDashboard(() => "error");
  const check = createSessionChecker({ dashboardUrl: "http://d", cookieName: "c", fetchImpl: dash.fetchImpl });
  assert.equal(await check("tok"), false);
});

test("caches a confirmed session until the TTL passes, then asks again", async () => {
  let status = 200;
  let clock = 1_000;
  const dash = fakeDashboard(() => status);
  const check = createSessionChecker({
    dashboardUrl: "http://d", cookieName: "c", cacheTtlMs: 30_000, fetchImpl: dash.fetchImpl, now: () => clock,
  });
  assert.equal(await check("tok"), true);
  status = 401; // revoked on the dashboard
  clock += 29_000;
  assert.equal(await check("tok"), true, "still cached");
  assert.equal(dash.calls.length, 1);
  clock += 2_000;
  assert.equal(await check("tok"), false, "revocation seen after TTL");
  assert.equal(dash.calls.length, 2);
});

test("does not cache rejections", async () => {
  let status = 401;
  const dash = fakeDashboard(() => status);
  const check = createSessionChecker({ dashboardUrl: "http://d", cookieName: "c", fetchImpl: dash.fetchImpl });
  assert.equal(await check("tok"), false);
  status = 200;
  assert.equal(await check("tok"), true);
});
