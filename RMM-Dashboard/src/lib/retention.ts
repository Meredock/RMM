import { prisma } from "./prisma";

// Retention windows (days). Override via env; 0 disables pruning for that table.
const METRIC_DAYS = Number(process.env.RETAIN_METRIC_DAYS ?? 30);
const HTTPCHECK_DAYS = Number(process.env.RETAIN_HTTPCHECK_DAYS ?? 30);
const BACKUPRUN_DAYS = Number(process.env.RETAIN_BACKUPRUN_DAYS ?? 180);
const AUDIT_DAYS = Number(process.env.RETAIN_AUDIT_DAYS ?? 365);

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function prune() {
  try {
    if (METRIC_DAYS > 0) {
      await prisma.metric.deleteMany({ where: { timestamp: { lt: cutoff(METRIC_DAYS) } } });
    }
    if (HTTPCHECK_DAYS > 0) {
      await prisma.httpCheck.deleteMany({ where: { checkedAt: { lt: cutoff(HTTPCHECK_DAYS) } } });
    }
    if (BACKUPRUN_DAYS > 0) {
      await prisma.backupRun.deleteMany({ where: { startedAt: { lt: cutoff(BACKUPRUN_DAYS) } } });
    }
    if (AUDIT_DAYS > 0) {
      await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff(AUDIT_DAYS) } } });
    }
  } catch (e) {
    console.error("[retention] prune failed:", e);
  }
}

// startRetention prunes old rows now and once a day thereafter, keeping the
// Postgres tables (metrics, monitor checks, backup runs, audit log) bounded.
export function startRetention() {
  void prune();
  setInterval(prune, 24 * 60 * 60 * 1000);
}
