import { prisma } from "./prisma";
import { createAlert } from "./alerts";

// The offline monitor marks devices offline when their heartbeats stop and
// raises DEVICE_OFFLINE alerts. It runs on a timer rather than inside the
// heartbeat handler, so detection doesn't depend on some other device checking
// in, and heartbeats stay cheap.
const CHECK_INTERVAL_MS = 60 * 1000;

const DESKTOP_OFFLINE_THRESHOLD_MS = 3 * 60 * 1000;
// Mobile background fetch is OS-scheduled and may arrive well after its
// requested interval. A longer window avoids repeatedly flapping phone agents
// offline while retaining the existing fast desktop-agent detection.
const MOBILE_OFFLINE_THRESHOLD_MS = 30 * 60 * 1000;

export async function markStaleDevicesOffline() {
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

async function tick() {
  try {
    await markStaleDevicesOffline();
  } catch (e) {
    console.error("[offline-monitor] check failed:", e);
  }
}

export function startOfflineMonitor() {
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log("[offline-monitor] Started (checking every 60s)");
}
