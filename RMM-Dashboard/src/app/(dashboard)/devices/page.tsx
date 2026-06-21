export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { DeviceCard } from "@/components/DeviceCard";
import { Monitor, Building2, Server } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

async function getDevices() {
  return prisma.device.findMany({
    orderBy: [{ isOnline: "desc" }, { name: "asc" }],
    include: {
      company: { select: { id: true, name: true } },
      metrics: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  });
}

type DeviceWithRelations = Awaited<ReturnType<typeof getDevices>>[number];

function DeviceGrid({ devices }: { devices: DeviceWithRelations[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {devices.map((device) => (
        <DeviceCard
          key={device.id}
          device={{
            ...device,
            lastSeen: device.lastSeen?.toISOString() ?? null,
            latestMetric: device.isOnline ? device.metrics[0] ?? null : null,
          }}
        />
      ))}
    </div>
  );
}

export default async function DevicesPage() {
  const devices = await getDevices();
  const online = devices.filter((d) => d.isOnline);
  const offline = devices.filter((d) => !d.isOnline);

  // Group by company (named groups sorted by company name, then Unassigned last)
  const groups = new Map<string, { name: string; devices: DeviceWithRelations[] }>();
  for (const d of devices) {
    const key = d.company?.id ?? "__none__";
    if (!groups.has(key)) {
      groups.set(key, { name: d.company?.name ?? "Unassigned", devices: [] });
    }
    groups.get(key)!.devices.push(d);
  }
  const ordered = [...groups.entries()]
    .sort(([ak, av], [bk, bv]) => {
      if (ak === "__none__") return 1;
      if (bk === "__none__") return -1;
      return av.name.localeCompare(bv.name);
    })
    .map(([, v]) => v);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Devices</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {online.length} online · {offline.length} offline · grouped by company
        </p>
      </div>

      {devices.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium">No devices registered</p>
            <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">
              Install the agent on a machine and use the registration API to add it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        ordered.map((group) => {
          const groupOnline = group.devices.filter((d) => d.isOnline).length;
          const isNamed = group.name !== "Unassigned";
          return (
            <section key={group.name}>
              <h2 className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                {isNamed ? (
                  <Building2 className="h-4 w-4 text-primary" />
                ) : (
                  <Server className="h-4 w-4 text-muted-foreground" />
                )}
                {group.name}
                <span className="text-muted-foreground font-normal">
                  — {group.devices.length} ({groupOnline} online)
                </span>
              </h2>
              <DeviceGrid devices={group.devices} />
            </section>
          );
        })
      )}
    </div>
  );
}
