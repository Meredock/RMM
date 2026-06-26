"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Bell, CheckCircle, Filter } from "lucide-react";
import { AlertRulesManager } from "@/components/AlertRulesManager";
import { timeAgo } from "@/lib/utils";

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: string;
  isResolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  device: { id: string; name: string } | null;
}

const severityVariant: Record<string, "destructive" | "warning" | "secondary"> = {
  CRITICAL: "destructive",
  WARNING: "warning",
  INFO: "secondary",
};

const alertTypeLabel: Record<string, string> = {
  DEVICE_OFFLINE: "Device Offline",
  HIGH_CPU: "High CPU",
  HIGH_RAM: "High RAM",
  HIGH_DISK: "High Disk",
  COMMAND_FAILED: "Command Failed",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [filter, setFilter] = useState<"unresolved" | "all">("unresolved");
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);

  async function fetchAlerts() {
    const url = filter === "unresolved" ? "/api/alerts?resolved=false" : "/api/alerts";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setAlerts(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    fetchAlerts();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function resolveAlert(id: string) {
    setResolving(id);
    const res = await fetch(`/api/alerts/${id}`, { method: "PATCH" });
    if (res.ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }
    setResolving(null);
  }

  async function resolveAll() {
    const unresolved = alerts.filter((a) => !a.isResolved);
    await Promise.all(unresolved.map((a) => fetch(`/api/alerts/${a.id}`, { method: "PATCH" })));
    fetchAlerts();
  }

  const unresolved = alerts.filter((a) => !a.isResolved);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {unresolved.length} unresolved alert{unresolved.length !== 1 ? "s" : ""}
          </p>
        </div>
        {unresolved.length > 0 && (
          <Button variant="outline" size="sm" onClick={resolveAll}>
            <CheckCircle className="h-4 w-4 mr-2" />
            Resolve All
          </Button>
        )}
      </div>

      <AlertRulesManager />

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(["unresolved", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors capitalize ${
              filter === f
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading...</div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-medium">
              {filter === "unresolved" ? "No active alerts" : "No alerts found"}
            </p>
            <p className="text-muted-foreground text-sm mt-1">
              {filter === "unresolved"
                ? "All systems are operating normally."
                : "Alerts will appear here when triggered by your devices."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-4 px-4 py-4 ${
                  alert.isResolved ? "opacity-50" : ""
                }`}
              >
                <Badge variant={severityVariant[alert.severity] ?? "secondary"} className="mt-0.5 shrink-0">
                  {alert.severity}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {alertTypeLabel[alert.type] ?? alert.type}
                    </span>
                    {alert.device && (
                      <a
                        href={`/devices/${alert.device.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        {alert.device.name}
                      </a>
                    )}
                  </div>
                  <p className="text-sm text-foreground mt-1">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {timeAgo(alert.createdAt)}
                    {alert.isResolved && alert.resolvedAt && (
                      <> · Resolved {timeAgo(alert.resolvedAt)}</>
                    )}
                  </p>
                </div>
                {!alert.isResolved && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resolveAlert(alert.id)}
                    disabled={resolving === alert.id}
                    className="shrink-0"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Resolve
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
