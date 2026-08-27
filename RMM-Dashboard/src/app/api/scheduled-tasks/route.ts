import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

const ACTIONS = ["SCRIPT", "COMMAND"] as const;
const TARGETS = ["DEVICE", "COMPANY", "ALL"] as const;
type Action = (typeof ACTIONS)[number];
type Target = (typeof TARGETS)[number];

// GET /api/scheduled-tasks — all tasks with their linked names and last run.
export async function GET() {
  const tasks = await prisma.scheduledTask.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      script: { select: { name: true } },
      device: { select: { name: true } },
      company: { select: { name: true } },
      window: { select: { name: true } },
      runs: { orderBy: { dispatchedAt: "desc" }, take: 1 },
    },
  });

  return NextResponse.json(
    tasks.map((t) => ({
      id: t.id,
      name: t.name,
      action: t.action,
      scriptId: t.scriptId,
      scriptName: t.script?.name ?? null,
      command: t.command,
      target: t.target,
      deviceId: t.deviceId,
      deviceName: t.device?.name ?? null,
      companyId: t.companyId,
      companyName: t.company?.name ?? null,
      onlyOnline: t.onlyOnline,
      intervalMinutes: t.intervalMinutes,
      windowId: t.windowId,
      windowName: t.window?.name ?? null,
      enabled: t.enabled,
      lastRunAt: t.lastRunAt?.toISOString() ?? null,
      nextRunAt: t.nextRunAt?.toISOString() ?? null,
      lastRun: t.runs[0]
        ? { dispatchedAt: t.runs[0].dispatchedAt.toISOString(), deviceCount: t.runs[0].deviceCount, detail: t.runs[0].detail }
        : null,
    }))
  );
}

// POST /api/scheduled-tasks — create a task.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  const action: Action = ACTIONS.includes(b.action) ? b.action : "COMMAND";
  const target: Target = TARGETS.includes(b.target) ? b.target : "DEVICE";
  const intervalMinutes = Math.floor(Number(b.intervalMinutes));

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 5) {
    return NextResponse.json({ error: "intervalMinutes must be at least 5" }, { status: 400 });
  }

  let scriptId: string | null = null;
  let command: string | null = null;
  if (action === "SCRIPT") {
    scriptId = String(b.scriptId ?? "");
    const script = scriptId ? await prisma.script.findUnique({ where: { id: scriptId } }) : null;
    if (!script) return NextResponse.json({ error: "a valid scriptId is required" }, { status: 400 });
  } else {
    command = String(b.command ?? "").trim();
    if (!command) return NextResponse.json({ error: "command is required" }, { status: 400 });
  }

  let deviceId: string | null = null;
  let companyId: string | null = null;
  if (target === "DEVICE") {
    deviceId = String(b.deviceId ?? "");
    if (!(await prisma.device.findUnique({ where: { id: deviceId } }))) {
      return NextResponse.json({ error: "a valid deviceId is required" }, { status: 400 });
    }
  } else if (target === "COMPANY") {
    companyId = String(b.companyId ?? "");
    if (!(await prisma.company.findUnique({ where: { id: companyId } }))) {
      return NextResponse.json({ error: "a valid companyId is required" }, { status: 400 });
    }
  }

  let windowId: string | null = null;
  if (b.windowId) {
    windowId = String(b.windowId);
    if (!(await prisma.maintenanceWindow.findUnique({ where: { id: windowId } }))) {
      return NextResponse.json({ error: "maintenance window not found" }, { status: 400 });
    }
  }

  const task = await prisma.scheduledTask.create({
    data: {
      name,
      action,
      scriptId,
      command,
      target,
      deviceId,
      companyId,
      onlyOnline: b.onlyOnline !== false,
      intervalMinutes,
      windowId,
      enabled: b.enabled !== false,
      // First run after one interval; use "Run now" for an immediate dispatch.
      nextRunAt: new Date(Date.now() + intervalMinutes * 60_000),
    },
  });

  await auditCurrentUser("schedule.create", task.name, `${action} → ${target}, every ${intervalMinutes}m`);
  return NextResponse.json(task, { status: 201 });
}
