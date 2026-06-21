"use client";

import { useEffect, useState, useCallback } from "react";
import { Users, Plus, Trash2, KeyRound, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface User {
  id: string;
  username: string;
  role: "ADMIN" | "TECH";
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [uName, setUName] = useState("");
  const [uPass, setUPass] = useState("");
  const [uRole, setURole] = useState<"ADMIN" | "TECH">("TECH");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.status === 403) { setForbidden(true); setLoading(false); return; }
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const create = useCallback(async () => {
    if (!uName.trim() || uPass.length < 8) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: uName.trim(), password: uPass, role: uRole }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.error ?? "Could not create user");
        return;
      }
      setUName(""); setUPass(""); setURole("TECH"); setShowCreate(false);
      fetchUsers();
    } finally {
      setSaving(false);
    }
  }, [uName, uPass, uRole, fetchUsers]);

  const resetPassword = useCallback(async (u: User) => {
    const pw = prompt(`New password for ${u.username} (min 8 chars):`);
    if (!pw) return;
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.error ?? "Failed"); }
  }, []);

  const remove = useCallback(async (u: User) => {
    if (!confirm(`Delete user ${u.username}?`)) return;
    await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    fetchUsers();
  }, [fetchUsers]);

  if (forbidden) {
    return <div className="p-6 text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Users
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Technician and admin accounts.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)} className="gap-1">
          <Plus className="h-4 w-4" /> New User
        </Button>
      </div>

      {showCreate && (
        <div className="bg-card border border-border rounded-lg p-4 max-w-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">New User</h3>
            <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="username"
              className="bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <select value={uRole} onChange={(e) => setURole(e.target.value as "ADMIN" | "TECH")}
              className="bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="TECH">Technician</option>
              <option value="ADMIN">Admin</option>
            </select>
            <input value={uPass} onChange={(e) => setUPass(e.target.value)} type="password" placeholder="password (min 8)"
              className="col-span-2 bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <Button size="sm" onClick={create} disabled={saving} className="h-7 text-xs">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Create
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
      ) : (
        <div className="max-w-2xl space-y-2">
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No users yet. You&apos;re signed in via the bootstrap admin password — create real accounts here.
            </p>
          )}
          {users.map((u) => (
            <div key={u.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
              <span className="font-medium text-sm">{u.username}</span>
              <Badge variant={u.role === "ADMIN" ? "default" : "secondary"} className="text-xs">{u.role}</Badge>
              <div className="ml-auto flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Reset password" onClick={() => resetPassword(u)}>
                  <KeyRound className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(u)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
