"use client";

import { useEffect, useState, useCallback } from "react";
import { KeyRound, Plus, Trash2, Pencil, Eye, EyeOff, Copy, ExternalLink, FileText, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Company { id: string; name: string }
interface Credential {
  id: string; title: string; username: string | null; url: string | null;
  category: string | null; notes: string | null; updatedAt: string;
}
interface Doc { id: string; title: string; content: string }

export default function VaultPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [creds, setCreds] = useState<Credential[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  // Credential form
  const [showCred, setShowCred] = useState(false);
  const [editCred, setEditCred] = useState<Credential | null>(null);
  const [cf, setCf] = useState({ title: "", username: "", secret: "", url: "", category: "", notes: "" });

  // Doc form
  const [showDoc, setShowDoc] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [df, setDf] = useState({ title: "", content: "" });

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((c: Company[]) => {
      setCompanies(c);
      if (c.length && !companyId) setCompanyId(c[0].id);
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (id: string) => {
    if (!id) return;
    const [c, d] = await Promise.all([
      fetch(`/api/companies/${id}/credentials`), fetch(`/api/companies/${id}/docs`),
    ]);
    if (c.ok) setCreds(await c.json());
    if (d.ok) setDocs(await d.json());
    setRevealed({});
  }, []);

  useEffect(() => { if (companyId) load(companyId); }, [companyId, load]);

  const reveal = useCallback(async (id: string) => {
    if (revealed[id] !== undefined) { setRevealed((r) => { const n = { ...r }; delete n[id]; return n; }); return; }
    const res = await fetch(`/api/credentials/${id}/reveal`, { method: "POST" });
    if (res.ok) { const { secret } = await res.json(); setRevealed((r) => ({ ...r, [id]: secret })); }
    else alert("Could not reveal");
  }, [revealed]);

  const copySecret = useCallback(async (id: string) => {
    let secret = revealed[id];
    if (secret === undefined) {
      const res = await fetch(`/api/credentials/${id}/reveal`, { method: "POST" });
      if (!res.ok) return alert("Could not copy");
      secret = (await res.json()).secret;
    }
    navigator.clipboard?.writeText(secret ?? "");
  }, [revealed]);

  const saveCred = useCallback(async () => {
    if (!cf.title.trim()) return;
    const url = editCred ? `/api/credentials/${editCred.id}` : `/api/companies/${companyId}/credentials`;
    const res = await fetch(url, {
      method: editCred ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(cf),
    });
    if (res.ok) { setShowCred(false); setEditCred(null); setCf({ title: "", username: "", secret: "", url: "", category: "", notes: "" }); load(companyId); }
  }, [cf, editCred, companyId, load]);

  const delCred = useCallback(async (c: Credential) => {
    if (!confirm(`Delete credential "${c.title}"?`)) return;
    await fetch(`/api/credentials/${c.id}`, { method: "DELETE" }); load(companyId);
  }, [companyId, load]);

  const saveDoc = useCallback(async () => {
    if (!df.title.trim()) return;
    const url = editDoc ? `/api/docs/${editDoc.id}` : `/api/companies/${companyId}/docs`;
    const res = await fetch(url, { method: editDoc ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(df) });
    if (res.ok) { setShowDoc(false); setEditDoc(null); setDf({ title: "", content: "" }); load(companyId); }
  }, [df, editDoc, companyId, load]);

  const delDoc = useCallback(async (d: Doc) => {
    if (!confirm(`Delete document "${d.title}"?`)) return;
    await fetch(`/api/docs/${d.id}`, { method: "DELETE" }); load(companyId);
  }, [companyId, load]);

  const field = "bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><KeyRound className="h-6 w-6 text-primary" /> Vault</h1>
          <p className="text-muted-foreground text-sm mt-1">Customer credentials &amp; documentation. Secrets are encrypted; every reveal is logged.</p>
        </div>
        {companies.length > 0 && (
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={field}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading…</div>
      ) : companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a company first (Companies page), then store its credentials here.</p>
      ) : (
        <div className="space-y-8 max-w-4xl">
          {/* Credentials */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> Credentials</h2>
              <Button size="sm" className="gap-1" onClick={() => { setEditCred(null); setCf({ title: "", username: "", secret: "", url: "", category: "", notes: "" }); setShowCred(true); }}><Plus className="h-4 w-4" /> Add</Button>
            </div>

            {showCred && (
              <div className="bg-card border border-border rounded-lg p-4 mb-3 space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{editCred ? "Edit" : "New"} credential</h3><button onClick={() => { setShowCred(false); setEditCred(null); }}><X className="h-4 w-4 text-muted-foreground" /></button></div>
                <div className="grid grid-cols-2 gap-2">
                  <input className={field} placeholder="Title (e.g. Domain admin)" value={cf.title} onChange={(e) => setCf({ ...cf, title: e.target.value })} />
                  <input className={field} placeholder="Category (e.g. Server)" value={cf.category} onChange={(e) => setCf({ ...cf, category: e.target.value })} />
                  <input className={field} placeholder="Username" value={cf.username} onChange={(e) => setCf({ ...cf, username: e.target.value })} />
                  <input className={field} type="password" placeholder={editCred ? "Secret (leave blank to keep)" : "Secret / password"} value={cf.secret} onChange={(e) => setCf({ ...cf, secret: e.target.value })} />
                  <input className={`${field} col-span-2`} placeholder="URL (optional)" value={cf.url} onChange={(e) => setCf({ ...cf, url: e.target.value })} />
                  <input className={`${field} col-span-2`} placeholder="Notes (optional)" value={cf.notes} onChange={(e) => setCf({ ...cf, notes: e.target.value })} />
                </div>
                <Button size="sm" className="h-7 text-xs" onClick={saveCred}>{editCred ? "Save" : "Create"}</Button>
              </div>
            )}

            <div className="space-y-2">
              {creds.length === 0 && <p className="text-sm text-muted-foreground">No credentials stored for this customer.</p>}
              {creds.map((c) => (
                <div key={c.id} className="bg-card border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{c.title}</span>
                    {c.category && <Badge variant="secondary" className="text-xs">{c.category}</Badge>}
                    {c.url && <a href={c.url.startsWith("http") ? c.url : `https://${c.url}`} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>}
                    <div className="ml-auto flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditCred(c); setCf({ title: c.title, username: c.username ?? "", secret: "", url: c.url ?? "", category: c.category ?? "", notes: c.notes ?? "" }); setShowCred(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => delCred(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground font-mono">
                    {c.username && <span>{c.username}</span>}
                    <span className="text-foreground">·</span>
                    <span className="text-foreground">{revealed[c.id] !== undefined ? revealed[c.id] : "••••••••"}</span>
                    <button onClick={() => reveal(c.id)} title="Reveal" className="text-muted-foreground hover:text-foreground">
                      {revealed[c.id] !== undefined ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => copySecret(c.id)} title="Copy" className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                  {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                </div>
              ))}
            </div>
          </section>

          {/* Documentation */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Documentation</h2>
              <Button size="sm" className="gap-1" onClick={() => { setEditDoc(null); setDf({ title: "", content: "" }); setShowDoc(true); }}><Plus className="h-4 w-4" /> Add</Button>
            </div>

            {showDoc && (
              <div className="bg-card border border-border rounded-lg p-4 mb-3 space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{editDoc ? "Edit" : "New"} document</h3><button onClick={() => { setShowDoc(false); setEditDoc(null); }}><X className="h-4 w-4 text-muted-foreground" /></button></div>
                <input className={`${field} w-full`} placeholder="Title (e.g. Network layout)" value={df.title} onChange={(e) => setDf({ ...df, title: e.target.value })} />
                <textarea className={`${field} w-full font-mono`} rows={6} placeholder="Content…" value={df.content} onChange={(e) => setDf({ ...df, content: e.target.value })} />
                <Button size="sm" className="h-7 text-xs" onClick={saveDoc}>{editDoc ? "Save" : "Create"}</Button>
              </div>
            )}

            <div className="space-y-2">
              {docs.length === 0 && <p className="text-sm text-muted-foreground">No documents for this customer.</p>}
              {docs.map((d) => (
                <details key={d.id} className="bg-card border border-border rounded-lg p-3">
                  <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                    {d.title}
                    <div className="ml-auto flex items-center gap-1" onClick={(e) => e.preventDefault()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditDoc(d); setDf({ title: d.title, content: d.content }); setShowDoc(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => delDoc(d)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </summary>
                  <pre className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap font-sans">{d.content}</pre>
                </details>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
