"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Activity, Pause, Play, RefreshCw, Save, TrendingUp, Wallet, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { JournalEntry, TraderSettings, TraderStatus } from "@/lib/trader";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "USD" });
const ago = (iso: string | null) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never");

const LIMIT_FIELDS: { key: keyof TraderSettings; label: string; step: number; cap?: string; floor?: string }[] = [
  { key: "max_trade_usd", label: "Max per trade (USD)", step: 1, cap: "max_trade_usd" },
  { key: "max_daily_volume_usd", label: "Max daily volume (USD)", step: 1, cap: "max_daily_volume_usd" },
  { key: "max_trades_per_day", label: "Max trades / day", step: 1, cap: "max_trades_per_day" },
  { key: "max_daily_loss_usd", label: "Max daily loss (USD)", step: 1, cap: "max_daily_loss_usd" },
  { key: "max_slippage_bps", label: "Max slippage (bps)", step: 5, cap: "max_slippage_bps" },
  { key: "max_price_deviation_pct", label: "Max pool vs market deviation (%)", step: 0.5, cap: "max_price_deviation_pct" },
  { key: "min_minutes_between_trades", label: "Min minutes between trades", step: 1, floor: "min_minutes_between_trades_floor" },
  { key: "interval_minutes", label: "Run every (minutes)", step: 5, floor: "interval_minutes_floor" },
];

