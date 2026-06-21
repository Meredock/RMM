"use client";

import { useEffect, useState, useCallback } from "react";
import { ScrollText, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/audit");
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    if (res.ok) setLogs(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (forbidden) {
    return <div className="p-6 text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" /> Audit Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Who did what, most recent first (last 300 events).</p>
        </div>
        <Button size="icon" variant="ghost" onClick={fetchLogs} className="h-8 w-8"><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No audit events yet.</div>
      ) : (
        <table className="w-full text-sm max-w-5xl">
          <thead className="sticky top-0 bg-card border-b border-border">
            <tr>
              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Time</th>
              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Actor</th>
              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Action</th>
              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Target</th>
              <th className="text-left px-4 py-2 text-muted-foreground font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-accent/30">
                <td className="px-4 py-2 text-muted-foreground text-xs whitespace-nowrap">{format(new Date(l.createdAt), "MMM d, HH:mm:ss")}</td>
                <td className="px-4 py-2 font-medium">{l.actor}</td>
                <td className="px-4 py-2 font-mono text-xs">{l.action}</td>
                <td className="px-4 py-2 text-muted-foreground">{l.target ?? "—"}</td>
                <td className="px-4 py-2 text-muted-foreground text-xs">{l.detail ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
