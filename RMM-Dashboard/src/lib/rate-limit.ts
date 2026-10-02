// In-memory fixed-window failure counter. Good enough for a single dashboard
// process; counts reset on restart.

export interface RateLimiter {
  // isBlocked reports whether key has exhausted its attempts, and if so how many
  // seconds remain until the window resets.
  isBlocked(key: string, now?: number): { blocked: boolean; retryAfterSec: number };
  recordFailure(key: string, now?: number): void;
  reset(key: string): void;
}

export function createRateLimiter(maxFailures: number, windowMs: number): RateLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();

  function current(key: string, now: number) {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= now) {
      entries.delete(key);
      return undefined;
    }
    return entry;
  }

  return {
    isBlocked(key, now = Date.now()) {
      const entry = current(key, now);
      if (!entry || entry.count < maxFailures) return { blocked: false, retryAfterSec: 0 };
      return { blocked: true, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
    },
    recordFailure(key, now = Date.now()) {
      const entry = current(key, now);
      if (entry) {
        entry.count++;
        return;
      }
      // Opportunistically drop expired entries so the map can't grow unbounded.
      if (entries.size > 10_000) {
        for (const [k, e] of entries) if (e.resetAt <= now) entries.delete(k);
      }
      entries.set(key, { count: 1, resetAt: now + windowMs });
    },
    reset(key) {
      entries.delete(key);
    },
  };
}
