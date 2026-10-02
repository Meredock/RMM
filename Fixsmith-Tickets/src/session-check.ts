// Confirms with the dashboard that a session is still valid. Tickets can verify
// the cookie's signature itself, but only the dashboard knows whether the user
// has since been deleted, demoted or had their password changed, so a signed
// token alone isn't enough.

export type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ status: number }>;

export interface SessionCheckerOptions {
  dashboardUrl: string;
  cookieName: string;
  // How long a confirmed session is trusted before asking again. This bounds how
  // long a revoked session keeps working in Tickets.
  cacheTtlMs?: number;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
}

const MAX_CACHE_ENTRIES = 5_000;

export function createSessionChecker(opts: SessionCheckerOptions) {
  const ttl = opts.cacheTtlMs ?? 30_000;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const fetchImpl = opts.fetchImpl ?? (fetch as unknown as FetchLike);
  const now = opts.now ?? Date.now;
  const endpoint = `${opts.dashboardUrl.replace(/\/+$/, "")}/api/auth/session`;
  const confirmedUntil = new Map<string, number>();

  // isSessionValid returns true only when the dashboard confirms the session.
  // Any other answer, including the dashboard being unreachable, is a no.
  return async function isSessionValid(token: string): Promise<boolean> {
    const t = now();
    const until = confirmedUntil.get(token);
    if (until !== undefined && until > t) return true;
    confirmedUntil.delete(token);

    let valid = false;
    try {
      const res = await fetchImpl(endpoint, {
        headers: { cookie: `${opts.cookieName}=${encodeURIComponent(token)}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
      valid = res.status === 200;
    } catch (err) {
      console.error("[session-check] dashboard unreachable:", err instanceof Error ? err.message : err);
    }

    if (valid) {
      if (confirmedUntil.size >= MAX_CACHE_ENTRIES) {
        for (const [k, exp] of confirmedUntil) if (exp <= t) confirmedUntil.delete(k);
        if (confirmedUntil.size >= MAX_CACHE_ENTRIES) confirmedUntil.clear();
      }
      confirmedUntil.set(token, t + ttl);
    }
    return valid;
  };
}
