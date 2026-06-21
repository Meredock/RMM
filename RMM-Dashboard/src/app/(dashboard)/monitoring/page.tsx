"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, Plus, Trash2, RefreshCw, Globe, Server, Loader2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface Device {
  id: string;
  name: string;
}

interface Monitor {
  id: string;
  name: string;
  url: string;
  expectedStatus: number | null;
  timeoutMs: number;
  intervalMinutes: number;
  deviceId: string | null;
  enabled: boolean;
  lastOk: boolean | null;
  lastStatus: number | null;
  lastDurationMs: number | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  device: { id: string; name: string } | null;
}

const INTERVALS = [
  { label: "1 min", minutes: 1 },
  { label: "5 min", minutes: 5 },
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "Hourly", minutes: 60 },
];

function StatusBadge({ m }: { m: Monitor }) {
  if (!m.enabled) return <Badge variant="secondary" className="text-xs">Paused</Badge>;
  if (m.lastOk === null) return <Badge variant="outline" className="text-xs text-muted-foreground">Pending</Badge>;
  return m.lastOk ? (
    <Badge variant="success" className="text-xs">Up</Badge>
  ) : (
    <Badge variant="destructive" className="text-xs">Down</Badge>
  );
}

export default function MonitoringPage() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());

  const [fName, setFName] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fInterval, setFInterval] = useState(5);
  const [fRunFrom, setFRunFrom] = useState(""); // "" = server, else deviceId
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [mRes, dRes] = await Promise.all([fetch("/api/monitors"), fetch("/api/devices")]);
    if (mRes.ok) setMonitors(await mRes.json());
    if (dRes.ok) setDevices(await dRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 10_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const create = useCallback(async () => {
    if (!fName.trim() || !fUrl.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fName.trim(),
          url: fUrl.trim(),
          expectedStatus: fStatus ? Number(fStatus) : null,
          intervalMinutes: fInterval,
          deviceId: fRunFrom || null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.error ?? "Could not create monitor");
        return;
      }
      setFName(""); setFUrl(""); setFStatus(""); setFInterval(5); setFRunFrom("");
      setShowCreate(false);
      fetchData();
    } finally {
      setSaving(false);
    }
  }, [fName, fUrl, fStatus, fInterval, fRunFrom, fetchData]);

  const toggle = useCallback(async (m: Monitor) => {
    await fetch(`/api/monitors/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !m.enabled }),
    });
    fetchData();
  }, [fetchData]);

  const remove = useCallback(async (id: string) => {
    if (!confirm("Delete this monitor and its history?")) return;
    await fetch(`/api/monitors/${id}`, { method: "DELETE" });
    fetchData();
  }, [fetchData]);

  const checkNow = useCallback(async (id: string) => {
    setChecking((s) => new Set(s).add(id));
    try {
      const res = await fetch(`/api/monitors/${id}/check`, { method: "POST" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        if (e.error) alert(e.error);
      }
      await fetchData();
    } finally {
      setChecking((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }, [fetchData]);

  const upCount = monitors.filter((m) => m.enabled && m.lastOk === true).length;
  const downCount = monitors.filter((m) => m.enabled && m.lastOk === false).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Monitoring</h1>
          <p className="text-muted-foreground text-sm mt-1">
            HTTP endpoint health checks · {upCount} up · {downCount} down
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)} className="gap-1">
          <Plus className="h-4 w-4" /> New Monitor
        </Button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-4 max-w-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">New Monitor</h3>
            <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Name</label>
              <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Acme website"
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">URL</label>
              <input value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="https://acme.com/health"
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Expected status <span className="text-muted-foreground/60">(optional)</span></label>
              <input value={fStatus} onChange={(e) => setFStatus(e.target.value)} placeholder="200" inputMode="numeric"
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Interval</label>
              <select value={fInterval} onChange={(e) => setFInterval(Number(e.target.value))}
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {INTERVALS.map((i) => <option key={i.minutes} value={i.minutes}>{i.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Run from</label>
              <select value={fRunFrom} onChange={(e) => setFRunFrom(e.target.value)}
                className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">Dashboard server (public URLs)</option>
                {devices.map((d) => <option key={d.id} value={d.id}>From agent: {d.name} (internal/LAN)</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={create} disabled={saving} className="h-7 text-xs">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
      ) : monitors.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No monitors yet. <button onClick={() => setShowCreate(true)} className="text-primary hover:underline">Add one</button>
        </div>
      ) : (
        <div className="space-y-2 max-w-4xl">
          {monitors.map((m) => (
            <div key={m.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <Activity className={`h-4 w-4 shrink-0 ${m.lastOk === false ? "text-destructive" : m.lastOk ? "text-green-400" : "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{m.name}</span>
                  <StatusBadge m={m} />
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {m.deviceId ? <><Server className="h-3 w-3" /> {m.device?.name ?? "agent"}</> : <><Globe className="h-3 w-3" /> server</>}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground font-mono truncate">{m.url}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                  {m.lastStatus != null && <span>HTTP {m.lastStatus}</span>}
                  {m.lastDurationMs != null && <span>{m.lastDurationMs}ms</span>}
                  {m.lastError && <span className="text-red-400">{m.lastError}</span>}
                  {m.lastCheckedAt && <span>checked {formatDistanceToNow(new Date(m.lastCheckedAt), { addSuffix: true })}</span>}
                  <span>every {m.intervalMinutes}m</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={checking.has(m.id)} onClick={() => checkNow(m.id)} title="Check now">
                  {checking.has(m.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
                <button onClick={() => toggle(m)} title={m.enabled ? "Pause" : "Resume"}
                  className={m.enabled ? "text-green-400" : "text-muted-foreground"}>
                  {m.enabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(m.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
