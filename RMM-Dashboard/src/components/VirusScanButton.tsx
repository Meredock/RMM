"use client";

import { useState, useRef, useEffect } from "react";
import { ShieldCheck, ChevronDown, Loader2, Check } from "lucide-react";

export function VirusScanButton({ deviceId }: { deviceId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const scan = async (type: "quick" | "full") => {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `avscan ${type}` }),
      });
      if (res.ok) {
        setStarted(true);
        setTimeout(() => setStarted(false), 4000);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-accent text-sm font-medium transition-colors disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : started ? (
          <Check className="h-4 w-4 text-green-400" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
        )}
        {started ? "Scan started" : "Virus Scan"}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-md border border-border bg-card py-1 shadow-lg text-sm">
          <button
            onClick={() => scan("quick")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-foreground hover:bg-accent"
          >
            <ShieldCheck className="h-4 w-4 text-emerald-400" /> Quick scan
          </button>
          <button
            onClick={() => scan("full")}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-foreground hover:bg-accent"
          >
            <ShieldCheck className="h-4 w-4 text-amber-400" /> Full scan
          </button>
          <div className="my-1 h-px bg-border" />
          <p className="px-3 py-1 text-xs text-muted-foreground">Results appear in the Commands tab.</p>
        </div>
      )}
    </div>
  );
}
