"""Internal HTTP API for the RMM dashboard.

Runs inside the compose network only (no published port). Every request must carry
`Authorization: Bearer $TRADER_API_TOKEN`. The wallet key never leaves this container.

  GET  /health              liveness (no auth)
  GET  /status              wallet, portfolio value, risk budget, settings, run state
  GET  /journal?limit=100   newest-first trade/run journal
  POST /run                 start one agent run now (background)
  POST /pause | /resume     kill switch on/off
  PUT  /settings            update limits / strategy / dry_run / schedule
"""
import collections
import contextlib
import hmac
import json
import os
import threading
import time
import traceback
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Request

import market
from config import HARD_CAPS, HARD_MIN_INTERVAL_MINUTES, HARD_MIN_MINUTES_BETWEEN_TRADES, SETTINGS
from risk import RiskGuard
from settings_store import SettingsError, SettingsStore

os.makedirs(SETTINGS.data_dir, exist_ok=True)
store = SettingsStore(SETTINGS.settings_file, SETTINGS.allow_live)
guard = RiskGuard(store.limits(), SETTINGS.state_file, SETTINGS.kill_switch_file)

_chain = None
_chain_error = None
_run_lock = threading.Lock()
run_state = {"running": False, "last_started": None, "last_finished": None,
             "last_summary": None, "last_error": None, "next_scheduled": None}
run_log = collections.deque(maxlen=200)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_chain():
    global _chain, _chain_error
    if _chain is None:
        try:
            from chain import Chain
            _chain = Chain(SETTINGS.rpc_url, SETTINGS.private_key)
            _chain_error = None
        except BaseException as e:  # Chain raises SystemExit on misconfig
            _chain_error = str(e)
            raise RuntimeError(_chain_error)
    return _chain


def log(line):
    run_log.append(f"{time.strftime('%H:%M:%S')} {line}")
    print(line, flush=True)


def do_run(trigger: str):
    if not _run_lock.acquire(blocking=False):
        return False
    try:
        from agent import Agent
        s = store.get()
        guard.limits = store.limits()
        run_state.update(running=True, last_started=now_iso(), last_error=None)
        run_log.clear()
        log(f"run started ({trigger}) dry_run={s['dry_run']}")
        agent = Agent(get_chain(), guard, strategy=s["strategy"], dry_run=s["dry_run"], log=log)
        run_state["last_summary"] = agent.run_once()
    except Exception as e:
        run_state["last_error"] = f"{type(e).__name__}: {e}"
        log(traceback.format_exc())
    finally:
        run_state.update(running=False, last_finished=now_iso())
        _run_lock.release()
    return True


def scheduler():
    next_at = time.time() + 60
    while True:
        s = store.get()
        if s["schedule_enabled"] and not guard.kill_switch_on():
            run_state["next_scheduled"] = datetime.fromtimestamp(next_at, timezone.utc).isoformat()
            if time.time() >= next_at:
                do_run("schedule")
                next_at = time.time() + max(s["interval_minutes"], HARD_MIN_INTERVAL_MINUTES) * 60
        else:
            run_state["next_scheduled"] = None
            next_at = time.time() + 60
        time.sleep(10)


@contextlib.asynccontextmanager
async def lifespan(_app):
    if not SETTINGS.api_token:
        raise RuntimeError("TRADER_API_TOKEN must be set")
    threading.Thread(target=scheduler, daemon=True).start()
    yield


app = FastAPI(title="Fixsmith RMM Trader", docs_url=None, redoc_url=None, lifespan=lifespan)


def auth(authorization: str = Header(default="")):
    expected = f"Bearer {SETTINGS.api_token}"
    if not SETTINGS.api_token or not hmac.compare_digest(authorization.encode(), expected.encode()):
        raise HTTPException(401, "unauthorized")


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/status", dependencies=[Depends(auth)])
def status():
    guard.limits = store.limits()
    out = {"network": "base-sepolia", "settings": store.get(),
           "hard_caps": {**HARD_CAPS, "min_minutes_between_trades_floor": HARD_MIN_MINUTES_BETWEEN_TRADES,
                         "interval_minutes_floor": HARD_MIN_INTERVAL_MINUTES},
           "live_trading_unlocked": SETTINGS.allow_live, "model": SETTINGS.anthropic_model,
           "risk": guard.status(), "run": run_state, "run_log": list(run_log)[-60:]}
    try:
        c = get_chain()
        bal = c.balances()
        px = market.eth_usd()
        weth_usd, usdc_usd = bal["WETH"] * px, bal["USDC"]
        out["wallet"] = {"address": c.address, "balances": bal, "eth_usd": px,
                         "portfolio_usd": round(weth_usd + usdc_usd, 2),
                         "eth_share_pct": round(weth_usd / (weth_usd + usdc_usd) * 100, 1) if weth_usd + usdc_usd else None}
        guard.record_portfolio_value(weth_usd + usdc_usd)
        out["risk"] = guard.status()
    except Exception as e:
        out["wallet_error"] = str(e) or _chain_error
    return out


@app.get("/journal", dependencies=[Depends(auth)])
def journal(limit: int = 100):
    limit = max(1, min(limit, 1000))
    if not os.path.exists(SETTINGS.journal_file):
        return {"entries": []}
    with open(SETTINGS.journal_file) as f:
        lines = collections.deque(f, maxlen=limit)
    entries = []
    for ln in reversed(lines):
        try:
            entries.append(json.loads(ln))
        except json.JSONDecodeError:
            pass
    return {"entries": entries}


@app.post("/run", dependencies=[Depends(auth)])
def run_now():
    if guard.kill_switch_on():
        raise HTTPException(409, "paused (kill switch on)")
    if run_state["running"]:
        raise HTTPException(409, "a run is already in progress")
    threading.Thread(target=do_run, args=("manual",), daemon=True).start()
    return {"started": True}


@app.post("/pause", dependencies=[Depends(auth)])
def pause():
    open(SETTINGS.kill_switch_file, "w").write(now_iso())
    return {"paused": True}


@app.post("/resume", dependencies=[Depends(auth)])
def resume():
    if os.path.exists(SETTINGS.kill_switch_file):
        os.remove(SETTINGS.kill_switch_file)
    return {"paused": False}


@app.put("/settings", dependencies=[Depends(auth)])
async def update_settings(request: Request):
    try:
        patch = await request.json()
        if not isinstance(patch, dict):
            raise SettingsError("body must be a JSON object")
        return {"settings": store.update(patch)}
    except (SettingsError, json.JSONDecodeError) as e:
        raise HTTPException(400, str(e))
