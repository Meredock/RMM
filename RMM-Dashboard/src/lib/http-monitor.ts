import { prisma } from "./prisma";

export interface CheckResult {
  ok: boolean;
  status: number | null;
  durationMs: number | null;
  error: string | null;
}

// runServerCheck performs an HTTP check from the dashboard server.
export async function runServerCheck(
  url: string,
  expectedStatus: number | null,
  timeoutMs: number
): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs > 0 ? timeoutMs : 5000);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const durationMs = Date.now() - start;
    const ok = expectedStatus ? res.status === expectedStatus : res.status < 400;
    return { ok, status: res.status, durationMs, error: ok ? null : `unexpected status ${res.status}` };
  } catch (e: unknown) {
    const durationMs = Date.now() - start;
    const msg =
      e instanceof Error ? (e.name === "AbortError" ? "timeout" : e.message) : "request failed";
    return { ok: false, status: null, durationMs, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// applyCheckResult records a check result: updates the monitor's last-result
// snapshot and appends a history row. Used by both the server scheduler and the
// agent command-result handler.
export async function applyCheckResult(
  monitorId: string,
  result: CheckResult,
  source: "server" | "agent"
) {
  await prisma.httpMonitor.update({
    where: { id: monitorId },
    data: {
      lastOk: result.ok,
      lastStatus: result.status,
      lastDurationMs: result.durationMs,
      lastError: result.error,
      lastCheckedAt: new Date(),
    },
  });
  await prisma.httpCheck.create({
    data: {
      monitorId,
      ok: result.ok,
      status: result.status,
      durationMs: result.durationMs,
      error: result.error,
      source,
    },
  });
}

// startHttpMonitorScheduler polls for due monitors every 30s. Server monitors
// (no deviceId) are checked inline; agent monitors are dispatched as an
// `httpcheck` command whose result the command-result route feeds back.
export function startHttpMonitorScheduler() {
  setInterval(async () => {
    try {
      const now = new Date();
      const due = await prisma.httpMonitor.findMany({
        where: { enabled: true, nextRunAt: { lte: now } },
        include: { device: { select: { id: true, isOnline: true } } },
      });

      for (const m of due) {
        const next = new Date(Date.now() + m.intervalMinutes * 60_000);

        if (!m.deviceId) {
          const result = await runServerCheck(m.url, m.expectedStatus, m.timeoutMs);
          await applyCheckResult(m.id, result, "server");
        } else if (m.device?.isOnline) {
          const payload = JSON.stringify({
            monitorId: m.id,
            url: m.url,
            expectedStatus: m.expectedStatus ?? 0,
            timeoutMs: m.timeoutMs,
          });
          await prisma.command.create({
            data: { deviceId: m.deviceId, command: `httpcheck ${payload}` },
          });
        } else {
          await prisma.httpMonitor.update({
            where: { id: m.id },
            data: { lastError: "agent offline", lastCheckedAt: now },
          });
        }

        await prisma.httpMonitor.update({ where: { id: m.id }, data: { nextRunAt: next } });
      }
    } catch (e) {
      console.error("[http-monitor] scheduler error:", e);
    }
  }, 30_000);
}
