import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guard";
import { taskRunsScript } from "@/lib/permissions";
import { auditCurrentUser } from "@/lib/audit";

// PATCH /api/scheduled-tasks/[id] — toggle enabled or edit a few safe fields.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  // Tasks that run scripts are admin only (enabling one runs the script).
  if (taskRunsScript(task)) {
    const denied = await requireAdmin();
    if (denied) return denied;
  }

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};

  if (typeof b.enabled === "boolean") data.enabled = b.enabled;
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
  if (typeof b.onlyOnline === "boolean") data.onlyOnline = b.onlyOnline;
  if (b.intervalMinutes !== undefined) {
    const iv = Math.floor(Number(b.intervalMinutes));
    if (!Number.isFinite(iv) || iv < 5) {
      return NextResponse.json({ error: "intervalMinutes must be at least 5" }, { status: 400 });
    }
    data.intervalMinutes = iv;
  }
  if (b.windowId !== undefined) {
    if (b.windowId === null || b.windowId === "") {
      data.windowId = null;
    } else {
      if (!(await prisma.maintenanceWindow.findUnique({ where: { id: String(b.windowId) } }))) {
        return NextResponse.json({ error: "maintenance window not found" }, { status: 400 });
      }
      data.windowId = String(b.windowId);
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.scheduledTask.update({ where: { id }, data });
  await auditCurrentUser("schedule.update", updated.name, Object.keys(data).join(", "));
  return NextResponse.json(updated);
}

// DELETE /api/scheduled-tasks/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await prisma.scheduledTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (taskRunsScript(task)) {
    const denied = await requireAdmin();
    if (denied) return denied;
  }

  await prisma.scheduledTask.delete({ where: { id } });
  await auditCurrentUser("schedule.delete", task.name, null);
  return NextResponse.json({ ok: true });
}
