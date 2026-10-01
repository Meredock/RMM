import json
import os
import tempfile

import pytest

from config import HARD_CAPS
from settings_store import SettingsError, SettingsStore


def store(d, live=False):
    return SettingsStore(os.path.join(d, "settings.json"), allow_live=live)


def test_defaults_and_update():
    with tempfile.TemporaryDirectory() as d:
        s = store(d)
        assert s.get()["dry_run"] is True
        s.update({"max_trade_usd": 10, "strategy": "  hold  "})
        assert s.get()["max_trade_usd"] == 10 and s.get()["strategy"] == "hold"
        assert s.limits().max_trade_usd == 10


def test_rejects_above_hard_cap_and_bad_types():
    with tempfile.TemporaryDirectory() as d:
        s = store(d)
        for bad in ({"max_trade_usd": HARD_CAPS["max_trade_usd"] + 1}, {"max_trade_usd": -1},
                    {"max_trade_usd": "5"}, {"max_trade_usd": True}, {"nope": 1},
                    {"min_minutes_between_trades": 1}, {"interval_minutes": 1}, {"strategy": ""}):
            with pytest.raises(SettingsError):
                s.update(bad)


def test_live_trading_locked_unless_env_allows():
    with tempfile.TemporaryDirectory() as d:
        with pytest.raises(SettingsError):
            store(d).update({"dry_run": False})
        assert store(d, live=True).update({"dry_run": False})["dry_run"] is False
        # file says live, but env lock wins
        assert store(d, live=False).get()["dry_run"] is True


def test_hand_edited_file_is_clamped():
    with tempfile.TemporaryDirectory() as d:
        with open(os.path.join(d, "settings.json"), "w") as f:
            json.dump({"max_trade_usd": 1e9, "min_minutes_between_trades": 0}, f)
        lim = store(d).limits()
        assert lim.max_trade_usd == HARD_CAPS["max_trade_usd"]
        assert lim.min_minutes_between_trades >= 5
