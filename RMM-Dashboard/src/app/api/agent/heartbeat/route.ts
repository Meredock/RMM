import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/alerts";
import { validateHeartbeatPayload } from "@/lib/agent-validation";

const DESKTOP_OFFLINE_THRESHOLD_MS = 3 * 60 * 1000;
// Mobile background fetch is OS-scheduled and may arrive well after its
// requested interval. A longer window avoids repeatedly flapping phone agents
// offline while retaining the existing fast desktop-agent detection.
const MOBILE_OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

async function markStaleDevicesOffline() {
  const desktopThreshold = new Date(Date.now() - DESKTOP_OFFLINE_THRESHOLD_MS);
  const stale = await prisma.device.findMany({
    where: { isOnline: true, lastSeen: { lt: desktopThreshold } },
    select: { id: true, name: true, deviceType: true, lastSeen: true },
  });
  const now = Date.now();
  const staleDevices = stale.filter((device) => {
    const threshold = device.deviceType === "phone" || device.deviceType === "tablet"
      ? MOBILE_OFFLINE_THRESHOLD_MS
      : DESKTOP_OFFLINE_THRESHOLD_MS;
    return device.lastSeen !== null && device.lastSeen.getTime() < now - threshold;
  });
  if (staleDevices.length === 0) return;

  await prisma.device.updateMany({
    where: { id: { in: staleDevices.map((d) => d.id) } },
    data: { isOnline: false },
  });

  // Raise a DEVICE_OFFLINE alert for each newly-offline device that has an
  // enabled rule (global or device-specific) and no open offline alert.
  for (const d of staleDevices) {
    const rule = await prisma.alertRule.findFirst({
      where: { isEnabled: true, type: "DEVICE_OFFLINE", OR: [{ deviceId: d.id }, { deviceId: null }] },
    });
    if (!rule) continue;
    const existing = await prisma.alert.findFirst({
      where: { deviceId: d.id, type: "DEVICE_OFFLINE", isResolved: false },
    });
    if (existing) continue;
    await createAlert({ deviceId: d.id, type: "DEVICE_OFFLINE", severity: rule.severity, message: `${d.name} went offline` });
  }
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

  const device = await prisma.device.findUnique({ where: { apiKey } });
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
  ].filter((field): field is { key: string; value: string } => field !== null);
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
