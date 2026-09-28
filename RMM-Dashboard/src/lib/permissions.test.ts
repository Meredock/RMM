import assert from "node:assert/strict";
import test from "node:test";
import { isScriptCommand, taskRunsScript } from "./permissions";

test("detects script commands however they're written", () => {
  assert.equal(isScriptCommand("runscript powershell ZWNobyBoaQ=="), true);
  assert.equal(isScriptCommand("  RunScript sh abc"), true);
  assert.equal(isScriptCommand("runscript"), true);
  assert.equal(isScriptCommand("ipconfig /all"), false);
  assert.equal(isScriptCommand("runscripts"), false);
  assert.equal(isScriptCommand("echo runscript"), false);
});

test("detects scheduled tasks that run scripts", () => {
  assert.equal(taskRunsScript({ action: "SCRIPT", command: null }), true);
  assert.equal(taskRunsScript({ action: "COMMAND", command: "runscript sh abc" }), true);
  assert.equal(taskRunsScript({ action: "COMMAND", command: "inventory" }), false);
});
