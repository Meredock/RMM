export interface PhoneAgentDeviceSummary {
  id: string;
  name: string;
  isOnline: boolean;
  lastSeen: Date | string | null;
  company?: { name?: string | null } | null;
  metrics?: Array<{ cpuPercent?: number; ramPercent?: number; diskPercent?: number }>;
}

export interface PhoneAgentAlertSummary {
  severity?: string;
  message?: string;
  device?: { name?: string | null } | null;
}

export interface PhoneAgentMonitorSummary {
  lastOk?: boolean | null;
  name?: string | null;
  device?: { name?: string | null } | null;
}

export interface PhoneAgentSummary {
  online: number;
  offline: number;
  alerts: number;
  quickActions: string[];
  actionItems: string[];
}

export function buildPhoneAgentSummary(
  devices: PhoneAgentDeviceSummary[],
  alerts: PhoneAgentAlertSummary[] = [],
  monitors: PhoneAgentMonitorSummary[] = [],
): PhoneAgentSummary {
  const online = devices.filter((device) => device.isOnline).length;
  const offline = devices.length - online;
  const criticalAlerts = alerts.filter((alert) => (alert.severity ?? "").toUpperCase() === "CRITICAL").length;

  const quickActions = [
    offline > 0 ? "offline" : "healthy",
    criticalAlerts > 0 ? "alerts" : "stable",
    monitors.some((m) => m.lastOk === false) ? "monitor" : "checks",
  ];

  const actionItems = [
    ...(offline > 0 ? [`${offline} device${offline > 1 ? "s are" : " is"} offline`] : ["No offline devices"]),
    ...(criticalAlerts > 0 ? [`${criticalAlerts} critical alert${criticalAlerts > 1 ? "s" : ""}`] : ["No critical alerts"]),
    ...(monitors.some((m) => m.lastOk === false) ? [`${monitors.filter((m) => m.lastOk === false).length} monitor${monitors.filter((m) => m.lastOk === false).length > 1 ? "s" : ""} failing`] : ["All monitors healthy"]),
  ];

  return {
    online,
    offline,
    alerts: alerts.length,
    quickActions,
    actionItems,
  };
}
