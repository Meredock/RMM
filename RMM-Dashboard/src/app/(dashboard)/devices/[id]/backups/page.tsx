"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  ChevronLeft, Plus, Play, Trash2, Clock, CheckCircle2,
  XCircle, Loader2, Archive, RefreshCw, ToggleLeft, ToggleRight, X, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";

interface BackupSchedule {
  id: string;
  intervalMinutes: number;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  device: { id: string; name: string };
}

interface BackupJob {
  id: string;
  name: string;
  sources: string[];
  exclude: string[];
  destination: string | null;
  maxBytes: number | null;
  storageType: "LOCAL" | "S3";
  s3Bucket: string | null;
  s3Prefix: string | null;
  s3Region: string | null;
  s3Endpoint: string | null;
  createdAt: string;
  schedules: BackupSchedule[];
  _count: { runs: number };
}

interface BackupRun {
  id: string;
  jobId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  archivePath: string | null;
  files: number | null;
  bytes: number | null;
  skipped: number | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  job: { id: string; name: string };
  schedule: { id: string; intervalMinutes: number } | null;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function intervalLabel(minutes: number): string {
  if (minutes < 60) return `Every ${minutes}m`;
  if (minutes < 1440) return `Every ${minutes / 60}h`;
  if (minutes === 1440) return "Daily";
  if (minutes === 10080) return "Weekly";
  return `Every ${(minutes / 1440).toFixed(1)}d`;
}

function RunStatusBadge({ status }: { status: BackupRun["status"] }) {
  const variants: Record<BackupRun["status"], { label: string; class: string }> = {
    PENDING: { label: "Pending", class: "text-muted-foreground border-border" },
    RUNNING: { label: "Running", class: "text-blue-400 border-blue-400/40" },
    COMPLETED: { label: "Completed", class: "text-green-400 border-green-400/40" },
    FAILED: { label: "Failed", class: "text-red-400 border-red-400/40" },
  };
  const v = variants[status];
  return (
    <Badge variant="outline" className={`text-xs ${v.class}`}>
      {status === "RUNNING" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 mr-1" />}
      {status === "FAILED" && <XCircle className="h-3 w-3 mr-1" />}
      {v.label}
    </Badge>
  );
}

const INTERVALS = [
  { label: "Hourly", minutes: 60 },
  { label: "Every 6 hours", minutes: 360 },
  { label: "Every 12 hours", minutes: 720 },
  { label: "Daily", minutes: 1440 },
  { label: "Weekly", minutes: 10080 },
];

export default function BackupsPage() {
  const { id } = useParams<{ id: string }>();
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"jobs" | "history">("jobs");

  // Create form state
  const [formName, setFormName] = useState("");
  const [formSources, setFormSources] = useState("");
  const [formExclude, setFormExclude] = useState("");
  const [formDest, setFormDest] = useState("");
  const [formStorage, setFormStorage] = useState<"LOCAL" | "S3">("LOCAL");
  const [formBucket, setFormBucket] = useState("");
  const [formPrefix, setFormPrefix] = useState("");
  const [formRegion, setFormRegion] = useState("");
  const [formEndpoint, setFormEndpoint] = useState("");
  const [formSchedule, setFormSchedule] = useState(0); // 0 = no schedule
  const [formSaving, setFormSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [jobsRes, runsRes] = await Promise.all([
      fetch(`/api/backup/jobs?deviceId=${id}`),
      fetch(`/api/devices/${id}/backup/runs`),
    ]);
    if (jobsRes.ok) setJobs(await jobsRes.json());
    if (runsRes.ok) setRuns(await runsRes.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const runNow = useCallback(
    async (jobId: string) => {
      setRunningJobs((s) => new Set(s).add(jobId));
      try {
        const res = await fetch(`/api/backup/jobs/${jobId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: id }),
        });
        if (res.ok) {
          setActiveTab("history");
          await fetchData();
        }
      } finally {
        setRunningJobs((s) => {
          const n = new Set(s);
          n.delete(jobId);
          return n;
        });
      }
    },
    [id, fetchData]
  );

  const toggleSchedule = useCallback(
    async (scheduleId: string, enabled: boolean) => {
      await fetch(`/api/backup/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      await fetchData();
    },
    [fetchData]
  );

  const deleteJob = useCallback(
    async (jobId: string) => {
      if (!confirm("Delete this backup job and all its history?")) return;
      await fetch(`/api/backup/jobs/${jobId}`, { method: "DELETE" });
      await fetchData();
    },
    [fetchData]
  );

  const deleteSchedule = useCallback(
    async (scheduleId: string) => {
      await fetch(`/api/backup/schedules/${scheduleId}`, { method: "DELETE" });
      await fetchData();
    },
    [fetchData]
  );

  const resetForm = useCallback(() => {
    setFormName("");
    setFormSources("");
    setFormExclude("");
    setFormDest("");
    setFormStorage("LOCAL");
    setFormBucket("");
    setFormPrefix("");
    setFormRegion("");
    setFormEndpoint("");
    setFormSchedule(0);
  }, []);

  const closeForm = useCallback(() => {
    setShowCreate(false);
    setEditingId(null);
    resetForm();
  }, [resetForm]);

  const startEdit = useCallback((job: BackupJob) => {
    setEditingId(job.id);
    setFormName(job.name);
    setFormSources(job.sources.join("\n"));
    setFormExclude(job.exclude.join("\n"));
    setFormDest(job.destination ?? "");
    setFormStorage(job.storageType);
    setFormBucket(job.s3Bucket ?? "");
    setFormPrefix(job.s3Prefix ?? "");
    setFormRegion(job.s3Region ?? "");
    setFormEndpoint(job.s3Endpoint ?? "");
    setFormSchedule(0); // schedules are managed separately, per device
    setShowCreate(true);
  }, []);

  const saveJob = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFormSaving(true);
      try {
        const sources = formSources.split("\n").map((s) => s.trim()).filter(Boolean);
        const exclude = formExclude.split("\n").map((s) => s.trim()).filter(Boolean);
        if (!formName.trim() || sources.length === 0) return;

        const payload = {
          name: formName.trim(),
          sources,
          exclude,
          storageType: formStorage,
          destination: formStorage === "LOCAL" ? formDest.trim() || null : null,
          s3Bucket: formStorage === "S3" ? formBucket.trim() : undefined,
          s3Prefix: formStorage === "S3" ? formPrefix.trim() : undefined,
          s3Region: formStorage === "S3" ? formRegion.trim() : undefined,
          s3Endpoint: formStorage === "S3" ? formEndpoint.trim() : undefined,
        };

        if (editingId) {
          const res = await fetch(`/api/backup/jobs/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) return;
        } else {
          const res = await fetch("/api/backup/jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) return;
          const job: BackupJob = await res.json();
          if (formSchedule > 0) {
            await fetch(`/api/backup/jobs/${job.id}/schedules`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceId: id, intervalMinutes: formSchedule }),
            });
          }
        }

        closeForm();
        await fetchData();
      } finally {
        setFormSaving(false);
      }
    },
    [
      id,
      editingId,
      formName,
      formSources,
      formExclude,
      formDest,
      formStorage,
      formBucket,
      formPrefix,
      formRegion,
      formEndpoint,
      formSchedule,
      closeForm,
      fetchData,
    ]
  );

  // Find schedule for this device on a job
  const deviceSchedule = (job: BackupJob) =>
    job.schedules.find((s) => s.device.id === id) ?? null;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <Link href={`/devices/${id}`} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Archive className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Backups</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={fetchData} className="h-7 w-7">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => { closeForm(); setShowCreate(true); }} className="h-7 text-xs gap-1">
            <Plus className="h-3.5 w-3.5" /> New Job
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-card/50 shrink-0 px-4">
        {(["jobs", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "jobs" ? `Jobs (${jobs.length})` : `History (${runs.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : activeTab === "jobs" ? (
          <div className="space-y-3 max-w-3xl">
            {/* Create form */}
            {showCreate && (
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">{editingId ? "Edit Backup Job" : "New Backup Job"}</h3>
                  <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <form onSubmit={saveJob} className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Job Name</label>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Documents Backup"
                      className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      Source Paths <span className="text-muted-foreground/60">(one per line, paths on the device)</span>
                    </label>
                    <textarea
                      value={formSources}
                      onChange={(e) => setFormSources(e.target.value)}
                      placeholder={"C:\\Users\\Meredock\\Documents\nC:\\Users\\Meredock\\Desktop"}
                      rows={3}
                      className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Exclude Patterns <span className="text-muted-foreground/60">(optional)</span>
                      </label>
                      <textarea
                        value={formExclude}
                        onChange={(e) => setFormExclude(e.target.value)}
                        placeholder={"*.tmp\n*.log\nnode_modules"}
                        rows={3}
                        className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Storage</label>
                      <select
                        value={formStorage}
                        onChange={(e) => setFormStorage(e.target.value as "LOCAL" | "S3")}
                        className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="LOCAL">Local / network path</option>
                        <option value="S3">S3-compatible bucket</option>
                      </select>

                      {formStorage === "LOCAL" ? (
                        <>
                          <label className="text-xs text-muted-foreground block mt-3 mb-1">
                            Destination <span className="text-muted-foreground/60">(optional, defaults to ProgramData)</span>
                          </label>
                          <input
                            value={formDest}
                            onChange={(e) => setFormDest(e.target.value)}
                            placeholder="C:\\Backups"
                            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Bucket</label>
                            <input
                              value={formBucket}
                              onChange={(e) => setFormBucket(e.target.value)}
                              placeholder="fixsmith-backups"
                              className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">Region</label>
                            <input
                              value={formRegion}
                              onChange={(e) => setFormRegion(e.target.value)}
                              placeholder="ap-southeast-2"
                              className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">
                              Prefix <span className="text-muted-foreground/60">(optional)</span>
                            </label>
                            <input
                              value={formPrefix}
                              onChange={(e) => setFormPrefix(e.target.value)}
                              placeholder="clients/acme"
                              className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground block mb-1">
                              Endpoint <span className="text-muted-foreground/60">(optional)</span>
                            </label>
                            <input
                              value={formEndpoint}
                              onChange={(e) => setFormEndpoint(e.target.value)}
                              placeholder="https://s3.amazonaws.com"
                              className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                        </div>
                      )}

                      {!editingId && (
                        <>
                          <label className="text-xs text-muted-foreground block mt-3 mb-1">Schedule</label>
                          <select
                            value={formSchedule}
                            onChange={(e) => setFormSchedule(Number(e.target.value))}
                            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value={0}>No schedule (manual only)</option>
                            {INTERVALS.map((i) => (
                              <option key={i.minutes} value={i.minutes}>{i.label}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={formSaving} className="h-7 text-xs">
                      {formSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      {editingId ? "Save Changes" : "Create Job"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={closeForm}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {jobs.length === 0 && !showCreate && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No backup jobs yet.{" "}
                <button onClick={() => setShowCreate(true)} className="text-primary hover:underline">
                  Create one
                </button>
              </div>
            )}

            {jobs.map((job) => {
              const sched = deviceSchedule(job);
              const isRunning = runningJobs.has(job.id);
              return (
                <div key={job.id} className="bg-card border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Archive className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium text-sm">{job.name}</span>
                        <span className="text-xs text-muted-foreground">{job._count.runs} runs</span>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono space-y-0.5">
                        {job.sources.map((s) => (
                          <div key={s} className="truncate">↳ {s}</div>
                        ))}
                      </div>
                      {job.exclude.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Exclude: {job.exclude.join(", ")}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        disabled={isRunning}
                        onClick={() => runNow(job.id)}
                      >
                        {isRunning ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5 text-green-400" />
                        )}
                        Run Now
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEdit(job)}
                        title="Edit job"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteJob(job.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Schedule row */}
                  <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-3 text-xs">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    {sched ? (
                      <>
                        <span className={sched.enabled ? "text-foreground" : "text-muted-foreground line-through"}>
                          {intervalLabel(sched.intervalMinutes)}
                        </span>
                        {sched.nextRunAt && sched.enabled && (
                          <span className="text-muted-foreground">
                            next {formatDistanceToNow(new Date(sched.nextRunAt), { addSuffix: true })}
                          </span>
                        )}
                        {sched.lastRunAt && (
                          <span className="text-muted-foreground">
                            last {formatDistanceToNow(new Date(sched.lastRunAt), { addSuffix: true })}
                          </span>
                        )}
                        <button
                          onClick={() => toggleSchedule(sched.id, !sched.enabled)}
                          className={`ml-auto flex items-center gap-1 ${sched.enabled ? "text-green-400" : "text-muted-foreground"} hover:opacity-80`}
                        >
                          {sched.enabled ? (
                            <ToggleRight className="h-4 w-4" />
                          ) : (
                            <ToggleLeft className="h-4 w-4" />
                          )}
                          {sched.enabled ? "Enabled" : "Disabled"}
                        </button>
                        <button
                          onClick={() => deleteSchedule(sched.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground">No schedule for this device</span>
                        <AddScheduleInline jobId={job.id} deviceId={id} onDone={fetchData} />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* History tab */
          <div className="max-w-5xl">
            {runs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No backup runs yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium">Job</th>
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium">Started</th>
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium">Status</th>
                    <th className="text-right px-4 py-2 text-muted-foreground font-medium">Files</th>
                    <th className="text-right px-4 py-2 text-muted-foreground font-medium">Size</th>
                    <th className="text-left px-4 py-2 text-muted-foreground font-medium">Archive</th>
                    <th className="text-right px-4 py-2 text-muted-foreground font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {runs.map((run) => {
                    const duration =
                      run.completedAt && run.startedAt
                        ? Math.round(
                            (new Date(run.completedAt).getTime() -
                              new Date(run.startedAt).getTime()) /
                              1000
                          )
                        : null;
                    return (
                      <tr key={run.id} className="hover:bg-accent/30 group">
                        <td className="px-4 py-2.5 font-medium">
                          {run.job.name}
                          {run.schedule && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              ({intervalLabel(run.schedule.intervalMinutes)})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">
                          {format(new Date(run.startedAt), "MMM d, HH:mm:ss")}
                        </td>
                        <td className="px-4 py-2.5">
                          <RunStatusBadge status={run.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {run.files != null ? run.files.toLocaleString() : "—"}
                          {run.skipped ? (
                            <span className="text-yellow-500 ml-1 text-xs">+{run.skipped} skipped</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">
                          {run.bytes != null ? formatBytes(run.bytes) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground max-w-xs truncate">
                          {run.archivePath ?? (run.error ? (
                            <span className="text-red-400">{run.error.slice(0, 80)}</span>
                          ) : "—")}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground text-xs">
                          {duration != null ? `${duration}s` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddScheduleInline({
  jobId,
  deviceId,
  onDone,
}: {
  jobId: string;
  deviceId: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(1440);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/backup/jobs/${jobId}/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, intervalMinutes: minutes }),
      });
      setOpen(false);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="ml-auto text-primary hover:underline flex items-center gap-1"
      >
        <Plus className="h-3 w-3" /> Add schedule
      </button>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <select
        value={minutes}
        onChange={(e) => setMinutes(Number(e.target.value))}
        className="bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none"
      >
        {INTERVALS.map((i) => (
          <option key={i.minutes} value={i.minutes}>{i.label}</option>
        ))}
      </select>
      <Button size="sm" className="h-6 text-xs px-2" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
      </Button>
      <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
