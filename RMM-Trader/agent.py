"""The agent: Claude decides, tools act, RiskGuard has the final say."""
import json
import time
from datetime import datetime, timezone

import anthropic

import market
from config import SETTINGS
from risk import RiskGuard, TradeRequest

SYSTEM = """You are an autonomous trading agent managing a small WETH/USDC portfolio on Base Sepolia (testnet).
Each run you wake up, look at the portfolio and the real ETH market, decide whether to trade, act, then stop.

Rules:
- Start with get_portfolio, get_market_data and get_risk_status.
- Doing nothing is a valid and often correct decision. Don't trade on noise.
- Size trades within the limits in get_risk_status. Get a quote before any swap.
- Hard limits are enforced in code; if a swap is rejected, do not try to split or work around it.
- Always finish by calling end_run with a short plain-English summary of what you did and why.
Strategy guidance: {strategy}"""

TOOLS = [
    {"name": "get_portfolio", "description": "Wallet balances (ETH for gas, WETH, USDC) and USD values.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_market_data", "description": "Real-market ETH/USD price, recent changes, moving averages and volatility.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_risk_status", "description": "Current hard limits and how much of today's budget is left.",
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_quote", "description": "On-chain Uniswap quote for swapping amount_in of token_in into token_out.",
     "input_schema": {"type": "object", "required": ["token_in", "token_out", "amount_in"], "properties": {
         "token_in": {"type": "string", "enum": ["WETH", "USDC"]},
         "token_out": {"type": "string", "enum": ["WETH", "USDC"]},
         "amount_in": {"type": "number", "description": "Human units of token_in"}}}},
    {"name": "execute_swap", "description": "Swap on Uniswap. Subject to hard risk checks; may be rejected.",
     "input_schema": {"type": "object", "required": ["token_in", "token_out", "amount_in", "reason"], "properties": {
         "token_in": {"type": "string", "enum": ["WETH", "USDC"]},
         "token_out": {"type": "string", "enum": ["WETH", "USDC"]},
         "amount_in": {"type": "number"},
         "slippage_bps": {"type": "integer", "description": "Max slippage in basis points, default 50"},
         "reason": {"type": "string", "description": "One-sentence rationale, saved to the journal"}}}},
    {"name": "end_run", "description": "Finish this run with a summary.",
     "input_schema": {"type": "object", "required": ["summary"], "properties": {"summary": {"type": "string"}}}},
]


class Agent:
    def __init__(self, chain, guard: RiskGuard, strategy: str, dry_run: bool = True, log=print):
        self.chain, self.guard, self.dry_run, self.log = chain, guard, dry_run, log
        self.strategy = strategy
        self.client = anthropic.Anthropic()
        self.trades_this_run = 0

    # ---- journal -----------------------------------------------------------
    def journal(self, entry):
        entry["ts"] = datetime.now(timezone.utc).isoformat()
        entry["dry_run"] = self.dry_run
        with open(SETTINGS.journal_file, "a") as f:
            f.write(json.dumps(entry) + "\n")

    # ---- tools -------------------------------------------------------------
    def t_get_portfolio(self, _):
        bal = self.chain.balances()
        px = market.eth_usd()
        values = {"WETH": bal["WETH"] * px, "USDC": bal["USDC"], "ETH_gas": bal["ETH"] * px}
        total = values["WETH"] + values["USDC"]
        self.guard.record_portfolio_value(total)
        return {"balances": bal, "eth_usd": px, "usd_values": {k: round(v, 2) for k, v in values.items()},
                "tradable_total_usd": round(total, 2),
                "eth_share_pct": round(values["WETH"] / total * 100, 1) if total else None}

    def t_get_market_data(self, _):
        return market.market_summary()

    def t_get_risk_status(self, _):
        return {**self.guard.status(), "dry_run": self.dry_run}

    def t_get_quote(self, a):
        out = self.chain.quote(a["token_in"], a["token_out"], a["amount_in"])
        ref = a["amount_in"] * market.price_usd(a["token_in"]) / market.price_usd(a["token_out"])
        dev = (out / ref - 1) * 100 if ref else None
        return {"amount_out": out, "reference_out": ref, "pool_vs_reference_pct": round(dev, 2) if dev is not None else None}

    def t_execute_swap(self, a):
        tin, tout, amt = a["token_in"], a["token_out"], float(a["amount_in"])
        slip = int(a.get("slippage_bps", 50))
        bal = self.chain.balances()
        if amt > bal.get(tin, 0):
            return {"status": "rejected", "reasons": [f"insufficient {tin}: have {bal.get(tin, 0)}"]}
        quoted = self.chain.quote(tin, tout, amt)
        usd = amt * market.price_usd(tin)
        ref = usd / market.price_usd(tout)
        req = TradeRequest(tin, tout, amt, usd, quoted, ref, slip)
        decision = self.guard.check(req)
        entry = {"action": "swap", **req.__dict__, "reason": a.get("reason", "")}
        if not decision.allowed:
            self.journal({**entry, "status": "rejected", "reasons": decision.reasons})
            return {"status": "rejected", "reasons": decision.reasons}
        self.trades_this_run += 1
        min_out = quoted * (1 - slip / 10_000)
        if self.dry_run:
            self.guard.record_trade(usd)
            self.journal({**entry, "status": "simulated", "min_out": min_out})
            return {"status": "simulated (DRY_RUN)", "would_receive": quoted, "min_out": min_out}
        tx = self.chain.swap(tin, tout, amt, min_out)
        self.guard.record_trade(usd)
        self.journal({**entry, "status": "executed", "tx": tx, "min_out": min_out})
        return {"status": "executed", "tx": tx, "explorer": f"https://sepolia.basescan.org/tx/0x{tx.removeprefix('0x')}"}

    # ---- loop --------------------------------------------------------------
    def run_once(self, max_steps: int = 15):
        if self.guard.kill_switch_on():
            self.log("Kill switch present — skipping run.")
            return "skipped (kill switch)"
        messages = [{"role": "user", "content": f"Run started {datetime.now(timezone.utc).isoformat()}. Go."}]
        system = SYSTEM.format(strategy=self.strategy)
        for _ in range(max_steps):
            resp = self.client.messages.create(model=SETTINGS.anthropic_model, max_tokens=2000,
                                               system=system, tools=TOOLS, messages=messages)
            messages.append({"role": "assistant", "content": resp.content})
            for b in resp.content:
                if b.type == "text" and b.text.strip():
                    self.log(f"  claude: {b.text.strip()}")
            calls = [b for b in resp.content if b.type == "tool_use"]
            if not calls:
                return "ended without end_run"
            results = []
            for c in calls:
                if c.name == "end_run":
                    self.log(f"  summary: {c.input['summary']}")
                    self.journal({"action": "run_summary", "summary": c.input["summary"]})
                    return c.input["summary"]
                try:
                    out = getattr(self, f"t_{c.name}")(c.input)
                except Exception as e:  # surface errors to the model instead of crashing
                    out = {"error": f"{type(e).__name__}: {e}"}
                self.log(f"  tool {c.name}({json.dumps(c.input)}) -> {json.dumps(out, default=str)[:300]}")
                results.append({"type": "tool_result", "tool_use_id": c.id, "content": json.dumps(out, default=str)})
            messages.append({"role": "user", "content": results})
        return "hit max steps"
