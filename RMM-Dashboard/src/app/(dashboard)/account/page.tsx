"use client";

import { useEffect, useState, useCallback } from "react";
import { UserCog, ShieldCheck, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Account {
  username: string;
  role: "ADMIN" | "TECH";
  totpEnabled: boolean;
  bootstrap: boolean;
}

interface Setup {
  secret: string;
  otpauthUrl: string;
  qrDataUrl: string;
  setupToken: string;
}

const inputClass =
  "w-full bg-background border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error, data };
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useCallback(async () => {
    if (next !== confirmPw) {
      setMessage({ ok: false, text: "New passwords don't match" });
      return;
    }
    setSaving(true);
    setMessage(null);
    const r = await postJson("/api/account/password", { currentPassword: current, newPassword: next });
    setSaving(false);
    if (r.ok) {
      setCurrent(""); setNext(""); setConfirmPw("");
      setMessage({ ok: true, text: "Password changed. Your other sessions have been signed out." });
    } else {
      setMessage({ ok: false, text: r.error ?? "Could not change password" });
    }
  }, [current, next, confirmPw]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" /> Password
      </h2>
      <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password"
        autoComplete="current-password" className={inputClass} />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (min 8)"
        autoComplete="new-password" className={inputClass} />
      <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password"
        autoComplete="new-password" className={inputClass} />
      {message && <p className={`text-sm ${message.ok ? "text-green-400" : "text-destructive"}`}>{message.text}</p>}
      <Button size="sm" onClick={save} disabled={saving || !current || next.length < 8} className="h-7 text-xs">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Change password
      </Button>
    </div>
  );
}

function TwoFactorCard({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    setBusy(true); setError("");
    const r = await postJson("/api/account/totp/setup", {});
    setBusy(false);
    if (r.ok) setSetup(r.data as Setup);
    else setError(r.error ?? "Could not start setup");
  }, []);

  const enable = useCallback(async () => {
    if (!setup) return;
    setBusy(true); setError("");
    const r = await postJson("/api/account/totp/enable", { setupToken: setup.setupToken, code });
    setBusy(false);
    if (r.ok) { setSetup(null); setCode(""); onChange(); }
    else setError(r.error ?? "Could not turn on two-factor authentication");
  }, [setup, code, onChange]);

  const disable = useCallback(async () => {
    setBusy(true); setError("");
    const r = await postJson("/api/account/totp/disable", { password, code });
    setBusy(false);
    if (r.ok) { setPassword(""); setCode(""); onChange(); }
    else setError(r.error ?? "Could not turn off two-factor authentication");
  }, [password, code, onChange]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" /> Two-factor authentication
        {enabled ? <Badge variant="success" className="text-xs">On</Badge> : <Badge variant="secondary" className="text-xs">Off</Badge>}
      </h2>

      {enabled ? (
        <>
          <p className="text-sm text-muted-foreground">
            Signing in asks for a code from your authenticator app. To turn this off, confirm your password and a current code.
          </p>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password"
            autoComplete="current-password" className={inputClass} />
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" inputMode="numeric"
            autoComplete="one-time-code" className={`${inputClass} tracking-widest`} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="sm" variant="destructive" onClick={disable} disabled={busy || !password || !code} className="h-7 text-xs">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Turn off
          </Button>
        </>
      ) : setup ? (
        <>
          <p className="text-sm text-muted-foreground">
            Scan this QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, etc.),
            then enter the 6-digit code it shows.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing for next/image to optimise */}
          <img src={setup.qrDataUrl} alt="QR code for your authenticator app" className="rounded bg-white p-2 w-[220px] h-[220px]" />
          <p className="text-xs text-muted-foreground">
            Can&apos;t scan it? Enter this key manually: <code className="text-foreground break-all">{setup.secret}</code>
            {" "}or <a href={setup.otpauthUrl} className="text-primary underline">open it in your authenticator</a>.
          </p>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" inputMode="numeric"
            autoComplete="one-time-code" className={`${inputClass} tracking-widest`} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={enable} disabled={busy || !code} className="h-7 text-xs">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Verify and turn on
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setSetup(null); setCode(""); setError(""); }} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Protect your account with a code from an authenticator app in addition to your password.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="sm" onClick={start} disabled={busy} className="h-7 text-xs">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Set up
          </Button>
        </>
      )}
    </div>
  );
}

export default function AccountPage() {
  const [account, setAccount] = useState<Account | null>(null);

  const fetchAccount = useCallback(async () => {
    const res = await fetch("/api/account");
    if (res.ok) setAccount(await res.json());
  }, []);

  useEffect(() => { fetchAccount(); }, [fetchAccount]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <UserCog className="h-6 w-6 text-primary" /> Account
        </h1>
        {account && (
          <p className="text-muted-foreground text-sm mt-1">
            Signed in as <span className="text-foreground font-medium">{account.username}</span> ({account.role})
          </p>
        )}
      </div>

      {!account ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
      ) : account.bootstrap ? (
        <p className="text-sm text-muted-foreground max-w-lg">
          You&apos;re signed in with the bootstrap password. Create an admin account on the Users page and sign in with
          it to manage your password and two-factor authentication.
        </p>
      ) : (
        <div className="max-w-lg space-y-4">
          <TwoFactorCard enabled={account.totpEnabled} onChange={fetchAccount} />
          <PasswordCard />
        </div>
      )}
    </div>
  );
}