export default function TradingPage() {
  const [status, setStatus] = useState<TraderStatus | null>(null);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState<TraderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    const [s, j] = await Promise.all([fetch("/api/trader/status"), fetch("/api/trader/journal?limit=100")]);
    const sd = await s.json();
    if (!s.ok) {
      setError(sd.error ?? "Failed to load trader status");
      return;
    }
    setError(null);
    setStatus(sd);
    setDraft((d) => d ?? sd.settings);
    if (j.ok) setJournal((await j.json()).entries ?? []);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  async function act(action: string, method = "POST", body?: unknown) {
    setBusy(true);
    setNotice(null);
    const res = await fetch(`/api/trader/${action}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setNotice(`Error: ${data.error ?? res.statusText}`);
      return null;
    }
    await load();
    return data;
  }

  async function saveSettings() {
    if (!draft || !status) return;
    const changed = Object.fromEntries(
      Object.entries(draft).filter(([k, v]) => status.settings[k as keyof TraderSettings] !== v)
    );
    if (Object.keys(changed).length === 0) return setNotice("No changes to save.");
    const data = await act("settings", "PUT", changed);
    if (data) {
      setDraft(data.settings);
      setNotice("Settings saved.");
    }
  }

  if (error && !status) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Trading Agent</h1>
        <Card><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card>
      </div>
    );
  }
  if (!status || !draft) return <div className="p-6 text-muted-foreground">Loading trader…</div>;

  const { risk, run, wallet, settings } = status;
  const dayPnl = risk.day_start_value_usd != null && risk.last_value_usd != null
    ? risk.last_value_usd - risk.day_start_value_usd : null;

  const tiles = [
    { label: "Portfolio", value: usd(wallet?.portfolio_usd), icon: Wallet, tone: "text-sky-400" },
    { label: "Today P/L", value: dayPnl == null ? "—" : `${dayPnl >= 0 ? "+" : ""}${usd(dayPnl)}`,
      icon: TrendingUp, tone: dayPnl == null ? "" : dayPnl >= 0 ? "text-green-400" : "text-red-400" },
    { label: "Trades today", value: `${risk.trades_today} / ${risk.trades_today + risk.trades_remaining}`, icon: Zap, tone: "text-yellow-400" },
    { label: "Volume left", value: usd(risk.volume_remaining_usd), icon: Activity, tone: "text-purple-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Base Sepolia · testnet</p>
          <h1 className="text-2xl font-bold text-foreground">Trading Agent</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            {settings.dry_run ? <Badge variant="secondary">Dry run</Badge> : <Badge variant="warning">Live (testnet)</Badge>}
            {risk.kill_switch ? <Badge variant="destructive">Paused</Badge> : <Badge variant="success">Active</Badge>}
            {run.running && <Badge variant="outline">Running…</Badge>}
            {settings.schedule_enabled
              ? <Badge variant="outline">Every {settings.interval_minutes} min</Badge>
              : <Badge variant="outline">Manual only</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={busy}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
          {risk.kill_switch ? (
            <Button size="sm" onClick={() => act("resume")} disabled={busy}><Play className="h-4 w-4 mr-1" />Resume</Button>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => act("pause")} disabled={busy}><Pause className="h-4 w-4 mr-1" />Pause</Button>
          )}
          <Button size="sm" onClick={() => act("run")} disabled={busy || run.running || risk.kill_switch}>
            <Zap className="h-4 w-4 mr-1" />Run now
          </Button>
        </div>
      </div>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {status.wallet_error && (
        <Card><CardContent className="p-4 text-sm text-destructive">Wallet: {status.wallet_error}</CardContent></Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">{label}<Icon className={`h-4 w-4 ${tone}`} /></div>
              <p className={`text-xl font-semibold mt-1 ${tone}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Wallet</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {wallet ? (
              <>
                <a className="font-mono text-xs text-primary break-all hover:underline" target="_blank" rel="noreferrer"
                   href={`https://sepolia.basescan.org/address/${wallet.address}`}>{wallet.address}</a>
                <div className="grid grid-cols-3 gap-2">
                  <div><p className="text-muted-foreground text-xs">WETH</p><p>{wallet.balances.WETH.toFixed(5)}</p></div>
                  <div><p className="text-muted-foreground text-xs">USDC</p><p>{wallet.balances.USDC.toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground text-xs">ETH (gas)</p><p>{wallet.balances.ETH.toFixed(5)}</p></div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>ETH {wallet.eth_share_pct ?? 0}%</span><span>ETH/USD {usd(wallet.eth_usd)}</span>
                  </div>
                  <div className="h-2 rounded bg-secondary overflow-hidden">
                    <div className="h-full bg-sky-500" style={{ width: `${wallet.eth_share_pct ?? 0}%` }} />
                  </div>
                </div>
              </>
            ) : <p className="text-muted-foreground">No wallet data.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Last run</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground text-xs">
              Started {ago(run.last_started)} · finished {ago(run.last_finished)}
              {run.next_scheduled && <> · next {ago(run.next_scheduled)}</>}
            </p>
            {run.last_summary && <p>{run.last_summary}</p>}
            {run.last_error && <p className="text-destructive">{run.last_error}</p>}
            <button className="text-xs text-primary hover:underline" onClick={() => setShowLog((v) => !v)}>
              {showLog ? "Hide" : "Show"} run log
            </button>
            {showLog && (
              <pre className="text-[11px] bg-secondary/40 rounded p-2 max-h-64 overflow-auto whitespace-pre-wrap">
                {status.run_log.join("\n") || "No log yet."}
              </pre>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Trade journal</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="py-2 pr-3">When</th><th className="pr-3">Action</th><th className="pr-3">Status</th><th>Reasoning</th></tr>
            </thead>
            <tbody>
              {journal.length === 0 && <tr><td colSpan={4} className="py-4 text-muted-foreground">No entries yet.</td></tr>}
              {journal.map((e, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">{ago(e.ts)}</td>
                  <td className="pr-3 whitespace-nowrap">
                    {e.action === "swap"
                      ? <>{e.amount_in} {e.token_in} → {e.token_out} <span className="text-muted-foreground text-xs">({usd(e.usd_value)})</span></>
                      : "Run summary"}
                  </td>
                  <td className="pr-3">
                    {e.status === "executed" && <Badge variant="success">executed</Badge>}
                    {e.status === "simulated" && <Badge variant="secondary">simulated</Badge>}
                    {e.status === "rejected" && <Badge variant="destructive">rejected</Badge>}
                  </td>
                  <td className="text-xs">
                    {e.summary ?? e.reason}
                    {e.reasons && <span className="block text-destructive">{e.reasons.join("; ")}</span>}
                    {e.tx && (
                      <a className="block text-primary hover:underline" target="_blank" rel="noreferrer"
                         href={`https://sepolia.basescan.org/tx/0x${e.tx.replace(/^0x/, "")}`}>view tx</a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Limits &amp; strategy <span className="text-xs font-normal text-muted-foreground">(admin)</span></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {LIMIT_FIELDS.map(({ key, label, step, cap, floor }) => (
              <label key={key} className="text-xs text-muted-foreground space-y-1">
                <span>{label}</span>
                <input
                  type="number" step={step}
                  max={cap ? status.hard_caps[cap] : undefined}
                  min={floor ? status.hard_caps[floor] : 0}
                  value={draft[key] as number}
                  onChange={(ev) => setDraft({ ...draft, [key]: Number(ev.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
                />
                {cap && <span className="block text-[10px]">hard cap {status.hard_caps[cap]}</span>}
                {floor && <span className="block text-[10px]">minimum {status.hard_caps[floor]}</span>}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.schedule_enabled}
                     onChange={(ev) => setDraft({ ...draft, schedule_enabled: ev.target.checked })} />
              Run on schedule
            </label>
            <label className="flex items-center gap-2" title={status.live_trading_unlocked ? "" : "Locked: set ALLOW_LIVE_TRADING=true on the trader container"}>
              <input type="checkbox" checked={draft.dry_run} disabled={!status.live_trading_unlocked}
                     onChange={(ev) => setDraft({ ...draft, dry_run: ev.target.checked })} />
              Dry run {status.live_trading_unlocked ? "" : "(live trading locked)"}
            </label>
          </div>
          <label className="block text-xs text-muted-foreground space-y-1">
            <span>Strategy (plain English, given to Claude each run)</span>
            <textarea rows={4} maxLength={2000} value={draft.strategy}
                      onChange={(ev) => setDraft({ ...draft, strategy: ev.target.value })}
                      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={saveSettings} disabled={busy}><Save className="h-4 w-4 mr-1" />Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(status.settings)} disabled={busy}>Reset</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
