import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/devices/[id]/patches — patch state for one device.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const device = await prisma.device.findUnique({
    where: { id },
    select: {
      id: true,
      platform: true,
      isOnline: true,
      rebootPending: true,
      lastPatchScanAt: true,
    },
  });
  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  const statuses = await prisma.devicePatchStatus.findMany({
    where: { deviceId: id },
    include: { patch: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 1000,
  });

  const count = (pred: (s: (typeof statuses)[number]) => boolean) =>
    statuses.filter(pred).length;

  return NextResponse.json({
    device: {
      ...device,
      lastPatchScanAt: device.lastPatchScanAt?.toISOString() ?? null,
    },
    summary: {
      missing: count((s) => s.state === "MISSING"),
      missingCritical: count(
        (s) => s.state === "MISSING" && s.patch.severity === "CRITICAL"
      ),
      installing: count((s) => s.state === "INSTALLING"),
      rebootPending: count((s) => s.state === "REBOOT_PENDING"),
      failed: count((s) => s.state === "FAILED"),
    },
    statuses: statuses.map((s) => ({
      id: s.id,
      state: s.state,
      firstSeenAt: s.firstSeenAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      installedAt: s.installedAt?.toISOString() ?? null,
      attempts: s.attempts,
      lastError: s.lastError,
      updatedAt: s.updatedAt.toISOString(),
      patch: {
        id: s.patch.id,
        source: s.patch.source,
        externalId: s.patch.externalId,
        version: s.patch.version,
        title: s.patch.title,
        severity: s.patch.severity,
        category: s.patch.category,
        kb: s.patch.kb,
      },
    })),
  });
}
