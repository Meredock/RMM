"use client";

import { useEffect, useState, useCallback } from "react";
import { Building2, Plus, Trash2, Pencil, Check, X, Server, Loader2, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Company {
  id: string;
  name: string;
  _count: { devices: number };
}

interface Device {
  id: string;
  name: string;
  hostname: string;
  isOnline: boolean;
  companyId: string | null;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const fetchData = useCallback(async () => {
    const [cRes, dRes] = await Promise.all([fetch("/api/companies"), fetch("/api/devices")]);
    if (cRes.ok) setCompanies(await cRes.json());
    if (dRes.ok) setDevices(await dRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createCompany = useCallback(async () => {
    if (!newName.trim()) return;
    await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    fetchData();
  }, [newName, fetchData]);

  const renameCompany = useCallback(
    async (id: string) => {
      if (!editName.trim()) return;
      await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditingId(null);
      fetchData();
    },
    [editName, fetchData]
  );

  const deleteCompany = useCallback(
    async (id: string) => {
      if (!confirm("Delete this company? Its devices will become unassigned.")) return;
      await fetch(`/api/companies/${id}`, { method: "DELETE" });
      fetchData();
    },
    [fetchData]
  );

  const runCommand = useCallback(
    async (company: Company) => {
      const command = prompt(`Run a command on all online devices in "${company.name}":`);
      if (!command?.trim()) return;
      const res = await fetch(`/api/companies/${company.id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: command.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      alert(res.ok ? `Dispatched to ${j.dispatched} device(s). Output appears in each device's Commands tab.` : (j.error ?? "Failed"));
    },
    []
  );

  const assignDevice = useCallback(
    async (deviceId: string, companyId: string | null) => {
      await fetch(`/api/devices/${deviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: companyId ?? "" }),
      });
      fetchData();
    },
    [fetchData]
  );

  const devicesFor = (companyId: string | null) =>
    devices.filter((d) => d.companyId === companyId);
  const unassigned = devicesFor(null);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Companies</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Group endpoints by customer. {companies.length} companies · {unassigned.length} unassigned devices
        </p>
      </div>

      {/* Create */}
      <div className="flex items-center gap-2 max-w-md">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createCompany()}
          placeholder="New company name"
          className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button size="sm" onClick={createCompany} className="gap-1">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {companies.map((company) => {
            const members = devicesFor(company.id);
            return (
              <div key={company.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Building2 className="h-4 w-4 text-primary shrink-0" />
                  {editingId === company.id ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && renameCompany(company.id)}
                        className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        autoFocus
                      />
                      <button onClick={() => renameCompany(company.id)} className="text-green-400 hover:opacity-80">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-sm">{company.name}</span>
                      <Badge variant="secondary" className="text-xs">{members.length} devices</Badge>
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          onClick={() => runCommand(company)}
                          title="Run command on all online devices"
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          <Terminal className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingId(company.id); setEditName(company.name); }}
                          className="text-muted-foreground hover:text-foreground p-1"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteCompany(company.id)}
                          className="text-muted-foreground hover:text-destructive p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {members.length > 0 ? (
                  <div className="space-y-1">
                    {members.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-sm py-1 border-t border-border/50">
                        <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-foreground">{d.name}</span>
                        <span className="text-xs text-muted-foreground truncate">{d.hostname}</span>
                        <span className={`text-xs ml-1 ${d.isOnline ? "text-green-400" : "text-muted-foreground"}`}>
                          {d.isOnline ? "online" : "offline"}
                        </span>
                        <button
                          onClick={() => assignDevice(d.id, null)}
                          className="ml-auto text-xs text-muted-foreground hover:text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No devices assigned.</p>
                )}
              </div>
            );
          })}

          {/* Unassigned devices */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Server className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">Unassigned</span>
              <Badge variant="outline" className="text-xs">{unassigned.length}</Badge>
            </div>
            {unassigned.length > 0 ? (
              <div className="space-y-1">
                {unassigned.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-sm py-1 border-t border-border/50">
                    <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-foreground">{d.name}</span>
                    <span className="text-xs text-muted-foreground truncate">{d.hostname}</span>
                    {companies.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => e.target.value && assignDevice(d.id, e.target.value)}
                        className="ml-auto bg-background border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none"
                      >
                        <option value="">Assign to…</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">All devices are assigned.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
