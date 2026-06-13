export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { DeviceCard } from "@/components/DeviceCard";
import { Monitor } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

async function getDevices() {
  return prisma.device.findMany({
    orderBy: [{ isOnline: "desc" }, { name: "asc" }],
    include: {
      metrics: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
    },
  });
}

export default async function DevicesPage() {
  const devices = await getDevices();

  const online = devices.filter((d) => d.isOnline);
  const offline = devices.filter((d) => !d.isOnline);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Devices</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {online.length} online · {offline.length} offline
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
        <>
          {online.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Online — {online.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {online.map((device) => (
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
            </section>
          )}

          {offline.length > 0 && (
            <section>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Offline — {offline.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {offline.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={{
                      ...device,
                      lastSeen: device.lastSeen?.toISOString() ?? null,
                      latestMetric: null,
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
