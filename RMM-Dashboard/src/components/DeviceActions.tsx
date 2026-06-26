"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Settings2, ChevronDown, RotateCcw, Power, RefreshCw, ArrowUpCircle, Trash2, Loader2 } from "lucide-react";

export function DeviceActions({ deviceId, isOnline }: { deviceId: string; isOnline: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const command = async (cmd: string, confirmMsg: string, doneMsg: string) => {
    setOpen(false);
    if (!confirm(confirmMsg)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/commands`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      setNote(res.ok ? doneMsg : "Failed to send");
      setTimeout(() => setNote(""), 5000);
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setOpen(false);
    if (!confirm("Remove this device from the dashboard? (The agent stays installed; it will re-register on next check-in unless uninstalled.)")) return;
    const res = await fetch(`/api/devices/${deviceId}`, { method: "DELETE" });
    if (res.ok) router.push("/devices");
  };

  const item = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent";

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} disabled={busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-sm font-medium transition-colors disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
        Actions <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {note && <span className="absolute right-0 top-full mt-1 text-xs text-green-400 whitespace-nowrap">{note}</span>}

      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[210px] rounded-md border border-border bg-card py-1 shadow-lg text-foreground">
          <button className={item} disabled={!isOnline}
            onClick={() => command('shutdown /r /t 5 /c "RMM reboot"', "Reboot this device now?", "Reboot sent")}>
            <RotateCcw className="h-4 w-4 text-amber-400" /> Reboot
          </button>
          <button className={item} disabled={!isOnline}
            onClick={() => command('shutdown /s /t 5 /c "RMM shutdown"', "Shut down this device now?", "Shutdown sent")}>
            <Power className="h-4 w-4 text-red-400" /> Shut down
          </button>
          <div className="my-1 h-px bg-border" />
          <button className={item} disabled={!isOnline}
            onClick={() => command("restart-agent", "Restart the RMM agent service on this device?", "Agent restart sent")}>
            <RefreshCw className="h-4 w-4 text-blue-400" /> Restart agent
          </button>
          <button className={item} disabled={!isOnline}
            onClick={() => command("update-agent", "Check for and install a newer agent build now? (Repairs/updates the agent.)", "Update check sent")}>
            <ArrowUpCircle className="h-4 w-4 text-green-400" /> Update / repair agent
          </button>
          <div className="my-1 h-px bg-border" />
          <button className={`${item} text-destructive`} onClick={remove}>
            <Trash2 className="h-4 w-4" /> Remove from dashboard
          </button>
        </div>
      )}
    </div>
  );
}
