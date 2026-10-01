"""Hard risk limits, enforced in code. The LLM can ask; only this module can say yes.

Pure logic + a small JSON state file, so it is easy to unit test.
"""
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

from config import Limits, TOKENS


@dataclass
class TradeRequest:
    token_in: str
    token_out: str
    amount_in: float          # human units of token_in
    usd_value: float          # reference USD value of amount_in
    quoted_out: float         # human units from on-chain quote
    reference_out: float      # expected out at reference (real market) price
    slippage_bps: int


@dataclass
class Decision:
    allowed: bool
    reasons: list = field(default_factory=list)


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


class RiskGuard:
    def __init__(self, limits: Limits, state_file: str, kill_switch_file: str):
        self.limits = limits
        self.state_file = state_file
        self.kill_switch_file = kill_switch_file
        self.state = self._load()

    # ---- state -------------------------------------------------------------
    def _load(self):
        if os.path.exists(self.state_file):
            with open(self.state_file) as f:
                s = json.load(f)
        else:
            s = {}
        if s.get("day") != _today():
            s = {"day": _today(), "volume_usd": 0.0, "trades": 0,
                 "start_value_usd": s.get("last_value_usd"),
                 "last_trade_ts": s.get("last_trade_ts", 0)}
        return s

    def _save(self):
        tmp = self.state_file + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.state, f, indent=2)
        os.replace(tmp, self.state_file)

    def record_portfolio_value(self, value_usd: float):
        self.state = self._load()
        if self.state.get("start_value_usd") is None:
            self.state["start_value_usd"] = value_usd
        self.state["last_value_usd"] = value_usd
        self._save()

    def record_trade(self, usd_value: float):
        self.state["volume_usd"] += usd_value
        self.state["trades"] += 1
        self.state["last_trade_ts"] = time.time()
        self._save()

    # ---- checks ------------------------------------------------------------
    def kill_switch_on(self):
        return os.path.exists(self.kill_switch_file)

    def check(self, req: TradeRequest, now: float | None = None) -> Decision:
        self.state = self._load()
        now = now or time.time()
        L, s, r = self.limits, self.state, []

        if self.kill_switch_on():
            r.append(f"kill switch file '{self.kill_switch_file}' present")
        if req.token_in not in TOKENS or req.token_out not in TOKENS or req.token_in == req.token_out:
            r.append(f"pair {req.token_in}->{req.token_out} not allowed")
        if req.amount_in <= 0 or req.usd_value <= 0:
            r.append("amount must be positive")
        if req.usd_value > L.max_trade_usd:
            r.append(f"trade ${req.usd_value:.2f} > max ${L.max_trade_usd:.2f}")
        if s["volume_usd"] + req.usd_value > L.max_daily_volume_usd:
            r.append(f"daily volume would be ${s['volume_usd'] + req.usd_value:.2f} > ${L.max_daily_volume_usd:.2f}")
        if s["trades"] >= L.max_trades_per_day:
            r.append(f"already {s['trades']} trades today (max {L.max_trades_per_day})")
        mins = (now - s.get("last_trade_ts", 0)) / 60
        if mins < L.min_minutes_between_trades:
            r.append(f"last trade {mins:.1f} min ago (min gap {L.min_minutes_between_trades})")
        if req.slippage_bps > L.max_slippage_bps:
            r.append(f"slippage {req.slippage_bps}bps > max {L.max_slippage_bps}bps")
        if req.reference_out > 0:
            dev = abs(req.quoted_out - req.reference_out) / req.reference_out * 100
            if dev > L.max_price_deviation_pct:
                r.append(f"pool price deviates {dev:.1f}% from reference (max {L.max_price_deviation_pct}%)")
        else:
            r.append("no reference price")
        start, last = s.get("start_value_usd"), s.get("last_value_usd")
        if start is not None and last is not None and start - last > L.max_daily_loss_usd:
            r.append(f"daily loss ${start - last:.2f} > max ${L.max_daily_loss_usd:.2f}")

        return Decision(allowed=not r, reasons=r)

    def status(self):
        self.state = self._load()
        L = self.limits
        return {
            "kill_switch": self.kill_switch_on(),
            "trades_today": self.state["trades"],
            "trades_remaining": max(0, L.max_trades_per_day - self.state["trades"]),
            "volume_today_usd": round(self.state["volume_usd"], 2),
            "volume_remaining_usd": round(max(0, L.max_daily_volume_usd - self.state["volume_usd"]), 2),
            "max_trade_usd": L.max_trade_usd,
            "max_slippage_bps": L.max_slippage_bps,
            "min_minutes_between_trades": L.min_minutes_between_trades,
            "minutes_since_last_trade": round((time.time() - self.state.get("last_trade_ts", 0)) / 60, 1),
            "day_start_value_usd": self.state.get("start_value_usd"),
            "last_value_usd": self.state.get("last_value_usd"),
        }
