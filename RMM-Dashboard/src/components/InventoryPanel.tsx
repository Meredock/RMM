"use client";

import { useEffect, useState, useCallback } from "react";
import { Package, ShieldAlert, RefreshCw, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface SoftwareItem { name: string; version?: string; publisher?: string }
interface UpdateItem { title: string; severity?: string; kb?: string }
interface Reports {
  software?: { data: SoftwareItem | SoftwareItem[]; collectedAt: string };
  updates?: { data: { count: number; updates: UpdateItem[] }; collectedAt: string };
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export function InventoryPanel({ deviceId, isOnline }: { deviceId: string; isOnline: boolean }) {
  const [reports, setReports] = useState<Reports>({});
  const [busy, setBusy] = useState<"inventory" | "winupdates" | null>(null);
  const [installing, setInstalling] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/devices/${deviceId}/reports`);
    if (res.ok) setReports(await res.json());
  }, [deviceId]);

  useEffect(() => { load(); }, [load]);

  // Dispatch a collection command, then poll for the refreshed report.
  const collect = useCallback(async (command: "inventory" | "winupdates") => {
    setBusy(command);
    try {
      await fetch(`/api/devices/${deviceId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const kind = command === "inventory" ? "software" : "updates";
      const before = reports[kind]?.collectedAt;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch(`/api/devices/${deviceId}/reports`);
        if (res.ok) {
          const data: Reports = await res.json();
          if (data[kind]?.collectedAt && data[kind]?.collectedAt !== before) {
            setReports(data);
            break;
          }
        }
      }
    } finally {
      setBusy(null);
    }
  }, [deviceId, reports]);

  const installAll = useCallback(async () => {
    if (!confirm("Download and install all pending updates now? This can take several minutes and the device may reboot.")) return;
    setInstalling(true);
    try {
      await fetch(`/api/devices/${deviceId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: "installupdates" }),
      });
      alert("Update install started. It runs in the background (may reboot the device); the result appears in the Commands tab. Re-Check later to refresh the pending count.");
    } finally {
      setInstalling(false);
    }
  }, [deviceId]);

  const software = asArray(reports.software?.data);
  const updates = reports.updates?.data;

  return (
    <div className="space-y-6">
      {/* Software */}
      <div className="bg-card border border-border rounded-lg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Installed Software</span>
          {reports.software && <span className="text-xs text-muted-foreground">· {software.length} · {formatDistanceToNow(new Date(reports.software.collectedAt), { addSuffix: true })}</span>}
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs gap-1" disabled={!isOnline || busy === "inventory"} onClick={() => collect("inventory")}>
            {busy === "inventory" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Scan
          </Button>
        </div>
        <div className="max-h-80 overflow-auto">
          {software.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">{isOnline ? "Click Scan to collect installed software." : "Device offline."}</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/50">
                {software.map((s, i) => (
                  <tr key={i} className="hover:bg-accent/30">
                    <td className="px-4 py-1.5">{s.name}</td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs whitespace-nowrap">{s.version ?? ""}</td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs">{s.publisher ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Windows Updates */}
      <div className="bg-card border border-border rounded-lg">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">Pending Windows Updates</span>
          {updates && <Badge variant={updates.count > 0 ? "warning" : "success"} className="text-xs">{updates.count}</Badge>}
          {reports.updates && <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(reports.updates.collectedAt), { addSuffix: true })}</span>}
          <div className="ml-auto flex items-center gap-1">
            {updates && updates.count > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-amber-400 hover:text-amber-300" disabled={!isOnline || installing} onClick={installAll}>
                {installing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Install all
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={!isOnline || busy === "winupdates"} onClick={() => collect("winupdates")}>
              {busy === "winupdates" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Check
            </Button>
          </div>
        </div>
        <div className="max-h-80 overflow-auto">
          {!updates ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">{isOnline ? "Click Check to query pending updates (can take a minute)." : "Device offline."}</p>
          ) : updates.count === 0 ? (
            <p className="px-4 py-6 text-sm text-green-400 text-center">Up to date — no pending updates.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/50">
                {updates.updates.map((u, i) => (
                  <tr key={i} className="hover:bg-accent/30">
                    <td className="px-4 py-1.5">{u.title}</td>
                    <td className="px-4 py-1.5 text-muted-foreground text-xs whitespace-nowrap">{u.severity ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
