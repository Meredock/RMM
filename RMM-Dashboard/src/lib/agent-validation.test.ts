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

test("accepts consented mobile location telemetry", () => {
  const payload = validateHeartbeatPayload({
    cpu_percent: 0,
    ram_percent: 0,
    location_lat: 40.7128,
    location_lng: -74.006,
    location_consent: true,
  });
  assert.equal(payload.locationLat, 40.7128);
  assert.equal(payload.locationLng, -74.006);
  assert.equal(payload.locationConsent, true);
  assert.throws(() => validateHeartbeatPayload({ cpu_percent: 0, ram_percent: 0, location_lat: 91 }));
  assert.throws(() => validateHeartbeatPayload({ cpu_percent: 0, ram_percent: 0, location_lng: -181 }));
});
