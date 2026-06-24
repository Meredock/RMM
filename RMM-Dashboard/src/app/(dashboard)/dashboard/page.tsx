export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { DeviceCard } from "@/components/DeviceCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Monitor, Wifi, WifiOff, AlertTriangle } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import Link from "next/link";

async function getDashboardData() {
  const [devices, recentAlerts] = await Promise.all([
    prisma.device.findMany({
      orderBy: { lastSeen: "desc" },
      include: {
        metrics: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    }),
    prisma.alert.findMany({
      where: { isResolved: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { device: { select: { name: true } } },
    }),
  ]);

  const online = devices.filter((d) => d.isOnline).length;
  const offline = devices.length - online;
  const unresolvedAlerts = recentAlerts.length;

  return { devices, recentAlerts, online, offline, unresolvedAlerts };
}

const severityVariant: Record<string, "destructive" | "warning" | "secondary"> = {
  CRITICAL: "destructive",
  WARNING: "warning",
  INFO: "secondary",
};

export default async function DashboardPage() {
  const { devices, recentAlerts, online, offline, unresolvedAlerts } =
    await getDashboardData();

  const stats = [
    { label: "Total Devices", value: devices.length, icon: Monitor, color: "text-primary" },
    { label: "Online", value: online, icon: Wifi, color: "text-green-400" },
    { label: "Offline", value: offline, icon: WifiOff, color: "text-red-400" },
    { label: "Active Alerts", value: unresolvedAlerts, icon: AlertTriangle, color: "text-yellow-400" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitoring {devices.length} device{devices.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                </div>
                <div className={`p-2 rounded-lg bg-muted ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Device Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Devices</h2>
          <Link href="/devices" className="text-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        {devices.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Monitor className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No devices registered yet.</p>
              <p className="text-muted-foreground text-xs mt-1">
                Install the agent on a machine and register it to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {devices.slice(0, 8).map((device) => (
              <DeviceCard
                key={device.id}
                device={{
                  ...device,
                  lastSeen: device.lastSeen?.toISOString() ?? null,
                  latestMetric: device.metrics[0] ?? null,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Alerts */}
      {recentAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Active Alerts</h2>
            <Link href="/alerts" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <Card>
            <div className="divide-y divide-border">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center gap-4 px-4 py-3">
                  <Badge variant={severityVariant[alert.severity] ?? "secondary"}>
                    {alert.severity}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{alert.message}</p>
                    {alert.device && (
                      <p className="text-xs text-muted-foreground">{alert.device.name}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">
                    {timeAgo(alert.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
