"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { PackageOpen, Search, Loader2, Rocket, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Device { id: string; name: string; isOnline: boolean }
interface WingetPkg { PackageIdentifier?: string }
interface WingetSource { Packages?: WingetPkg[] }
interface Manifest { Sources?: WingetSource[]; [k: string]: unknown }

function packagesOf(m: Manifest | null): string[] {
  if (!m) return [];
  const ids: string[] = [];
  for (const s of m.Sources ?? []) for (const p of s.Packages ?? []) if (p.PackageIdentifier) ids.push(p.PackageIdentifier);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function filterManifest(m: Manifest, selected: Set<string>): Manifest {
  const Sources = (m.Sources ?? [])
    .map((s) => ({ ...s, Packages: (s.Packages ?? []).filter((p) => p.PackageIdentifier && selected.has(p.PackageIdentifier)) }))
    .filter((s) => (s.Packages ?? []).length > 0);
  return { ...m, Sources };
}

export default function AppsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    fetch("/api/devices").then((r) => r.json()).then(setDevices).catch(() => {});
  }, []);

  const allPkgs = useMemo(() => packagesOf(manifest), [manifest]);
  const shown = useMemo(() => allPkgs.filter((p) => p.toLowerCase().includes(filter.toLowerCase())), [allPkgs, filter]);

  const scan = useCallback(async () => {
    if (!sourceId) return;
    setScanning(true);
    setManifest(null);
    try {
      // Note current report time so we can detect the fresh one.
      const before = (await (await fetch(`/api/devices/${sourceId}/reports`)).json())?.apps?.collectedAt;
      await fetch(`/api/devices/${sourceId}/commands`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "appexport" }),
      });
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const res = await fetch(`/api/devices/${sourceId}/reports`);
        if (res.ok) {
          const data = await res.json();
          if (data.apps?.collectedAt && data.apps.collectedAt !== before) {
            setManifest(data.apps.data as Manifest);
            setScannedAt(data.apps.collectedAt);
            setSelected(new Set(packagesOf(data.apps.data as Manifest)));
            return;
          }
        }
      }
      alert("No app list came back — winget may not be installed, or no user is signed in on that device.");
    } finally {
      setScanning(false);
    }
  }, [sourceId]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelected(new Set(allPkgs));
  const selectNone = () => setSelected(new Set());

  const deploy = useCallback(async () => {
    if (!manifest || !targetId || selected.size === 0) return;
    if (!confirm(`Install ${selected.size} app(s) on the target device? This runs winget in the background and can take a while.`)) return;
    setDeploying(true);
    try {
      const res = await fetch("/api/apps/deploy", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDeviceId: targetId, manifest: filterManifest(manifest, selected), count: selected.size }),
      });
      const j = await res.json().catch(() => ({}));
      alert(res.ok ? "Install dispatched. It runs in the background on the target; check that device's Commands tab for the winget output." : (j.error ?? "Failed"));
    } finally {
      setDeploying(false);
    }
  }, [manifest, targetId, selected]);

  const fieldCls = "bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><PackageOpen className="h-6 w-6 text-primary" /> App Deploy</h1>
        <p className="text-muted-foreground text-sm mt-1">Replicate installed apps from one machine to another via winget. Scan a source, untick what you don&apos;t want (work/IT stays), then install on a target.</p>
      </div>

      {/* Step 1: scan source */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Source device</label>
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={fieldCls}>
            <option value="">Select…</option>
            {devices.map((d) => <option key={d.id} value={d.id} disabled={!d.isOnline}>{d.name}{d.isOnline ? "" : " (offline)"}</option>)}
          </select>
        </div>
        <Button onClick={scan} disabled={!sourceId || scanning} className="gap-1">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {scanning ? "Scanning…" : "Scan installed apps"}
        </Button>
        {scanning && <span className="text-xs text-muted-foreground">Running winget export on the device (can take a minute)…</span>}
      </div>

      {/* Step 2: pick list */}
      {manifest && (
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{allPkgs.length} apps found</span>
            <span className="text-xs text-muted-foreground">· {selected.size} selected{scannedAt ? ` · scanned ${new Date(scannedAt).toLocaleTimeString()}` : ""}</span>
            <button onClick={selectAll} className="text-xs text-primary hover:underline ml-2">All</button>
            <button onClick={selectNone} className="text-xs text-primary hover:underline">None</button>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter…" className={`${fieldCls} ml-auto`} />
          </div>

          <div className="bg-card border border-border rounded-lg max-h-96 overflow-auto divide-y divide-border/50">
            {shown.map((id) => (
              <button key={id} onClick={() => toggle(id)} className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm hover:bg-accent/40">
                {selected.has(id) ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="font-mono text-xs">{id}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="px-3 py-6 text-sm text-muted-foreground text-center">No apps match the filter.</p>}
          </div>

          {/* Step 3: deploy */}
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Target device</label>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={fieldCls}>
                <option value="">Select…</option>
                {devices.filter((d) => d.id !== sourceId).map((d) => <option key={d.id} value={d.id} disabled={!d.isOnline}>{d.name}{d.isOnline ? "" : " (offline)"}</option>)}
              </select>
            </div>
            <Button onClick={deploy} disabled={!targetId || selected.size === 0 || deploying} className="gap-1">
              {deploying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Install {selected.size} app(s)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Only apps in the winget catalog install this way; licences/activation don&apos;t carry over.</p>
        </div>
      )}
    </div>
  );
}
