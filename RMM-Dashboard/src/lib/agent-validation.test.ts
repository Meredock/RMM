import assert from "node:assert/strict";
import test from "node:test";
import { validateHeartbeatPayload, validateRegistrationPayload } from "./agent-validation";

test("validates and normalizes phone enrollment", () => {
  assert.deepEqual(validateRegistrationPayload({
    name: "  Field phone  ", hostname: "iphone-01", platform: "ios", deviceType: "phone",
  }), {
    name: "Field phone", hostname: "iphone-01", platform: "ios", deviceType: "phone",
    osVersion: undefined, ipAddress: undefined, agentVersion: undefined,
  });
});

test("rejects unrecognized device types and incomplete metrics", () => {
  assert.throws(() => validateRegistrationPayload({ name: "x", hostname: "y", deviceType: "router" }));
  assert.throws(() => validateHeartbeatPayload({ cpu_percent: 50 }));
  assert.throws(() => validateHeartbeatPayload({ cpu_percent: Number.NaN, ram_percent: 50 }));
});

test("accepts bounded mobile health telemetry", () => {
  const payload = validateHeartbeatPayload({
    cpu_percent: 0, ram_percent: 0, battery_level: 72, connection_type: "WIFI",
  });
  assert.equal(payload.batteryLevel, 72);
  assert.equal(payload.connectionType, "WIFI");
  assert.throws(() => validateHeartbeatPayload({ cpu_percent: 0, ram_percent: 0, battery_level: 101 }));
});
