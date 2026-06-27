"use client";

import { useEffect, useState, useCallback } from "react";
import { Radar, Search, Loader2, Trash2, Globe, Server, Shield, CheckCircle2, XCircle, Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import type { ScanResult } from "@/lib/recon";

interface Company { id: string; name: string }
interface ScanRow { id: string; domain: string; companyId: string | null; createdAt: string }

function gradeColor(score: number, max: number) {
  const pct = score / max;
  if (pct >= 0.8) return "text-green-400";
  if (pct >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

export default function SecurityPage() {
  const [domain, setDomain] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<ScanRow[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/recon");
    if (res.ok) setHistory(await res.json());
  }, []);

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then(setCompanies).catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const scan = useCallback(async () => {
    if (!domain.trim()) return;
    setScanning(true);
    setResult(null);
    try {
      const res = await fetch("/api/recon", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), companyId: companyId || null }),
      });
      const j = await res.json();
      if (res.ok) { setResult(j.result); loadHistory(); }
      else alert(j.error ?? "Scan failed");
    } finally { setScanning(false); }
  }, [domain, companyId, loadHistory]);

  const openScan = useCallback(async (id: string) => {
    const res = await fetch(`/api/recon/${id}`);
    if (res.ok) { const s = await res.json(); setResult(s.result); setDomain(s.domain); }
  }, []);

  const delScan = useCallback(async (id: string) => {
    await fetch(`/api/recon/${id}`, { method: "DELETE" });
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Radar className="h-6 w-6 text-primary" /> Web Security</h1>
        <p className="text-muted-foreground text-sm mt-1">Recon a website you manage: DNS, IPs, CMS/tech, security headers, subdomains. Passive lookups only — scan only sites you&apos;re authorized to assess.</p>
      </div>

      {/* Scan form */}
      <div className="flex flex-wrap items-center gap-2 max-w-3xl">
        <input value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()}
          placeholder="example.com" className="flex-1 min-w-[220px] bg-background border border-border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
        {companies.length > 0 && (
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
            <option value="">No company</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <Button onClick={scan} disabled={scanning} className="gap-1">
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {scanning ? "Scanning…" : "Scan"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        {/* Result */}
        <div className="space-y-4 min-w-0">
          {scanning && <p className="text-sm text-muted-foreground">Running DNS, HTTP and certificate-transparency lookups… (can take 10–20s)</p>}
          {result && <ResultView r={result} />}
          {!result && !scanning && <p className="text-sm text-muted-foreground">Enter a domain and Scan, or open a past scan →</p>}
        </div>

        {/* History */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-2">Recent scans</h2>
          <div className="space-y-1">
            {history.length === 0 && <p className="text-xs text-muted-foreground">No scans yet.</p>}
            {history.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm bg-card border border-border rounded px-2 py-1.5">
                <button onClick={() => openScan(s.id)} className="min-w-0 flex-1 text-left hover:text-primary truncate">{s.domain}</button>
                <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(s.createdAt), "MMM d")}</span>
                <button onClick={() => delScan(s.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border"><Icon className="h-4 w-4 text-primary" /><span className="text-sm font-medium">{title}</span></div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ResultView({ r }: { r: ScanResult }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div>
          <div className="text-lg font-semibold">{r.domain}</div>
          <div className="text-xs text-muted-foreground">scanned {format(new Date(r.scannedAt), "MMM d, HH:mm")}</div>
        </div>
        <div className="text-center">
          <div className={`text-2xl font-bold ${gradeColor(r.grade.score, r.grade.max)}`}>{r.grade.score}/{r.grade.max}</div>
          <div className="text-xs text-muted-foreground">security headers</div>
        </div>
        {r.cms && <Badge variant="secondary" className="text-xs">CMS: {r.cms}</Badge>}
        {r.http && <Badge variant={r.http.https ? "success" : "destructive"} className="text-xs">{r.http.https ? "HTTPS" : "No HTTPS"}</Badge>}
        {r.http?.status != null && <span className="text-xs text-muted-foreground">HTTP {r.http.status}</span>}
      </div>

      {r.http && (
        <Section icon={Globe} title="HTTP">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[["Title", r.http.title], ["Final URL", r.http.finalUrl], ["Server", r.http.server], ["X-Powered-By", r.http.poweredBy], ["Cookies", r.http.cookies.join(", ") || "—"]].map(([k, v]) => (
              <div key={k as string}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-mono text-xs break-all">{v || "—"}</dd></div>
            ))}
          </dl>
        </Section>
      )}

      {r.tech.length > 0 && (
        <Section icon={Server} title="Detected technology">
          <div className="flex flex-wrap gap-1.5">{r.tech.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>
        </Section>
      )}

      {r.http && (
        <Section icon={Shield} title="Security headers">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {r.http.securityHeaders.map((h) => (
              <div key={h.name} className="flex items-center gap-2 text-sm">
                {h.present ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                <span className="font-mono text-xs">{h.name}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon={Network} title={`DNS records${r.ips.length ? ` · IPs: ${r.ips.join(", ")}` : ""}`}>
        {r.dns.length === 0 ? <p className="text-sm text-muted-foreground">No DNS records resolved.</p> : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border/50">
              {r.dns.map((d) => (
                <tr key={d.type}><td className="py-1 pr-4 font-medium align-top w-16">{d.type}</td><td className="py-1 font-mono text-xs break-all">{d.records.join(" · ")}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section icon={Radar} title={`Subdomains (${r.subdomains.length})`}>
        {r.subdomains.length === 0 ? <p className="text-sm text-muted-foreground">None found in certificate transparency logs.</p> : (
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border/50">
                {r.subdomains.map((s) => (
                  <tr key={s.name}><td className="py-1 pr-4 font-mono text-xs break-all">{s.name}</td><td className="py-1 font-mono text-xs text-muted-foreground whitespace-nowrap">{s.ip ?? ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {r.errors.length > 0 && <p className="text-xs text-yellow-500">Notes: {r.errors.join("; ")}</p>}
    </div>
  );
}
