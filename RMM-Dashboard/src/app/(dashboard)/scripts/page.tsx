"use client";

import { useEffect, useState, useCallback } from "react";
import { FileCode, Plus, Trash2, Play, Pencil, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Script {
  id: string;
  name: string;
  description: string | null;
  shell: string;
  content: string;
}
interface Device { id: string; name: string; isOnline: boolean }
interface Company { id: string; name: string }

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Script | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fShell, setFShell] = useState("powershell");
  const [fContent, setFContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    const [s, d, c] = await Promise.all([
      fetch("/api/scripts"), fetch("/api/devices"), fetch("/api/companies"),
    ]);
    if (s.ok) setScripts(await s.json());
    if (d.ok) setDevices(await d.json());
    if (c.ok) setCompanies(await c.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = () => {
    setEditing(null); setFName(""); setFDesc(""); setFShell("powershell"); setFContent(""); setShowForm(true);
  };
  const openEdit = (s: Script) => {
    setEditing(s); setFName(s.name); setFDesc(s.description ?? ""); setFShell(s.shell); setFContent(s.content); setShowForm(true);
  };

  const save = useCallback(async () => {
    if (!fName.trim() || !fContent.trim()) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ name: fName.trim(), description: fDesc.trim(), shell: fShell, content: fContent });
      const res = editing
        ? await fetch(`/api/scripts/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/scripts", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (res.ok) { setShowForm(false); fetchAll(); }
    } finally { setSaving(false); }
  }, [editing, fName, fDesc, fShell, fContent, fetchAll]);

  const remove = useCallback(async (s: Script) => {
    if (!confirm(`Delete script "${s.name}"?`)) return;
    await fetch(`/api/scripts/${s.id}`, { method: "DELETE" });
    fetchAll();
  }, [fetchAll]);

  const run = useCallback(async (s: Script) => {
    const target = prompt(
      `Run "${s.name}" on:\n- a device: type the device name\n- a company: type "company:Name"\n\nOnline devices: ${devices.filter(d => d.isOnline).map(d => d.name).join(", ") || "none"}`
    );
    if (!target) return;
    let body: Record<string, string> = {};
    if (target.startsWith("company:")) {
      const c = companies.find((c) => c.name.toLowerCase() === target.slice(8).trim().toLowerCase());
      if (!c) { alert("Company not found"); return; }
      body = { companyId: c.id };
    } else {
      const d = devices.find((d) => d.name.toLowerCase() === target.trim().toLowerCase());
      if (!d) { alert("Device not found"); return; }
      body = { deviceId: d.id };
    }
    const res = await fetch(`/api/scripts/${s.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    alert(res.ok ? `Dispatched to ${j.dispatched} device(s). Output appears in each device's Commands tab.` : (j.error ?? "Failed"));
  }, [devices, companies]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><FileCode className="h-6 w-6 text-primary" /> Scripts</h1>
          <p className="text-muted-foreground text-sm mt-1">Reusable scripts you can run on a device or a whole company.</p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1"><Plus className="h-4 w-4" /> New Script</Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 max-w-2xl space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editing ? "Edit Script" : "New Script"}</h3>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="Name"
              className="col-span-2 bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <select value={fShell} onChange={(e) => setFShell(e.target.value)}
              className="bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="powershell">PowerShell</option>
              <option value="cmd">cmd</option>
              <option value="sh">sh (Linux/Mac)</option>
            </select>
          </div>
          <input value={fDesc} onChange={(e) => setFDesc(e.target.value)} placeholder="Description (optional)"
            className="w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <textarea value={fContent} onChange={(e) => setFContent(e.target.value)} rows={8} placeholder="Script content…"
            className="w-full bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-y" />
          <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} {editing ? "Save" : "Create"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
      ) : scripts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No scripts yet. <button onClick={openCreate} className="text-primary hover:underline">Create one</button></div>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {scripts.map((s) => (
            <div key={s.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
              <FileCode className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="font-medium text-sm">{s.name}</span><Badge variant="secondary" className="text-xs">{s.shell}</Badge></div>
                {s.description && <div className="text-xs text-muted-foreground truncate">{s.description}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => run(s)}><Play className="h-3.5 w-3.5 text-green-400" /> Run</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
