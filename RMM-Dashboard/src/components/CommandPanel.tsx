"use client";

import { useState } from "react";
import { Send, Terminal, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface Command {
  id: string;
  command: string;
  status: string;
  output: string | null;
  exitCode: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface CommandPanelProps {
  deviceId: string;
  isOnline: boolean;
  initialCommands: Command[];
}

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "PENDING" || status === "RUNNING")
    return <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />;
  if (status === "COMPLETED")
    return <CheckCircle className="h-4 w-4 text-green-400" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

export function CommandPanel({ deviceId, isOnline, initialCommands }: CommandPanelProps) {
  const [commands, setCommands] = useState<Command[]>(initialCommands);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState<Command | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || running) return;
    setRunning(true);

    try {
      const res = await fetch(`/api/devices/${deviceId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: input.trim() }),
      });

      if (res.ok) {
        const cmd = await res.json();
        setCommands((prev) => [cmd, ...prev]);
        setInput("");
        setSelected(cmd);

        // Poll for result up to 60s
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          if (attempts > 30) {
            clearInterval(poll);
            return;
          }
          const r = await fetch(`/api/devices/${deviceId}/commands/${cmd.id}`);
          if (r.ok) {
            const updated = await r.json();
            if (updated.status !== "PENDING" && updated.status !== "RUNNING") {
              clearInterval(poll);
              setCommands((prev) =>
                prev.map((c) => (c.id === cmd.id ? updated : c))
              );
              setSelected(updated);
            }
          }
        }, 2000);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex gap-4 h-[500px]">
      {/* History list */}
      <div className="w-64 flex flex-col border border-border rounded-lg overflow-hidden shrink-0">
        <div className="px-3 py-2 border-b border-border bg-muted/50">
          <p className="text-xs font-medium text-muted-foreground">Command History</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {commands.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3">No commands yet</p>
          ) : (
            commands.map((cmd) => (
              <button
                key={cmd.id}
                onClick={() => setSelected(cmd)}
                className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-accent/50 transition-colors ${
                  selected?.id === cmd.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={cmd.status} />
                  <p className="text-xs font-mono text-foreground truncate flex-1">
                    {cmd.command}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 ml-6">
                  {format(new Date(cmd.createdAt), "HH:mm:ss")}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Output panel */}
      <div className="flex-1 flex flex-col border border-border rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground">
            {selected ? (
              <span className="font-mono text-foreground">{selected.command}</span>
            ) : (
              "Select a command or run a new one"
            )}
          </p>
          {selected && (
            <div className="ml-auto flex items-center gap-1.5">
              <StatusIcon status={selected.status} />
              <span className="text-xs text-muted-foreground">{selected.status}</span>
            </div>
          )}
        </div>

        <div className="flex-1 p-3 font-mono text-xs overflow-y-auto bg-background/50">
          {selected ? (
            <>
              {selected.status === "PENDING" || selected.status === "RUNNING" ? (
                <div className="flex items-center gap-2 text-yellow-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Waiting for agent response...</span>
                </div>
              ) : selected.output ? (
                <pre className="whitespace-pre-wrap text-foreground">{selected.output}</pre>
              ) : (
                <span className="text-muted-foreground">(no output)</span>
              )}
              {selected.completedAt && (
                <p className="text-muted-foreground mt-2 text-xs border-t border-border/50 pt-2">
                  <Clock className="h-3 w-3 inline mr-1" />
                  Completed {format(new Date(selected.completedAt), "MMM d, HH:mm:ss")}
                  {selected.exitCode !== null && ` · exit ${selected.exitCode}`}
                </p>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">No command selected</span>
          )}
        </div>

        {/* Input */}
        <form onSubmit={submit} className="flex gap-2 p-3 border-t border-border">
          <div className="flex-1 flex items-center gap-2 bg-muted rounded-md px-3 py-2">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isOnline ? "Enter command..." : "Device is offline"}
              disabled={!isOnline || running}
              className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground focus:outline-none disabled:opacity-50"
            />
          </div>
          <Button type="submit" size="sm" disabled={!isOnline || running || !input.trim()}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
