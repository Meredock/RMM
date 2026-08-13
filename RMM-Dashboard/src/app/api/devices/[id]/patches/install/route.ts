import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auditCurrentUser } from "@/lib/audit";

// POST /api/devices/[id]/patches/install — install selected patches.
// Body: { statusIds: string[] } (DevicePatchStatus ids for this device).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const device = await prisma.device.findUnique({ where: { id } });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const statusIds: string[] = Array.isArray(body?.statusIds) ? body.statusIds : [];
  if (statusIds.length === 0) {
    return NextResponse.json({ error: "statusIds is required" }, { status: 400 });
  }

  const statuses = await prisma.devicePatchStatus.findMany({
    where: {
      id: { in: statusIds },
      deviceId: id,
      state: { in: ["MISSING", "FAILED"] },
    },
    include: { patch: true },
  });
  if (statuses.length === 0) {
    return NextResponse.json(
      { error: "No installable patches in selection" },
      { status: 400 }
    );
  }

  const updateIds = statuses
    .filter((s) => s.patch.source === "WINDOWS_UPDATE")
    .map((s) => s.patch.externalId);
  const wingetIds = statuses
    .filter((s) => s.patch.source === "WINGET")
    .map((s) => s.patch.externalId);

  const payload = JSON.stringify({ updateIds, wingetIds });
  const cmd = await prisma.command.create({
    data: { deviceId: id, command: `patchinstall ${payload}` },
  });

  await prisma.devicePatchStatus.updateMany({
    where: { id: { in: statuses.map((s) => s.id) } },
    data: { state: "INSTALLING", attempts: { increment: 1 }, lastError: null },
  });

  await auditCurrentUser(
    "device.patch",
    device.name,
    `${statuses.length} patch(es): ${statuses
      .map((s) => s.patch.kb || s.patch.externalId)
      .join(", ")}`.slice(0, 200)
  );

  return NextResponse.json(
    { commandId: cmd.id, dispatched: statuses.length },
    { status: 201 }
  );
}
