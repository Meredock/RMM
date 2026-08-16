"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Loader2,
  Download,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface PatchInfo {
  id: string;
  source: "WINDOWS_UPDATE" | "WINGET";
  externalId: string;
  version: string;
  title: string;
  severity: "CRITICAL" | "IMPORTANT" | "MODERATE" | "LOW" | "UNKNOWN";
  category: string | null;
  kb: string | null;
}

interface StatusRow {
  id: string;
  state:
    | "MISSING"
    | "INSTALLING"
    | "INSTALLED"
    | "FAILED"
    | "REBOOT_PENDING"
    | "RESOLVED";
  firstSeenAt: string;
  installedAt: string | null;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  patch: PatchInfo;
}

interface PatchesResponse {
  device: {
    platform: string;
    isOnline: boolean;
    rebootPending: boolean;
    lastPatchScanAt: string | null;
  };
  summary: {
    missing: number;
    missingCritical: number;
    installing: number;
    rebootPending: number;
    failed: number;
  };
  statuses: StatusRow[];
}

const severityBadge: Record<PatchInfo["severity"], "destructive" | "warning" | "secondary" | "outline"> = {
  CRITICAL: "destructive",
  IMPORTANT: "warning",
  MODERATE: "secondary",
  LOW: "outline",
  UNKNOWN: "outline",
};

function sevRank(s: PatchInfo["severity"]) {
  return { CRITICAL: 0, IMPORTANT: 1, MODERATE: 2, LOW: 3, UNKNOWN: 4 }[s];
}

export function PatchPanel({ deviceId, isOnline, platform }: { deviceId: string; isOnline: boolean; platform: string }) {
  const [data, setData] = useState<PatchesResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async (): Promise<PatchesResponse | null> => {
    const res = await fetch(`/api/devices/${deviceId}/patches`);
    if (!res.ok) return null;
    const json: PatchesResponse = await res.json();
    setData(json);
    return json;
  }, [deviceId]);

  useEffect(() => {
    load();
  }, [load]);

  // Fire a scan, then poll until lastPatchScanAt moves (WUA can take minutes).
  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const before = data?.device.lastPatchScanAt ?? null;
      await fetch(`/api/devices/${deviceId}/patches/scan`, { method: "POST" });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const fresh = await load();
        if (fresh?.device.lastPatchScanAt && fresh.device.lastPatchScanAt !== before) break;
      }
    } finally {
      setScanning(false);
    }
  }, [deviceId, data, load]);

  const installSelected = useCallback(async () => {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Install ${selected.size} selected patch(es) now? OS updates may require a reboot to complete.`
      )
    )
      return;
    setInstalling(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/patches/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusIds: [...selected] }),
      });
      if (res.ok) {
        setSelected(new Set());
        await load();
      } else {
        const err = await res.json().catch(() => null);
        alert(err?.error ?? "Failed to dispatch install");
      }
    } finally {
      setInstalling(false);
    }
  }, [deviceId, selected, load]);

  const missing = useMemo(
    () =>
      (data?.statuses ?? [])
        .filter((s) => s.state === "MISSING" || s.state === "FAILED")
        .sort(
          (a, b) =>
            sevRank(a.patch.severity) - sevRank(b.patch.severity) ||
            a.patch.title.localeCompare(b.patch.title)
        ),
    [data]
  );

  const activity = useMemo(
    () =>
      (data?.statuses ?? [])
        .filter((s) => s.state === "INSTALLING" || s.state === "REBOOT_PENDING" || s.state === "INSTALLED")
        .slice(0, 25),
    [data]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = missing.length > 0 && missing.every((s) => selected.has(s.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(missing.map((s) => s.id)));

  const unsupported = platform !== "windows" && platform !== "unknown";

  return (
    <div className="space-y-6">
      {/* Header / summary */}
      <div className="bg-card border border-border rounded-lg">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Patch Status</span>
          {data && (
            <>
              <Badge variant={data.summary.missing > 0 ? "warning" : "success"}>
                {data.summary.missing} missing
              </Badge>
              {data.summary.missingCritical > 0 && (
                <Badge variant="destructive">{data.summary.missingCritical} critical</Badge>
              )}
              {data.summary.installing > 0 && (
                <Badge variant="secondary">{data.summary.installing} installing</Badge>
              )}
              {data.summary.failed > 0 && (
                <Badge variant="destructive">{data.summary.failed} failed</Badge>
              )}
              {data.device.rebootPending && (
                <Badge variant="warning" className="gap-1">
                  <RotateCcw className="h-3 w-3" /> reboot pending
                </Badge>
              )}
            </>
          )}
          <span className="text-xs text-muted-foreground ml-1">
            {data?.device.lastPatchScanAt
              ? `scanned ${formatDistanceToNow(new Date(data.device.lastPatchScanAt), { addSuffix: true })}`
              : "never scanned"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {missing.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-amber-400 hover:text-amber-300"
                disabled={!isOnline || installing || selected.size === 0}
                onClick={installSelected}
              >
                {installing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Install selected ({selected.size})
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              disabled={!isOnline || scanning}
              onClick={scan}
            >
              {scanning ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Scan
            </Button>
          </div>
        </div>

        {/* Missing patches */}
        <div className="max-h-96 overflow-auto">
          {unsupported ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              Patch scanning currently supports Windows devices only.
            </p>
          ) : !data || data.statuses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              {isOnline
                ? "Click Scan to check for missing OS updates and outdated apps (can take a few minutes)."
                : "Device offline."}
            </p>
          ) : missing.length === 0 ? (
            <p className="px-4 py-6 text-sm text-green-400 text-center">
              Up to date — no missing patches.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 w-8">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  </th>
                  <th className="text-left px-2 py-2 font-medium">Patch</th>
                  <th className="text-left px-2 py-2 font-medium">Source</th>
                  <th className="text-left px-2 py-2 font-medium">Severity</th>
                  <th className="text-left px-2 py-2 font-medium">KB / Version</th>
                  <th className="text-left px-2 py-2 font-medium">First seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {missing.map((s) => (
                  <tr key={s.id} className="hover:bg-accent/30">
                    <td className="px-4 py-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {s.patch.title}
                      {s.state === "FAILED" && (
                        <span
                          className="ml-2 inline-flex items-center gap-1 text-xs text-destructive"
                          title={s.lastError ?? undefined}
                        >
                          <AlertTriangle className="h-3 w-3" /> failed ×{s.attempts}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Badge variant="outline" className="text-xs">
                        {s.patch.source === "WINDOWS_UPDATE" ? "Windows Update" : "winget"}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5">
                      {s.patch.severity !== "UNKNOWN" && (
                        <Badge variant={severityBadge[s.patch.severity]} className="text-xs">
                          {s.patch.severity.toLowerCase()}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      {s.patch.kb ? `KB${s.patch.kb.replace(/^KB/i, "")}` : s.patch.version || ""}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(s.firstSeenAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <div className="bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Download className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Recent Patch Activity</span>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/50">
              {activity.map((s) => (
                <tr key={s.id} className="hover:bg-accent/30">
                  <td className="px-4 py-1.5">{s.patch.title}</td>
                  <td className="px-2 py-1.5">
                    <Badge
                      variant={
                        s.state === "INSTALLED"
                          ? "success"
                          : s.state === "REBOOT_PENDING"
                            ? "warning"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {s.state === "INSTALLING" && (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      )}
                      {s.state.replace("_", " ").toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-4 py-1.5 text-xs text-muted-foreground text-right whitespace-nowrap">
                    {formatDistanceToNow(new Date(s.updatedAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
