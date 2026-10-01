"""Reference market data from the real ETH market (CoinGecko, no key needed).

Testnet pools have meaningless prices, so decisions are made on the real
market and the testnet pool is only used for execution practice. The risk
guard blocks trades when the pool price drifts too far from this reference.
"""
import statistics
import time

import requests

CG = "https://api.coingecko.com/api/v3"
_cache = {}


def _get(path, params, ttl=60):
    key = (path, tuple(sorted(params.items())))
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    r = requests.get(f"{CG}{path}", params=params, timeout=20)
    r.raise_for_status()
    _cache[key] = (time.time(), r.json())
    return _cache[key][1]


def eth_usd():
    return float(_get("/simple/price", {"ids": "ethereum", "vs_currencies": "usd"})["ethereum"]["usd"])


def price_usd(sym):
    return 1.0 if sym == "USDC" else eth_usd()


def market_summary():
    """Hourly ETH prices over 2 days plus a few simple indicators."""
    data = _get("/coins/ethereum/market_chart", {"vs_currency": "usd", "days": "2"}, ttl=300)
    prices = [p[1] for p in data["prices"]]
    now = prices[-1]

    def pct(n):
        return round((now / prices[-n] - 1) * 100, 2) if len(prices) > n else None

    sma = lambda n: round(statistics.mean(prices[-n:]), 2)
    rets = [prices[i] / prices[i - 1] - 1 for i in range(1, len(prices))]
    return {
        "eth_usd": round(now, 2),
        "change_1h_pct": pct(2),
        "change_6h_pct": pct(7),
        "change_24h_pct": pct(25),
        "sma_6h": sma(6),
        "sma_24h": sma(24),
        "hourly_volatility_pct": round(statistics.pstdev(rets[-24:]) * 100, 3),
        "high_48h": round(max(prices), 2),
        "low_48h": round(min(prices), 2),
        "last_12_hourly": [round(p, 2) for p in prices[-12:]],
    }
