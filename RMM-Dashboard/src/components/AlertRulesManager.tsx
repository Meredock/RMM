"use client";

import { useEffect, useState, useCallback } from "react";
import { SlidersHorizontal, Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Rule {
  id: string;
  type: string;
  threshold: number | null;
  severity: string;
  isEnabled: boolean;
  deviceId: string | null;
  deviceName: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  HIGH_CPU: "High CPU",
  HIGH_RAM: "High RAM",
  HIGH_DISK: "High Disk",
  DEVICE_OFFLINE: "Device Offline",
};
const THRESHOLD_TYPES = ["HIGH_CPU", "HIGH_RAM", "HIGH_DISK"];

export function AlertRulesManager() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fType, setFType] = useState("HIGH_CPU");
  const [fThreshold, setFThreshold] = useState("90");
  const [fSeverity, setFSeverity] = useState("WARNING");

  const fetchRules = useCallback(async () => {
    const res = await fetch("/api/alert-rules");
    if (res.ok) setRules(await res.json());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (open && !loaded) fetchRules();
  }, [open, loaded, fetchRules]);

  const add = useCallback(async () => {
    const body: Record<string, unknown> = { type: fType, severity: fSeverity };
    if (THRESHOLD_TYPES.includes(fType)) body.threshold = Number(fThreshold);
    const res = await fetch("/api/alert-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) fetchRules();
    else { const e = await res.json().catch(() => ({})); alert(e.error ?? "Failed"); }
  }, [fType, fThreshold, fSeverity, fetchRules]);

  const toggle = useCallback(async (r: Rule) => {
    await fetch(`/api/alert-rules/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isEnabled: !r.isEnabled }),
    });
    fetchRules();
  }, [fetchRules]);

  const remove = useCallback(async (r: Rule) => {
    await fetch(`/api/alert-rules/${r.id}`, { method: "DELETE" });
    fetchRules();
  }, [fetchRules]);

  return (
    <div className="bg-card border border-border rounded-lg">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 w-full px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <SlidersHorizontal className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Alert Rules</span>
        <span className="text-xs text-muted-foreground">— thresholds that auto-raise alerts &amp; notify</span>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-3">
          {/* Add rule */}
          <div className="flex flex-wrap items-end gap-2">
            <select value={fType} onChange={(e) => setFType(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {THRESHOLD_TYPES.includes(fType) && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">≥</span>
                <input value={fThreshold} onChange={(e) => setFThreshold(e.target.value)} inputMode="numeric"
                  className="w-16 bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
            <select value={fSeverity} onChange={(e) => setFSeverity(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="INFO">Info</option>
              <option value="WARNING">Warning</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <Button size="sm" onClick={add} className="h-8 text-xs gap-1"><Plus className="h-3.5 w-3.5" /> Add rule</Button>
            <span className="text-xs text-muted-foreground">Applies to all devices.</span>
          </div>

          {/* Existing rules */}
          {!loaded ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : rules.length === 0 ? (
            <p className="text-xs text-muted-foreground">No rules yet. Add one above (e.g. CPU ≥ 90%).</p>
          ) : (
            <div className="space-y-1">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-sm py-1.5 border-t border-border/50">
                  <span className="font-medium">{TYPE_LABEL[r.type] ?? r.type}</span>
                  {r.threshold != null && <span className="text-muted-foreground">≥ {r.threshold}%</span>}
                  <Badge variant={r.severity === "CRITICAL" ? "destructive" : r.severity === "INFO" ? "secondary" : "warning"} className="text-xs">{r.severity}</Badge>
                  <span className="text-xs text-muted-foreground">{r.deviceName ?? "all devices"}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => toggle(r)} className={r.isEnabled ? "text-green-400" : "text-muted-foreground"} title={r.isEnabled ? "Enabled" : "Disabled"}>
                      {r.isEnabled ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
