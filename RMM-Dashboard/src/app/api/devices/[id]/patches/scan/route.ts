import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

// POST /api/devices/[id]/patches/scan — dispatch a patch scan to the agent.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // Reuse an already-queued/running scan instead of stacking duplicates.
  const existing = await prisma.command.findFirst({
    where: {
      deviceId: id,
      command: "patchscan",
      status: { in: ["PENDING", "RUNNING"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return NextResponse.json({ commandId: existing.id, reused: true });
  }

  const cmd = await prisma.command.create({
    data: { deviceId: id, command: "patchscan" },
  });
  await auditCurrentUser("device.patch_scan", device.name, null);

  return NextResponse.json({ commandId: cmd.id, reused: false }, { status: 201 });
}
