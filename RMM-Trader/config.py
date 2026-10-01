"""Static configuration: addresses, secrets and HARD ceilings (env only).

Day-to-day limits/strategy are editable from the RMM dashboard (see settings_store.py),
but can never exceed the HARD_* ceilings set here in the container environment.
"""
import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

BASE_SEPOLIA_CHAIN_ID = 84532

# Base Sepolia addresses (Uniswap + Circle docs). Token symbols are verified on-chain at startup.
TOKENS = {
    "WETH": {"address": "0x4200000000000000000000000000000000000006", "decimals": 18},
    "USDC": {"address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "decimals": 6},
}
SWAP_ROUTER_02 = "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"
QUOTER_V2 = "0xC5290058841028F1614F3A6F0F5816cAd0df5E27"
POOL_FEE = int(os.getenv("POOL_FEE", "3000"))


@dataclass(frozen=True)
class Limits:
    max_trade_usd: float = 25
    max_daily_volume_usd: float = 100
    max_trades_per_day: int = 6
    max_slippage_bps: int = 100
    max_price_deviation_pct: float = 5
    min_minutes_between_trades: float = 30
    max_daily_loss_usd: float = 50


# Ceilings the dashboard cannot exceed. Change only by editing the container env.
HARD_CAPS = {
    "max_trade_usd": float(os.getenv("HARD_MAX_TRADE_USD", "100")),
    "max_daily_volume_usd": float(os.getenv("HARD_MAX_DAILY_VOLUME_USD", "500")),
    "max_trades_per_day": int(os.getenv("HARD_MAX_TRADES_PER_DAY", "24")),
    "max_slippage_bps": int(os.getenv("HARD_MAX_SLIPPAGE_BPS", "300")),
    "max_price_deviation_pct": float(os.getenv("HARD_MAX_PRICE_DEVIATION_PCT", "15")),
    "max_daily_loss_usd": float(os.getenv("HARD_MAX_DAILY_LOSS_USD", "250")),
}
# Floor rather than ceiling: the dashboard can't make trades more frequent than this.
HARD_MIN_MINUTES_BETWEEN_TRADES = float(os.getenv("HARD_MIN_MINUTES_BETWEEN_TRADES", "5"))
HARD_MIN_INTERVAL_MINUTES = float(os.getenv("HARD_MIN_INTERVAL_MINUTES", "5"))


@dataclass(frozen=True)
class Settings:
    rpc_url: str = os.getenv("RPC_URL", "https://sepolia.base.org")
    private_key: str = os.getenv("PRIVATE_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    data_dir: str = os.getenv("DATA_DIR", ".")
    api_token: str = os.getenv("TRADER_API_TOKEN", "")
    # Live (non-dry-run) trading must be unlocked in env as well as toggled in the dashboard.
    allow_live: bool = os.getenv("ALLOW_LIVE_TRADING", "false").lower() == "true"

    @property
    def state_file(self):
        return os.path.join(self.data_dir, "state.json")

    @property
    def journal_file(self):
        return os.path.join(self.data_dir, "trades.jsonl")

    @property
    def kill_switch_file(self):
        return os.path.join(self.data_dir, "STOP")

    @property
    def settings_file(self):
        return os.path.join(self.data_dir, "settings.json")


SETTINGS = Settings()
