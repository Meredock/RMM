export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MetricsChart } from "@/components/MetricsChart";
import { CommandPanel } from "@/components/CommandPanel";
import { VirusScanButton } from "@/components/VirusScanButton";
import { InventoryPanel } from "@/components/InventoryPanel";
import { DeviceNotes } from "@/components/DeviceNotes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, Server, Cpu, MemoryStick, HardDrive, Clock, Terminal, FolderOpen, Monitor, Archive } from "lucide-react";
import { formatBytes, timeAgo } from "@/lib/utils";
import Link from "next/link";
import { format } from "date-fns";

async function getDevice(id: string) {
  const device = await prisma.device.findUnique({
    where: { id },
    include: {
      metrics: {
        orderBy: { timestamp: "desc" },
        take: 60,
      },
      commands: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  return device;
}

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const device = await getDevice(id);
  if (!device) notFound();

  const latest = device.metrics[0];
  const metricsForChart = [...device.metrics].reverse().map((m) => ({
    timestamp: m.timestamp.toISOString(),
    cpuPercent: m.cpuPercent,
    ramPercent: m.ramPercent,
    diskPercent: m.diskPercent,
  }));

  const commandsForPanel = device.commands.map((c) => ({
    id: c.id,
    command: c.command,
    status: c.status,
    output: c.output,
    exitCode: c.exitCode,
    createdAt: c.createdAt.toISOString(),
    completedAt: c.completedAt?.toISOString() ?? null,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Back + header */}
      <div>
        <Link
          href="/devices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          All devices
        </Link>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-muted">
              <Server className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{device.name}</h1>
              <p className="text-muted-foreground text-sm">{device.hostname}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={device.isOnline ? "success" : "destructive"} className="text-sm px-3 py-1">
              {device.isOnline ? "● Online" : "● Offline"}
            </Badge>
            <Badge variant="outline">{device.platform}</Badge>
            {device.osVersion && <Badge variant="outline">{device.osVersion}</Badge>}
          </div>
        </div>

        {/* Remote access buttons */}
        {device.isOnline && (
          <div className="flex items-center gap-2 ml-auto">
            <Link href={`/devices/${device.id}/terminal`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-sm font-medium transition-colors">
              <Terminal className="h-4 w-4 text-green-400" /> Terminal
            </Link>
            <Link href={`/devices/${device.id}/files`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-sm font-medium transition-colors">
              <FolderOpen className="h-4 w-4 text-yellow-400" /> Files
            </Link>
            <Link href={`/devices/${device.id}/desktop`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-sm font-medium transition-colors">
              <Monitor className="h-4 w-4 text-blue-400" /> Desktop
            </Link>
            <Link href={`/devices/${device.id}/backups`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-sm font-medium transition-colors">
              <Archive className="h-4 w-4 text-purple-400" /> Backups
            </Link>
            <VirusScanButton deviceId={device.id} />
          </div>
        )}
      </div>

      {/* Quick stats */}
      {latest && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              label: "CPU",
              value: `${latest.cpuPercent.toFixed(1)}%`,
              icon: Cpu,
              warn: latest.cpuPercent >= 90,
            },
            {
              label: "RAM",
              value: `${latest.ramPercent.toFixed(1)}%`,
              icon: MemoryStick,
              sub: `${formatBytes(latest.ramUsedMb)} / ${formatBytes(latest.ramTotalMb)}`,
              warn: latest.ramPercent >= 90,
            },
            {
              label: "Disk",
              value: `${latest.diskPercent.toFixed(1)}%`,
              icon: HardDrive,
              sub: `${latest.diskUsedGb.toFixed(1)} GB / ${latest.diskTotalGb.toFixed(1)} GB`,
              warn: latest.diskPercent >= 85,
            },
            {
              label: "Last Seen",
              value: timeAgo(device.lastSeen),
              icon: Clock,
              warn: false,
            },
          ].map(({ label, value, icon: Icon, sub, warn }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <Icon className={`h-4 w-4 ${warn ? "text-destructive" : "text-muted-foreground"}`} />
                </div>
                <p className={`text-xl font-bold ${warn ? "text-destructive" : "text-foreground"}`}>
                  {value}
                </p>
                {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Device info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Device Information</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {[
              { label: "Device ID", value: device.id },
              { label: "IP Address", value: device.ipAddress ?? "Unknown" },
              { label: "Agent Version", value: device.agentVersion ?? "Unknown" },
              { label: "Registered", value: format(device.createdAt, "MMM d, yyyy") },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="font-medium text-foreground mt-0.5 font-mono text-xs break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Notes & custom fields */}
      <DeviceNotes deviceId={device.id} initialNotes={device.notes} />

      {/* Tabs */}
      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="commands">Commands</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Performance (last {device.metrics.length} samples)</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricsChart data={metricsForChart} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commands">
          <CommandPanel
            deviceId={device.id}
            isOnline={device.isOnline}
            initialCommands={commandsForPanel}
          />
        </TabsContent>

        <TabsContent value="inventory">
          <InventoryPanel deviceId={device.id} isOnline={device.isOnline} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
