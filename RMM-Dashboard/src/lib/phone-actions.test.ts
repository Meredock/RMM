import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedDeviceCommand, normalizePhoneActionCommand } from "./phone-actions";

test("normalizes supported mobile commands", () => {
  assert.equal(normalizePhoneActionCommand("mobile:ping"), "mobile:ping");
  assert.equal(normalizePhoneActionCommand("locate"), "mobile:locate");
  assert.equal(normalizePhoneActionCommand("lock"), "mobile:lock");
  assert.equal(normalizePhoneActionCommand("shutdown /s"), undefined);
});

test("restricts mobile devices to mobile-safe commands", () => {
  assert.equal(isAllowedDeviceCommand("phone", "mobile:ping"), true);
  assert.equal(isAllowedDeviceCommand("phone", "mobile:locate"), true);
  assert.equal(isAllowedDeviceCommand("phone", "shutdown /s"), false);
  assert.equal(isAllowedDeviceCommand("desktop", "shutdown /s"), true);
});
