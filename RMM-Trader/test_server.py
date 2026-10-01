import importlib
import os
import sys
import tempfile
import time

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    d = tempfile.mkdtemp()
    monkeypatch.setenv("DATA_DIR", d)
    monkeypatch.setenv("TRADER_API_TOKEN", "secret")
    for m in ("config", "settings_store", "risk", "server"):
        sys.modules.pop(m, None)
    server = importlib.import_module("server")

    class FakeChain:
        address = "0xabc"
        def balances(self): return {"ETH": 0.01, "WETH": 0.02, "USDC": 50.0}
    monkeypatch.setattr(server, "get_chain", lambda: FakeChain())
    monkeypatch.setattr(server.market, "eth_usd", lambda: 2500.0)

    class FakeAgent:
        def __init__(self, *a, **k): pass
        def run_once(self): return "held"
    import agent
    monkeypatch.setattr(agent, "Agent", FakeAgent)
    with TestClient(server.app) as c:
        yield c


H = {"Authorization": "Bearer secret"}


def test_auth_required(client):
    assert client.get("/status").status_code == 401
    assert client.get("/status", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/health").status_code == 200


def test_status(client):
    r = client.get("/status", headers=H).json()
    assert r["wallet"]["portfolio_usd"] == 100.0
    assert r["wallet"]["eth_share_pct"] == 50.0
    assert r["settings"]["dry_run"] is True


def test_settings_validation(client):
    assert client.put("/settings", headers=H, json={"max_trade_usd": 10}).status_code == 200
    r = client.put("/settings", headers=H, json={"max_trade_usd": 1e6})
    assert r.status_code == 400 and "hard cap" in r.json()["detail"]
    assert client.put("/settings", headers=H, json={"dry_run": False}).status_code == 400


def test_pause_blocks_run_and_resume(client):
    client.post("/pause", headers=H)
    assert client.get("/status", headers=H).json()["risk"]["kill_switch"] is True
    assert client.post("/run", headers=H).status_code == 409
    client.post("/resume", headers=H)
    assert client.post("/run", headers=H).status_code == 200
    for _ in range(50):
        st = client.get("/status", headers=H).json()["run"]
        if st["last_finished"]:
            break
        time.sleep(0.05)
    assert st["last_summary"] == "held"


def test_journal_empty_then_entries(client):
    import server
    assert client.get("/journal", headers=H).json()["entries"] == []
    with open(server.SETTINGS.journal_file, "w") as f:
        f.write('{"action":"swap","n":1}\n{"action":"run_summary","n":2}\nnot json\n')
    e = client.get("/journal", headers=H).json()["entries"]
    assert [x["n"] for x in e] == [2, 1]
