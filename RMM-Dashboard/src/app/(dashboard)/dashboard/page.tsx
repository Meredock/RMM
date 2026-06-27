export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Monitor, Wifi, WifiOff, AlertTriangle, Activity, Server } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import Link from "next/link";

async function getDashboardData() {
  const [devices, recentAlerts, monitors] = await Promise.all([
    prisma.device.findMany({
      orderBy: { lastSeen: "desc" },
      include: {
        company: { select: { name: true } },
        metrics: { orderBy: { timestamp: "desc" }, take: 1 },
      },
    }),
    prisma.alert.findMany({
      where: { isResolved: false },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { device: { select: { name: true } } },
    }),
    prisma.httpMonitor.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
      include: { device: { select: { name: true } } },
    }),
  ]);

  const online = devices.filter((d) => d.isOnline).length;
  const offline = devices.length - online;
  const monitorsDown = monitors.filter((m) => m.lastOk === false).length;

  // "Needs attention" = offline, or latest metric over a threshold.
  const attention = devices
    .map((d) => {
      const m = d.metrics[0];
      const reasons: string[] = [];
      if (!d.isOnline) reasons.push("offline");
      if (d.isOnline && m) {
        if (m.cpuPercent >= 90) reasons.push(`CPU ${m.cpuPercent.toFixed(0)}%`);
        if (m.ramPercent >= 90) reasons.push(`RAM ${m.ramPercent.toFixed(0)}%`);
        if (m.diskPercent >= 90) reasons.push(`Disk ${m.diskPercent.toFixed(0)}%`);
      }
      return { d, reasons };
    })
    .filter((x) => x.reasons.length > 0);

  return { devices, recentAlerts, monitors, online, offline, monitorsDown, attention };
}

const severityVariant: Record<string, "destructive" | "warning" | "secondary"> = {
  CRITICAL: "destructive",
  WARNING: "warning",
  INFO: "secondary",
};

export default async function DashboardPage() {
  const { devices, recentAlerts, monitors, online, offline, monitorsDown, attention } =
    await getDashboardData();

  const stats = [
    { label: "Total Devices", value: devices.length, icon: Monitor, color: "text-primary", href: "/devices" },
    { label: "Online", value: online, icon: Wifi, color: "text-green-400", href: "/devices" },
    { label: "Offline", value: offline, icon: WifiOff, color: "text-red-400", href: "/devices" },
    { label: "Active Alerts", value: recentAlerts.length, icon: AlertTriangle, color: "text-yellow-400", href: "/alerts" },
    { label: "Monitors Down", value: monitorsDown, icon: Activity, color: "text-red-400", href: "/monitoring" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitoring {devices.length} device{devices.length !== 1 ? "s" : ""} · {monitors.length} monitor{monitors.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}>
            <Card className="hover:border-primary/50 transition-colors">
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
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs attention */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Needs Attention</h2>
          <Card>
            {attention.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-green-400">
                All devices healthy.
              </CardContent>
            ) : (
              <div className="divide-y divide-border">
                {attention.slice(0, 8).map(({ d, reasons }) => (
                  <Link key={d.id} href={`/devices/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30">
                    <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{d.name}</p>
                      {d.company && <p className="text-xs text-muted-foreground">{d.company.name}</p>}
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {reasons.map((r) => (
                        <Badge key={r} variant={r === "offline" ? "destructive" : "warning"} className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Monitors */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Monitors</h2>
            <Link href="/monitoring" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          <Card>
            {monitors.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-muted-foreground">No monitors configured.</CardContent>
            ) : (
              <div className="divide-y divide-border">
                {monitors.slice(0, 8).map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${m.lastOk === false ? "bg-red-400" : m.lastOk ? "bg-green-400" : "bg-muted-foreground"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.url}</p>
                    </div>
                    <Badge variant={m.lastOk === false ? "destructive" : m.lastOk ? "success" : "secondary"} className="text-xs shrink-0">
                      {m.lastOk === false ? "Down" : m.lastOk ? "Up" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Recent Alerts */}
      {recentAlerts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Active Alerts</h2>
            <Link href="/alerts" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          <Card>
            <div className="divide-y divide-border">
              {recentAlerts.map((alert) => (
                <div key={alert.id} className="flex items-center gap-4 px-4 py-3">
                  <Badge variant={severityVariant[alert.severity] ?? "secondary"}>{alert.severity}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">{alert.message}</p>
                    {alert.device && <p className="text-xs text-muted-foreground">{alert.device.name}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{timeAgo(alert.createdAt)}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
