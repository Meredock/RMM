import test from "node:test";
import assert from "node:assert/strict";

import { buildPhoneAgentSummary } from "./phone-agent";

test("buildPhoneAgentSummary flags offline and alerting devices", () => {
  const summary = buildPhoneAgentSummary(
    [
      {
        id: "1",
        name: "Server-01",
        isOnline: false,
        lastSeen: null,
        company: { name: "Acme" },
        metrics: [],
      },
      {
        id: "2",
        name: "Desk-02",
        isOnline: true,
        lastSeen: new Date("2024-01-01T00:00:00Z"),
        company: { name: "Acme" },
        metrics: [{ cpuPercent: 95, ramPercent: 80, diskPercent: 70 }],
      },
    ],
    [{ severity: "CRITICAL", message: "Firewall outage", device: { name: "Server-01" } }],
    [{ lastOk: false, name: "Portal check", device: { name: "Desk-02" } }],
  );

  assert.equal(summary.online, 1);
  assert.equal(summary.offline, 1);
  assert.equal(summary.alerts, 1);
  assert.equal(summary.actionItems.length >= 2, true);
  assert.equal(summary.quickActions.includes("offline"), true);
});
