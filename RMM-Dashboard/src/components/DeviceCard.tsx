import Link from "next/link";
import { Server, Clock, Cpu, MemoryStick, HardDrive } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";

interface DeviceCardProps {
  device: {
    id: string;
    name: string;
    hostname: string;
    platform: string;
    isOnline: boolean;
    lastSeen: string | null;
    ipAddress: string | null;
    latestMetric?: {
      cpuPercent: number;
      ramPercent: number;
      diskPercent: number;
    } | null;
  };
}

function MetricBar({ value, label, icon: Icon }: { value: number; label: string; icon: React.ComponentType<{className?: string}> }) {
  const color =
    value >= 90
      ? "bg-destructive"
      : value >= 75
      ? "bg-yellow-500"
      : "bg-primary";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className={value >= 90 ? "text-destructive font-medium" : ""}>{value.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function DeviceCard({ device }: DeviceCardProps) {
  return (
    <Link href={`/devices/${device.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded bg-muted shrink-0">
                <Server className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm text-foreground truncate group-hover:text-primary transition-colors">
                  {device.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{device.hostname}</p>
              </div>
            </div>
            <Badge variant={device.isOnline ? "success" : "destructive"} className="shrink-0 ml-2">
              {device.isOnline ? "Online" : "Offline"}
            </Badge>
          </div>

          {/* Platform & IP */}
          <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
            <span>{device.platform}</span>
            {device.ipAddress && (
              <>
                <span>·</span>
                <span>{device.ipAddress}</span>
              </>
            )}
          </div>

          {/* Metrics */}
          {device.isOnline && device.latestMetric ? (
            <div className="space-y-2">
              <MetricBar value={device.latestMetric.cpuPercent} label="CPU" icon={Cpu} />
              <MetricBar value={device.latestMetric.ramPercent} label="RAM" icon={MemoryStick} />
              <MetricBar value={device.latestMetric.diskPercent} label="Disk" icon={HardDrive} />
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
              <Clock className="h-3 w-3" />
              <span>Last seen {timeAgo(device.lastSeen)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
