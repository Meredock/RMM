"""CLI for local use / setup (the dashboard uses server.py instead).

  python main.py newwallet       # generate a fresh testnet key
  python main.py status          # balances + risk budget
  python main.py wrap 0.01       # wrap testnet ETH into WETH
  python main.py run             # one agent run using settings.json
"""
import argparse
import json
import os

from config import SETTINGS


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("newwallet"); sub.add_parser("status"); sub.add_parser("run")
    wp = sub.add_parser("wrap"); wp.add_argument("amount", type=float)
    a = p.parse_args()

    if a.cmd == "newwallet":
        from eth_account import Account
        acct = Account.create()
        print(f"Address:     {acct.address}\nPrivate key: 0x{acct.key.hex().removeprefix('0x')}\n"
              "Put the key in .env as TRADER_PRIVATE_KEY. Testnet only — never fund this with real money.")
        return

    from agent import Agent
    from chain import Chain
    from risk import RiskGuard
    from settings_store import SettingsStore

    os.makedirs(SETTINGS.data_dir, exist_ok=True)
    store = SettingsStore(SETTINGS.settings_file, SETTINGS.allow_live)
    guard = RiskGuard(store.limits(), SETTINGS.state_file, SETTINGS.kill_switch_file)
    chain = Chain(SETTINGS.rpc_url, SETTINGS.private_key)
    print(f"Wallet {chain.address}")

    if a.cmd == "status":
        print(json.dumps({"balances": chain.balances(), "risk": guard.status(), "settings": store.get()}, indent=2))
    elif a.cmd == "wrap":
        print("tx:", chain.wrap_eth(a.amount))
    elif a.cmd == "run":
        s = store.get()
        Agent(chain, guard, strategy=s["strategy"], dry_run=s["dry_run"]).run_once()


if __name__ == "__main__":
    main()
