// Server-side client for the RMM-Trader service (internal compose network only).
// The trader API token and wallet key never reach the browser.

const TRADER_URL = process.env.TRADER_URL ?? "";
const TRADER_API_TOKEN = process.env.TRADER_API_TOKEN ?? "";

export function traderConfigured(): boolean {
  return Boolean(TRADER_URL && TRADER_API_TOKEN);
}

export async function traderFetch(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ status: number; data: unknown }> {
  if (!traderConfigured()) {
    return { status: 503, data: { error: "Trader not configured (set TRADER_URL and TRADER_API_TOKEN)" } };
  }
  try {
    const res = await fetch(`${TRADER_URL.replace(/\/$/, "")}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${TRADER_API_TOKEN}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || res.statusText };
    }
    // FastAPI puts error messages in `detail`; normalise to `error` like the rest of the dashboard.
    if (!res.ok && data && typeof data === "object" && "detail" in data) {
      data = { error: (data as { detail: unknown }).detail };
    }
    return { status: res.status, data };
  } catch (e) {
    return { status: 502, data: { error: `Trader unreachable: ${(e as Error).message}` } };
  }
}

// Types mirrored from RMM-Trader/server.py
export interface TraderSettings {
  max_trade_usd: number;
  max_daily_volume_usd: number;
  max_trades_per_day: number;
  max_slippage_bps: number;
  max_price_deviation_pct: number;
  min_minutes_between_trades: number;
  max_daily_loss_usd: number;
  strategy: string;
  dry_run: boolean;
  schedule_enabled: boolean;
  interval_minutes: number;
}

export interface TraderStatus {
  network: string;
  model: string;
  live_trading_unlocked: boolean;
  settings: TraderSettings;
  hard_caps: Record<string, number>;
  risk: {
    kill_switch: boolean;
    trades_today: number;
    trades_remaining: number;
    volume_today_usd: number;
    volume_remaining_usd: number;
    minutes_since_last_trade: number;
    day_start_value_usd: number | null;
    last_value_usd: number | null;
  };
  run: {
    running: boolean;
    last_started: string | null;
    last_finished: string | null;
    last_summary: string | null;
    last_error: string | null;
    next_scheduled: string | null;
  };
  run_log: string[];
  wallet?: {
    address: string;
    balances: { ETH: number; WETH: number; USDC: number };
    eth_usd: number;
    portfolio_usd: number;
    eth_share_pct: number | null;
  };
  wallet_error?: string;
}

export interface JournalEntry {
  ts: string;
  action: "swap" | "run_summary";
  status?: "executed" | "simulated" | "rejected";
  dry_run?: boolean;
  token_in?: string;
  token_out?: string;
  amount_in?: number;
  usd_value?: number;
  quoted_out?: number;
  reason?: string;
  reasons?: string[];
  tx?: string;
  summary?: string;
}
