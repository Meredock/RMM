import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buildPhoneAgentSummary } from "@/lib/phone-agent";
import { Bell, Activity, CheckCircle2, ShieldAlert, Smartphone, Wifi, WifiOff, ArrowUpRight } from "lucide-react";
import Link from "next/link";

async function getPhoneOverview() {
  const [devices, alerts, monitors] = await Promise.all([
    prisma.device.findMany({
      where: { deviceType: { in: ["phone", "tablet"] } },
      orderBy: { lastSeen: "desc" },
      include: {
        company: { select: { name: true } },
        metrics: { orderBy: { timestamp: "desc" }, take: 1 },
      },
    }),
    prisma.alert.findMany({
      where: { isResolved: false, device: { deviceType: { in: ["phone", "tablet"] } } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { device: { select: { name: true } } },
    }),
    prisma.httpMonitor.findMany({
      where: { enabled: true, device: { deviceType: { in: ["phone", "tablet"] } } },
      orderBy: { name: "asc" },
      include: { device: { select: { name: true } } },
    }),
  ]);

  return { devices, alerts, monitors, summary: buildPhoneAgentSummary(devices, alerts, monitors) };
}

export default async function PhoneAgentPage() {
  const { devices, monitors, summary } = await getPhoneOverview();
  const phoneDevices = devices;

  const statusTiles = [
    { label: "Online", value: summary.online, icon: Wifi, tone: "text-green-400" },
    { label: "Offline", value: summary.offline, icon: WifiOff, tone: "text-red-400" },
    { label: "Alerts", value: summary.alerts, icon: Bell, tone: "text-yellow-400" },
    { label: "Monitors", value: monitors.length, icon: Activity, tone: "text-sky-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Phone agent</p>
          <h1 className="text-2xl font-bold text-foreground">Field device overview</h1>
        </div>
        <Link href="/devices">
          <Button variant="outline" size="sm">Manage devices</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {statusTiles.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="border-primary/10 bg-card/80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`text-2xl font-bold ${tone}`}>{value}</p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <Icon className={`h-5 w-5 ${tone}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-500/15 p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="space-y-2">
              <p className="font-semibold text-foreground">Agent health</p>
              <div className="flex flex-wrap gap-2">
                {summary.quickActions.map((action) => (
                  <span key={action} className="rounded-full border border-border bg-background px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {action}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Action items</h2>
              <ShieldAlert className="h-4 w-4 text-yellow-400" />
            </div>
            {summary.actionItems.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                <ArrowUpRight className="h-4 w-4 text-primary" />
                <span className="text-sm text-foreground">{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Phone fleet</h2>
              </div>
              <span className="text-xs text-muted-foreground">{phoneDevices.length} devices</span>
            </div>
            {phoneDevices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No mobile devices registered yet.</p>
            ) : (
              phoneDevices.slice(0, 5).map((device) => (
                <div key={device.id} className="rounded-md border border-border p-3">
                  <p className="text-sm font-medium text-foreground">{device.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {device.company?.name ?? "Unassigned"} · {device.isOnline ? "online" : "offline"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
