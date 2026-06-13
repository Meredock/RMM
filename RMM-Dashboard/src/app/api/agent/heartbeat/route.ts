import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AlertType, AlertSeverity } from "@prisma/client";

const OFFLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes

async function markStaleDevicesOffline() {
  const threshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
  await prisma.device.updateMany({
    where: { isOnline: true, lastSeen: { lt: threshold } },
    data: { isOnline: false },
  });
}

async function triggerAlerts(
  deviceId: string,
  cpuPercent: number,
  ramPercent: number,
  diskPercent: number
) {
  const rules = await prisma.alertRule.findMany({
    where: {
      isEnabled: true,
      OR: [{ deviceId }, { deviceId: null }],
    },
  });

  const thresholds: Record<string, { value: number; message: (v: number) => string }> = {
    HIGH_CPU: { value: cpuPercent, message: (v) => `CPU usage is ${v.toFixed(0)}%` },
    HIGH_RAM: { value: ramPercent, message: (v) => `RAM usage is ${v.toFixed(0)}%` },
    HIGH_DISK: { value: diskPercent, message: (v) => `Disk usage is ${v.toFixed(0)}%` },
  };

  for (const rule of rules) {
    if (rule.threshold == null) continue;
    const metric = thresholds[rule.type];
    if (!metric || metric.value < rule.threshold) continue;

    // Only create if no unresolved alert of this type for this device exists
    const existing = await prisma.alert.findFirst({
      where: { deviceId, type: rule.type, isResolved: false },
    });
    if (existing) continue;

    await prisma.alert.create({
      data: {
        deviceId,
        type: rule.type as AlertType,
        severity: rule.severity as AlertSeverity,
        message: metric.message(metric.value),
      },
    });
  }
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Api-Key header" }, { status: 401 });
  }

  const device = await prisma.device.findUnique({ where: { apiKey } });
  if (!device) {
    return NextResponse.json({ error: "Unknown device" }, { status: 401 });
  }

  const body = await req.json();
  const {
    cpu_percent,
    ram_percent,
    ram_used_mb,
    ram_total_mb,
    disk_percent,
    disk_used_gb,
    disk_total_gb,
    ip_address,
    os_version,
    agent_version,
  } = body;

  // Update device status
  await prisma.device.update({
    where: { id: device.id },
    data: {
      isOnline: true,
      lastSeen: new Date(),
      ...(ip_address && { ipAddress: ip_address }),
      ...(os_version && { osVersion: os_version }),
      ...(agent_version && { agentVersion: agent_version }),
    },
  });

  // Store metric
  if (
    cpu_percent !== undefined &&
    ram_percent !== undefined
  ) {
    await prisma.metric.create({
      data: {
        deviceId: device.id,
        cpuPercent: Number(cpu_percent),
        ramPercent: Number(ram_percent),
        ramUsedMb: Number(ram_used_mb ?? 0),
        ramTotalMb: Number(ram_total_mb ?? 0),
        diskPercent: Number(disk_percent ?? 0),
        diskUsedGb: Number(disk_used_gb ?? 0),
        diskTotalGb: Number(disk_total_gb ?? 0),
      },
    });

    // Check alert rules
    await triggerAlerts(
      device.id,
      Number(cpu_percent),
      Number(ram_percent),
      Number(disk_percent ?? 0)
    );
  }

  // Mark stale devices offline
  await markStaleDevicesOffline();

  // Check if device was previously offline — create alert resolved if back online
  if (!device.isOnline) {
    // Resolve any DEVICE_OFFLINE alert for this device
    await prisma.alert.updateMany({
      where: { deviceId: device.id, type: "DEVICE_OFFLINE", isResolved: false },
      data: { isResolved: true, resolvedAt: new Date() },
    });
  }

  // Return pending commands
  const pendingCommands = await prisma.command.findMany({
    where: { deviceId: device.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, command: true },
  });

  // Mark them as RUNNING
  if (pendingCommands.length > 0) {
    await prisma.command.updateMany({
      where: { id: { in: pendingCommands.map((c) => c.id) } },
      data: { status: "RUNNING", executedAt: new Date() },
    });
  }

  return NextResponse.json({ pendingCommands });
}
