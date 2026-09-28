import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { taskRunsScript } from "@/lib/permissions";
import { auditCurrentUser } from "@/lib/audit";
import { dispatchTask } from "@/lib/task-scheduler";

// POST /api/scheduled-tasks/[id]/run — dispatch this task immediately, ignoring
// its schedule and maintenance window.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.scheduledTask.findUnique({
    where: { id },
    include: { script: true, window: true },
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (taskRunsScript(task)) {
    const denied = await requireAdmin();
    if (denied) return denied;
  }

  const count = await dispatchTask(task);
  await auditCurrentUser("schedule.run", task.name, `${count} device(s)`);
  return NextResponse.json({ ok: true, dispatched: count });
}
