import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findDeviceByApiKey } from "@/lib/device-auth";
import { createAlert } from "@/lib/alerts";
import { validateHeartbeatPayload } from "@/lib/agent-validation";

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

    await createAlert({
      deviceId,
      type: rule.type,
      severity: rule.severity,
      message: metric.message(metric.value),
    });
  }
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-Api-Key header" }, { status: 401 });
  }

  const device = await findDeviceByApiKey(apiKey);
  if (!device) {
    return NextResponse.json({ error: "Unknown device" }, { status: 401 });
  }

  let payload: ReturnType<typeof validateHeartbeatPayload>;
  try {
    payload = validateHeartbeatPayload(await req.json());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid heartbeat request" }, { status: 400 });
  }

  // Update device status
  await prisma.device.update({
    where: { id: device.id },
    data: {
      isOnline: true,
      lastSeen: new Date(),
      ...(payload.ipAddress && { ipAddress: payload.ipAddress }),
      ...(payload.osVersion && { osVersion: payload.osVersion }),
      ...(payload.agentVersion && { agentVersion: payload.agentVersion }),
      ...(payload.platform && { platform: payload.platform }),
    },
  });

  const mobileHealthFields = [
    payload.batteryLevel === undefined ? null : { key: "mobile.batteryLevel", value: String(payload.batteryLevel) },
    payload.connectionType ? { key: "mobile.connectionType", value: payload.connectionType } : null,
    payload.locationConsent === undefined ? null : { key: "mobile.locationConsent", value: String(payload.locationConsent) },
    payload.locationLat === undefined || payload.locationLng === undefined ? null : [
      { key: "mobile.locationLat", value: String(payload.locationLat) },
      { key: "mobile.locationLng", value: String(payload.locationLng) },
    ],
  ].flat().filter((field): field is { key: string; value: string } => field !== null);
  if (mobileHealthFields.length > 0) {
    await Promise.all(mobileHealthFields.map((field) => prisma.deviceField.upsert({
      where: { deviceId_key: { deviceId: device.id, key: field.key } },
      create: { deviceId: device.id, ...field },
      update: { value: field.value },
    })));
  }

  // Store metric
  if (
    payload.cpuPercent !== undefined &&
    payload.ramPercent !== undefined
  ) {
    await prisma.metric.create({
      data: {
        deviceId: device.id,
        cpuPercent: payload.cpuPercent,
        ramPercent: payload.ramPercent,
        ramUsedMb: payload.ramUsedMb,
        ramTotalMb: payload.ramTotalMb,
        diskPercent: payload.diskPercent,
        diskUsedGb: payload.diskUsedGb,
        diskTotalGb: payload.diskTotalGb,
      },
    });

    // Check alert rules
    await triggerAlerts(
      device.id,
      payload.cpuPercent,
      payload.ramPercent,
      payload.diskPercent
    );
  }

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
