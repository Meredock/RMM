import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

// PATCH /api/maintenance-windows/[id] — toggle enabled or rename.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const win = await prisma.maintenanceWindow.findUnique({ where: { id } });
  if (!win) return NextResponse.json({ error: "Window not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof b.enabled === "boolean") data.enabled = b.enabled;
  if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.maintenanceWindow.update({ where: { id }, data });
  await auditCurrentUser("maintenance_window.update", updated.name, Object.keys(data).join(", "));
  return NextResponse.json(updated);
}

// DELETE /api/maintenance-windows/[id] — deleting nulls it out on any tasks
// using it (they revert to always-eligible), per the schema's SetNull.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const win = await prisma.maintenanceWindow.findUnique({ where: { id } });
  if (!win) return NextResponse.json({ error: "Window not found" }, { status: 404 });

  await prisma.maintenanceWindow.delete({ where: { id } });
  await auditCurrentUser("maintenance_window.delete", win.name, null);
  return NextResponse.json({ ok: true });
}
