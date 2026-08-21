import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";

// The task scheduler ticks once a minute, dispatching any due ScheduledTask to
// its target devices via the normal Command pipeline. Windowed tasks only fire
// while inside their MaintenanceWindow; otherwise they wait (re-checked each
// tick) until the window opens. Mirrors the backup/http-monitor schedulers.

const TICK_MS = 60_000;

type TaskWithRefs = Prisma.ScheduledTaskGetPayload<{
  include: { script: true; window: true };
}>;

export function startTaskScheduler() {
  setInterval(() => {
    void tick();
  }, TICK_MS);
  console.log("[task-scheduler] Started (checking every 60s)");
}

async function tick() {
  let due: TaskWithRefs[];
  try {
    due = await prisma.scheduledTask.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: new Date() } }],
      },
      include: { script: true, window: true },
    });
  } catch (err) {
    console.error("[task-scheduler] query failed:", err);
    return;
  }

  for (const task of due) {
    const now = new Date();
    try {
      // Gate to the maintenance window (only when the window itself is enabled).
      if (task.window && task.window.enabled && !isWithinWindow(task.window, now)) {
        continue; // not open yet — re-checked next tick, nextRunAt left as-is
      }
      await dispatch(task, now);
    } catch (err) {
      console.error(`[task-scheduler] task "${task.name}" (${task.id}) failed:`, err);
      // Push the next attempt out so a broken task doesn't spin every minute.
      await prisma.scheduledTask
        .update({
          where: { id: task.id },
          data: { nextRunAt: new Date(now.getTime() + task.intervalMinutes * 60_000) },
        })
        .catch(() => {});
    }
  }
}

// dispatchTask runs one task immediately (used by the scheduler and the
// "run now" API). Returns how many devices it was sent to.
export async function dispatchTask(task: TaskWithRefs, now = new Date()): Promise<number> {
  return dispatch(task, now);
}

async function dispatch(task: TaskWithRefs, now: Date): Promise<number> {
  const command = await buildCommand(task);
  const deviceIds = command ? await resolveDeviceIds(task) : [];

  if (deviceIds.length > 0) {
    await prisma.command.createMany({
      data: deviceIds.map((deviceId) => ({ deviceId, command: command as string })),
    });
  }

  await prisma.scheduledTaskRun.create({
    data: {
      taskId: task.id,
      deviceCount: deviceIds.length,
      detail: command ? summarize(task, deviceIds.length) : "skipped: no command (script missing?)",
    },
  });

  await prisma.scheduledTask.update({
    where: { id: task.id },
    data: {
      lastRunAt: now,
      nextRunAt: new Date(now.getTime() + task.intervalMinutes * 60_000),
    },
  });

  console.log(`[task-scheduler] "${task.name}" -> ${deviceIds.length} device(s)`);
  return deviceIds.length;
}

async function buildCommand(task: TaskWithRefs): Promise<string | null> {
  if (task.action === "SCRIPT") {
    const script =
      task.script ??
      (task.scriptId ? await prisma.script.findUnique({ where: { id: task.scriptId } }) : null);
    if (!script) return null;
    const encoded = Buffer.from(script.content, "utf8").toString("base64");
    return `runscript ${script.shell} ${encoded}`;
  }
  const c = (task.command ?? "").trim();
  return c || null;
}

async function resolveDeviceIds(task: TaskWithRefs): Promise<string[]> {
  const online: Prisma.DeviceWhereInput = task.onlyOnline ? { isOnline: true } : {};

  if (task.target === "DEVICE") {
    if (!task.deviceId) return [];
    const d = await prisma.device.findFirst({
      where: { id: task.deviceId, ...online },
      select: { id: true },
    });
    return d ? [d.id] : [];
  }

  if (task.target === "COMPANY") {
    if (!task.companyId) return [];
    const ds = await prisma.device.findMany({
      where: { companyId: task.companyId, ...online },
      select: { id: true },
    });
    return ds.map((d) => d.id);
  }

  // ALL
  const ds = await prisma.device.findMany({ where: online, select: { id: true } });
  return ds.map((d) => d.id);
}

function summarize(task: TaskWithRefs, count: number): string {
  const what = task.action === "SCRIPT" ? `script "${task.script?.name ?? task.scriptId}"` : `command "${task.command}"`;
  return `${what} → ${count} device(s)`;
}

const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// isWithinWindow returns true if `now` falls inside the maintenance window,
// evaluated in the window's timezone. Same-day windows only (start < end).
export function isWithinWindow(
  w: { daysOfWeek: number[]; startMinute: number; endMinute: number; timezone: string },
  now: Date
): boolean {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: w.timezone || "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    return true; // invalid tz — fail open rather than block the task forever
  }

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = DOW[get("weekday")];
  if (dow === undefined || !w.daysOfWeek.includes(dow)) return false;

  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // midnight is rendered as "24" in some runtimes
  const mins = hour * 60 + parseInt(get("minute"), 10);
  return mins >= w.startMinute && mins < w.endMinute;
}
