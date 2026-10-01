"""Runtime settings edited from the RMM dashboard, validated against hard caps."""
import json
import os
import threading
from dataclasses import asdict, fields

from config import HARD_CAPS, HARD_MIN_INTERVAL_MINUTES, HARD_MIN_MINUTES_BETWEEN_TRADES, Limits

DEFAULT_STRATEGY = ("Keep the portfolio roughly balanced between ETH and USDC. Lean slightly into ETH after "
                    "meaningful dips below the 24h average and trim ETH after meaningful rallies above it. "
                    "Ignore moves smaller than about 1.5%.")

DEFAULTS = {
    **asdict(Limits()),
    "strategy": DEFAULT_STRATEGY,
    "dry_run": True,
    "schedule_enabled": False,
    "interval_minutes": 30,
}
LIMIT_KEYS = {f.name for f in fields(Limits)}
INT_KEYS = {"max_trades_per_day", "max_slippage_bps"}


class SettingsError(ValueError):
    pass


def validate(patch: dict, allow_live: bool) -> dict:
    clean = {}
    for k, v in patch.items():
        if k not in DEFAULTS:
            raise SettingsError(f"unknown setting '{k}'")
        if k in LIMIT_KEYS or k == "interval_minutes":
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                raise SettingsError(f"{k} must be a number")
            v = int(v) if k in INT_KEYS else float(v)
            if v <= 0:
                raise SettingsError(f"{k} must be > 0")
            if k in HARD_CAPS and v > HARD_CAPS[k]:
                raise SettingsError(f"{k} cannot exceed hard cap {HARD_CAPS[k]}")
            if k == "min_minutes_between_trades" and v < HARD_MIN_MINUTES_BETWEEN_TRADES:
                raise SettingsError(f"{k} cannot be below {HARD_MIN_MINUTES_BETWEEN_TRADES}")
            if k == "interval_minutes" and v < HARD_MIN_INTERVAL_MINUTES:
                raise SettingsError(f"{k} cannot be below {HARD_MIN_INTERVAL_MINUTES}")
        elif k in ("dry_run", "schedule_enabled"):
            if not isinstance(v, bool):
                raise SettingsError(f"{k} must be true/false")
            if k == "dry_run" and v is False and not allow_live:
                raise SettingsError("live trading is locked: set ALLOW_LIVE_TRADING=true on the trader container")
        elif k == "strategy":
            if not isinstance(v, str) or not v.strip():
                raise SettingsError("strategy must be non-empty text")
            if len(v) > 2000:
                raise SettingsError("strategy is limited to 2000 characters")
            v = v.strip()
        clean[k] = v
    return clean


class SettingsStore:
    def __init__(self, path: str, allow_live: bool):
        self.path, self.allow_live = path, allow_live
        self._lock = threading.Lock()

    def get(self) -> dict:
        with self._lock:
            data = dict(DEFAULTS)
            if os.path.exists(self.path):
                with open(self.path) as f:
                    stored = json.load(f)
                data.update({k: v for k, v in stored.items() if k in DEFAULTS})
            if not self.allow_live:
                data["dry_run"] = True
            return data

    def update(self, patch: dict) -> dict:
        clean = validate(patch, self.allow_live)
        current = self.get()
        current.update(clean)
        with self._lock:
            tmp = self.path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(current, f, indent=2)
            os.replace(tmp, self.path)
        return current

    def limits(self) -> Limits:
        s = self.get()
        vals = {k: s[k] for k in LIMIT_KEYS}
        # Defence in depth: clamp even if settings.json was edited by hand.
        for k, cap in HARD_CAPS.items():
            vals[k] = min(vals[k], cap)
        vals["min_minutes_between_trades"] = max(vals["min_minutes_between_trades"], HARD_MIN_MINUTES_BETWEEN_TRADES)
        return Limits(**vals)
