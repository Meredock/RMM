"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Archive,
  Cloud,
  HardDrive,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { timeAgo } from "@/lib/utils";

interface ScheduleSummary {
  id: string;
  intervalMinutes: number;
  enabled: boolean;
  device: { id: string; name: string };
}

interface BackupJob {
  id: string;
  name: string;
  sources: string[];
  storageType: "LOCAL" | "S3";
  s3Bucket: string | null;
  schedules: ScheduleSummary[];
  _count: { runs: number };
}

interface BackupRun {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  bytes: number | null;
  startedAt: string;
  job: { id: string; name: string; storageType: "LOCAL" | "S3" } | null;
  device: { id: string; name: string } | null;
}

function formatBytes(b: number | null): string {
  if (!b) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function RunStatusBadge({ status }: { status: BackupRun["status"] }) {
  const map = {
    COMPLETED: { variant: "success" as const, icon: CheckCircle2, label: "Completed" },
    FAILED: { variant: "destructive" as const, icon: XCircle, label: "Failed" },
    RUNNING: { variant: "warning" as const, icon: Loader2, label: "Running" },
    PENDING: { variant: "secondary" as const, icon: Clock, label: "Pending" },
  };
  const { variant, icon: Icon, label } = map[status];
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === "RUNNING" ? "animate-spin" : ""}`} />
      {label}
    </Badge>
  );
}

export default function BackupsOverviewPage() {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [jobsRes, runsRes] = await Promise.all([
      fetch("/api/backup/jobs"),
      fetch("/api/backup/runs?limit=50"),
    ]);
    if (jobsRes.ok) setJobs(await jobsRes.json());
    if (runsRes.ok) setRuns(await runsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 10000);
    return () => clearInterval(t);
  }, [fetchData]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Backup</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {jobs.length} job{jobs.length !== 1 ? "s" : ""} across all devices. Create and run
          jobs from a device&apos;s Backups tab.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading...</div>
      ) : (
        <>
          {/* Jobs */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Jobs</h2>
            {jobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Archive className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                  <p className="text-foreground font-medium">No backup jobs yet</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    Open a device and use its Backups tab to create one.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="divide-y divide-border">
                  {jobs.map((job) => (
                    <div key={job.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="shrink-0">
                        {job.storageType === "S3" ? (
                          <Cloud className="h-4 w-4 text-primary" />
                        ) : (
                          <HardDrive className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{job.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {job.storageType === "S3"
                            ? `S3 · ${job.s3Bucket ?? "bucket"}`
                            : "Local"}
                          {" · "}
                          {job.sources.length} source{job.sources.length !== 1 ? "s" : ""}
                          {" · "}
                          {job._count.runs} run{job._count.runs !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {job.schedules.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Manual only</span>
                        ) : (
                          job.schedules.map((s) => (
                            <Link
                              key={s.id}
                              href={`/devices/${s.device.id}/backups`}
                              className="text-xs bg-muted px-2 py-0.5 rounded hover:bg-accent"
                            >
                              {s.device.name}
                              {!s.enabled && " (paused)"}
                            </Link>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>

          {/* Recent runs */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Recent runs</h2>
            {runs.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  No backup runs yet.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="divide-y divide-border">
                  {runs.map((run) => (
                    <div key={run.id} className="flex items-center gap-4 px-4 py-3">
                      <RunStatusBadge status={run.status} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">
                          {run.job?.name ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {run.device ? (
                            <Link
                              href={`/devices/${run.device.id}/backups`}
                              className="hover:text-foreground"
                            >
                              {run.device.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatBytes(run.bytes)}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                        {timeAgo(run.startedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
