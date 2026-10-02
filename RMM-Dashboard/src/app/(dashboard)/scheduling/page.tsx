"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "@/components/SessionContext";
import { taskRunsScript } from "@/lib/permissions";
import { Clock, Plus, Trash2, Play, Loader2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Device { id: string; name: string; isOnline: boolean }
interface Company { id: string; name: string }
interface Script { id: string; name: string; shell: string }

interface Win {
  id: string;
  name: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  timezone: string;
  enabled: boolean;
}

interface Task {
  id: string;
  name: string;
  action: "SCRIPT" | "COMMAND";
  scriptName: string | null;
  command: string | null;
  target: "DEVICE" | "COMPANY" | "ALL";
  deviceName: string | null;
  companyName: string | null;
  onlyOnline: boolean;
  intervalMinutes: number;
  windowId: string | null;
  windowName: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRun: { dispatchedAt: string; deviceCount: number; detail: string | null } | null;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const INTERVALS = [
  { label: "Hourly", m: 60 },
  { label: "Every 6 hours", m: 360 },
  { label: "Every 12 hours", m: 720 },
  { label: "Daily", m: 1440 },
  { label: "Weekly", m: 10080 },
];
const COMMAND_PRESETS = [
  { label: "Inventory (installed software)", cmd: "inventory" },
  { label: "Windows Update scan", cmd: "winupdates" },
  { label: "Patch scan (needs v1.1.6 agent)", cmd: "patchscan" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const minsToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const timeToMins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function fmtInterval(m: number): string {
  if (m % 10080 === 0) return `every ${m / 10080}w`;
  if (m % 1440 === 0) return `every ${m / 1440}d`;
  if (m % 60 === 0) return `every ${m / 60}h`;
  return `every ${m}m`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtWindow(w: Win): string {
  const days = w.daysOfWeek.length === 7 ? "Every day" : w.daysOfWeek.map((d) => DOW[d]).join(", ");
  return `${days} · ${minsToTime(w.startMinute)}–${minsToTime(w.endMinute)} ${w.timezone}`;
}

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export default function SchedulingPage() {
  const { isAdmin } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [windows, setWindows] = useState<Win[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [busy, setBusy] = useState(false);

  // New task form
  const [name, setName] = useState("");
  const [action, setAction] = useState<"SCRIPT" | "COMMAND">("COMMAND");
  const [scriptId, setScriptId] = useState("");
  const [command, setCommand] = useState("inventory");
  const [target, setTarget] = useState<"DEVICE" | "COMPANY" | "ALL">("DEVICE");
  const [deviceId, setDeviceId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(1440);
  const [windowId, setWindowId] = useState("");

  // New window form
  const [wName, setWName] = useState("");
  const [wDays, setWDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [wStart, setWStart] = useState("02:00");
  const [wEnd, setWEnd] = useState("04:00");
  const [wTz, setWTz] = useState(browserTz());

  const load = useCallback(async () => {
    const [t, w, d, c, s] = await Promise.all([
      fetch("/api/scheduled-tasks").then((r) => r.json()).catch(() => []),
      fetch("/api/maintenance-windows").then((r) => r.json()).catch(() => []),
      fetch("/api/devices").then((r) => r.json()).catch(() => []),
      fetch("/api/companies").then((r) => r.json()).catch(() => []),
      fetch("/api/scripts").then((r) => r.json()).catch(() => []),
    ]);
    setTasks(Array.isArray(t) ? t : []);
    setWindows(Array.isArray(w) ? w : []);
    setDevices(Array.isArray(d) ? d : []);
    setCompanies(Array.isArray(c) ? c : []);
    setScripts(Array.isArray(s) ? s : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createTask = useCallback(async () => {
    setBusy(true);
    try {
      const body = {
        name,
        action,
        scriptId: action === "SCRIPT" ? scriptId : undefined,
        command: action === "COMMAND" ? command : undefined,
        target,
        deviceId: target === "DEVICE" ? deviceId : undefined,
        companyId: target === "COMPANY" ? companyId : undefined,
        onlyOnline,
        intervalMinutes,
        windowId: windowId || undefined,
      };
      const res = await fetch("/api/scheduled-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setName("");
        await load();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Failed to create task");
      }
    } finally {
      setBusy(false);
    }
  }, [name, action, scriptId, command, target, deviceId, companyId, onlyOnline, intervalMinutes, windowId, load]);

  const runTask = useCallback(async (id: string) => {
    const res = await fetch(`/api/scheduled-tasks/${id}/run`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    alert(res.ok ? `Dispatched to ${j.dispatched} device(s).` : (j.error ?? "Failed"));
    await load();
  }, [load]);

  const toggleTask = useCallback(async (t: Task) => {
    await fetch(`/api/scheduled-tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !t.enabled }),
    });
    await load();
  }, [load]);

  const deleteTask = useCallback(async (t: Task) => {
    if (!confirm(`Delete scheduled task "${t.name}"?`)) return;
    await fetch(`/api/scheduled-tasks/${t.id}`, { method: "DELETE" });
    await load();
  }, [load]);

  const createWindow = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/maintenance-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wName,
          daysOfWeek: wDays,
          startMinute: timeToMins(wStart),
          endMinute: timeToMins(wEnd),
          timezone: wTz,
        }),
      });
      if (res.ok) {
        setWName("");
        await load();
      } else {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Failed to create window");
      }
    } finally {
      setBusy(false);
    }
  }, [wName, wDays, wStart, wEnd, wTz, load]);

  const deleteWindow = useCallback(async (w: Win) => {
    if (!confirm(`Delete maintenance window "${w.name}"? Tasks using it will revert to running any time.`)) return;
    await fetch(`/api/maintenance-windows/${w.id}`, { method: "DELETE" });
    await load();
  }, [load]);

  const toggleDay = (d: number) =>
    setWDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));

  const fieldCls = "bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";
  const canCreate = name.trim() && (action === "SCRIPT" ? scriptId : command.trim()) &&
    (target === "DEVICE" ? deviceId : target === "COMPANY" ? companyId : true);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Clock className="h-6 w-6 text-primary" /> Scheduling
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Run scripts and commands on a schedule. Optionally gate a task to a maintenance window so it only fires off-hours.
        </p>
      </div>

      {/* Create task */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3 max-w-4xl">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> New scheduled task</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly inventory" className={`${fieldCls} w-full`} />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>What to run</span>
            <select value={action} onChange={(e) => setAction(e.target.value as "SCRIPT" | "COMMAND")} className={`${fieldCls} w-full`}>
              <option value="COMMAND">Command</option>
              {isAdmin && <option value="SCRIPT">Saved script</option>}
            </select>
          </label>

          {action === "SCRIPT" ? (
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Script</span>
              <select value={scriptId} onChange={(e) => setScriptId(e.target.value)} className={`${fieldCls} w-full`}>
                <option value="">Select…</option>
                {scripts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.shell})</option>)}
              </select>
            </label>
          ) : (
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Command</span>
              <input value={command} onChange={(e) => setCommand(e.target.value)} list="cmd-presets" placeholder="inventory" className={`${fieldCls} w-full font-mono`} />
              <datalist id="cmd-presets">
                {COMMAND_PRESETS.map((p) => <option key={p.cmd} value={p.cmd}>{p.label}</option>)}
              </datalist>
            </label>
          )}

          <label className="text-xs text-muted-foreground space-y-1">
            <span>Interval</span>
            <select value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number(e.target.value))} className={`${fieldCls} w-full`}>
              {INTERVALS.map((i) => <option key={i.m} value={i.m}>{i.label}</option>)}
              {!INTERVALS.some((i) => i.m === intervalMinutes) && <option value={intervalMinutes}>{fmtInterval(intervalMinutes)}</option>}
            </select>
          </label>

          <label className="text-xs text-muted-foreground space-y-1">
            <span>Target</span>
            <select value={target} onChange={(e) => setTarget(e.target.value as "DEVICE" | "COMPANY" | "ALL")} className={`${fieldCls} w-full`}>
              <option value="DEVICE">One device</option>
              <option value="COMPANY">A company</option>
              <option value="ALL">All devices</option>
            </select>
          </label>

          {target === "DEVICE" && (
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Device</span>
              <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className={`${fieldCls} w-full`}>
                <option value="">Select…</option>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.isOnline ? "" : " (offline)"}</option>)}
              </select>
            </label>
          )}
          {target === "COMPANY" && (
            <label className="text-xs text-muted-foreground space-y-1">
              <span>Company</span>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${fieldCls} w-full`}>
                <option value="">Select…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          <label className="text-xs text-muted-foreground space-y-1">
            <span>Maintenance window (optional)</span>
            <select value={windowId} onChange={(e) => setWindowId(e.target.value)} className={`${fieldCls} w-full`}>
              <option value="">Any time</option>
              {windows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} />
            Only online devices
          </label>
          <Button onClick={createTask} disabled={!canCreate || busy} className="gap-1 ml-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create task
          </Button>
        </div>
      </div>

      {/* Tasks list */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Scheduled tasks ({tasks.length})</div>
        {tasks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No scheduled tasks yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Task</th>
                  <th className="text-left px-2 py-2 font-medium">Runs</th>
                  <th className="text-left px-2 py-2 font-medium">Target</th>
                  <th className="text-left px-2 py-2 font-medium">Schedule</th>
                  <th className="text-left px-2 py-2 font-medium">Next / Last run</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {tasks.map((t) => (
                  <tr key={t.id} className={t.enabled ? "" : "opacity-55"}>
                    <td className="px-4 py-2 font-medium">{t.name}</td>
                    <td className="px-2 py-2">
                      {t.action === "SCRIPT" ? <span>📄 {t.scriptName ?? "script"}</span> : <span className="font-mono text-xs">{t.command}</span>}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {t.target === "ALL" ? "All devices" : t.target === "COMPANY" ? (t.companyName ?? "company") : (t.deviceName ?? "device")}
                      {t.onlyOnline && <span className="text-muted-foreground"> · online</span>}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {fmtInterval(t.intervalMinutes)}
                      {t.windowName && <Badge variant="outline" className="ml-1 text-[10px]">{t.windowName}</Badge>}
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      <div>next {fmtWhen(t.nextRunAt)}</div>
                      <div>last {t.lastRun ? `${fmtWhen(t.lastRunAt)} (${t.lastRun.deviceCount})` : "—"}</div>
                    </td>
                    <td className="px-2 py-2">
                      {!isAdmin && taskRunsScript(t) ? (
                        <div className="text-xs text-muted-foreground text-right">Admin only</div>
                      ) : (
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => runTask(t.id)} title="Run now">
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleTask(t)}>
                          {t.enabled ? "Pause" : "Resume"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteTask(t)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Maintenance windows */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4 max-w-4xl">
        <h2 className="text-sm font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Maintenance windows</h2>
        <p className="text-xs text-muted-foreground -mt-2">Reusable off-hours ranges. A task attached to a window only fires while the window is open.</p>

        {windows.length > 0 && (
          <div className="divide-y divide-border/50 border border-border rounded-md">
            {windows.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-medium">{w.name}</span>
                <span className="text-xs text-muted-foreground">{fmtWindow(w)}</span>
                {!w.enabled && <Badge variant="outline" className="text-[10px]">disabled</Badge>}
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive ml-auto" onClick={() => deleteWindow(w)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Name</span>
            <input value={wName} onChange={(e) => setWName(e.target.value)} placeholder="Weeknights" className={`${fieldCls} w-full`} />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Timezone</span>
            <input value={wTz} onChange={(e) => setWTz(e.target.value)} className={`${fieldCls} w-full`} />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>Start</span>
            <input type="time" value={wStart} onChange={(e) => setWStart(e.target.value)} className={`${fieldCls} w-full`} />
          </label>
          <label className="text-xs text-muted-foreground space-y-1">
            <span>End</span>
            <input type="time" value={wEnd} onChange={(e) => setWEnd(e.target.value)} className={`${fieldCls} w-full`} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {DOW.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(i)}
              className={`px-2.5 py-1 rounded text-xs border ${wDays.includes(i) ? "bg-primary/15 border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
            >
              {d}
            </button>
          ))}
          <Button onClick={createWindow} disabled={!wName.trim() || wDays.length === 0 || busy} className="gap-1 ml-auto">
            <Plus className="h-4 w-4" /> Add window
          </Button>
        </div>
      </div>
    </div>
  );
}
