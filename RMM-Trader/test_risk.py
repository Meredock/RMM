import os
import tempfile
import time

from config import Limits
from risk import RiskGuard, TradeRequest

L = Limits(max_trade_usd=25, max_daily_volume_usd=60, max_trades_per_day=3, max_slippage_bps=100,
           max_price_deviation_pct=5, min_minutes_between_trades=30, max_daily_loss_usd=50)


def guard(tmp):
    return RiskGuard(L, os.path.join(tmp, "s.json"), os.path.join(tmp, "STOP"))


def req(usd=20, quoted=0.0100, ref=0.0100, slip=50, tin="USDC", tout="WETH"):
    return TradeRequest(tin, tout, usd, usd, quoted, ref, slip)


def test_ok():
    with tempfile.TemporaryDirectory() as d:
        assert guard(d).check(req()).allowed


def test_trade_too_big():
    with tempfile.TemporaryDirectory() as d:
        dec = guard(d).check(req(usd=26))
        assert not dec.allowed and "max $25" in dec.reasons[0]


def test_slippage_and_deviation():
    with tempfile.TemporaryDirectory() as d:
        g = guard(d)
        assert not g.check(req(slip=150)).allowed
        assert not g.check(req(quoted=0.0090)).allowed   # 10% off reference
        assert g.check(req(quoted=0.0098)).allowed       # 2% off


def test_bad_pair():
    with tempfile.TemporaryDirectory() as d:
        assert not guard(d).check(req(tin="WETH", tout="WETH")).allowed
        assert not guard(d).check(req(tin="DOGE")).allowed


def test_cooldown_count_and_volume():
    with tempfile.TemporaryDirectory() as d:
        g = guard(d)
        g.record_trade(20)
        assert not g.check(req()).allowed                                   # cooldown
        later = time.time() + 31 * 60
        assert g.check(req(), now=later).allowed
        g.record_trade(20); g.state["last_trade_ts"] = 0; g._save()
        assert not g.check(req(usd=21), now=later).allowed                  # 40+21 > 60 volume
        g.record_trade(5); g.state["last_trade_ts"] = 0; g._save()
        assert not g.check(req(usd=1), now=later).allowed                   # 3 trades = max


def test_kill_switch():
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, "STOP"), "w").close()
        assert not guard(d).check(req()).allowed


def test_daily_loss():
    with tempfile.TemporaryDirectory() as d:
        g = guard(d)
        g.record_portfolio_value(200)
        g.record_portfolio_value(140)
        assert not g.check(req()).allowed


def test_state_persists():
    with tempfile.TemporaryDirectory() as d:
        guard(d).record_trade(10)
        assert guard(d).status()["trades_today"] == 1
