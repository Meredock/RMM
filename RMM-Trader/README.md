# RMM-Trader — AI trading agent (Base Sepolia testnet)

Claude decides; Python tools act; `risk.py` has the final say on every swap. Trades WETH ↔ USDC on
Uniswap V3 on **Base Sepolia only** — `chain.py` exits if the RPC is any other chain.
Managed from the dashboard's **Trading** page (status, P/L, journal, pause/resume, run now, limits, strategy).

## How it fits the RMM stack
```
browser ──> dashboard /trading ──> /api/trader/* (session auth; writes = ADMIN + audit log)
                                        │  Bearer TRADER_API_TOKEN, compose network only
                                        ▼
                                  trader:8000 (server.py)  ── wallet key lives only here
```

## Safety layers
1. **Testnet only** — chain id check + token symbol check at startup.
2. **Hard caps in env** (`HARD_*`) — the dashboard cannot set limits above them; `settings.json` is clamped too.
3. **Risk guard** per trade — size, daily volume, trade count, cooldown, slippage, pool-vs-real-price deviation, daily loss.
4. **Dry run by default**; turning it off needs `ALLOW_LIVE_TRADING=true` on the container *and* an admin toggle.
5. **Kill switch** — Pause in the dashboard (or a `STOP` file in `/data`).
6. Exact-amount token approvals only; every decision journalled with Claude's reasoning.

## Setup
```bash
# in the repo root
openssl rand -hex 32                                        # -> TRADER_API_TOKEN in .env
docker compose -f docker-compose.yml -f docker-compose.trader.yml run --rm --no-deps trader python main.py newwallet
# -> TRADER_PRIVATE_KEY in .env, plus ANTHROPIC_API_KEY
docker compose -f docker-compose.yml -f docker-compose.trader.yml up -d --build
```
Fund the printed address with testnet ETH (a Base Sepolia faucet) and testnet USDC (faucet.circle.com),
then wrap some ETH: `docker compose ... exec trader python main.py wrap 0.01`.

Testnet pool prices are often nonsense. Decisions use the real ETH price (CoinGecko); if the pool is more than
`max_price_deviation_pct` off, swaps are rejected — the journal will say so.

## Local dev / tests
```bash
pip install -r requirements.txt pytest httpx
python -m pytest -q
TRADER_API_TOKEN=dev DATA_DIR=./data uvicorn server:app --reload
```
