"""On-chain layer: balances, Uniswap V3 quotes and swaps on Base Sepolia."""
from decimal import Decimal

from web3 import Web3

from config import BASE_SEPOLIA_CHAIN_ID, POOL_FEE, QUOTER_V2, SWAP_ROUTER_02, TOKENS

ERC20_ABI = [
    {"name": "symbol", "type": "function", "inputs": [], "outputs": [{"type": "string"}], "stateMutability": "view"},
    {"name": "balanceOf", "type": "function", "inputs": [{"type": "address"}], "outputs": [{"type": "uint256"}], "stateMutability": "view"},
    {"name": "allowance", "type": "function", "inputs": [{"type": "address"}, {"type": "address"}], "outputs": [{"type": "uint256"}], "stateMutability": "view"},
    {"name": "approve", "type": "function", "inputs": [{"type": "address"}, {"type": "uint256"}], "outputs": [{"type": "bool"}], "stateMutability": "nonpayable"},
]
WETH_ABI = ERC20_ABI + [
    {"name": "deposit", "type": "function", "inputs": [], "outputs": [], "stateMutability": "payable"},
]
QUOTER_ABI = [{
    "name": "quoteExactInputSingle", "type": "function", "stateMutability": "nonpayable",
    "inputs": [{"type": "tuple", "components": [
        {"name": "tokenIn", "type": "address"}, {"name": "tokenOut", "type": "address"},
        {"name": "amountIn", "type": "uint256"}, {"name": "fee", "type": "uint24"},
        {"name": "sqrtPriceLimitX96", "type": "uint160"}]}],
    "outputs": [{"name": "amountOut", "type": "uint256"}, {"name": "sqrtPriceX96After", "type": "uint160"},
                {"name": "initializedTicksCrossed", "type": "uint32"}, {"name": "gasEstimate", "type": "uint256"}],
}]
ROUTER_ABI = [{
    "name": "exactInputSingle", "type": "function", "stateMutability": "payable",
    "inputs": [{"type": "tuple", "components": [
        {"name": "tokenIn", "type": "address"}, {"name": "tokenOut", "type": "address"},
        {"name": "fee", "type": "uint24"}, {"name": "recipient", "type": "address"},
        {"name": "amountIn", "type": "uint256"}, {"name": "amountOutMinimum", "type": "uint256"},
        {"name": "sqrtPriceLimitX96", "type": "uint160"}]}],
    "outputs": [{"name": "amountOut", "type": "uint256"}],
}]


def to_raw(sym, amount):
    return int(Decimal(str(amount)) * (10 ** TOKENS[sym]["decimals"]))


def from_raw(sym, raw):
    return float(Decimal(raw) / (10 ** TOKENS[sym]["decimals"]))


class Chain:
    def __init__(self, rpc_url: str, private_key: str):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 30}))
        chain_id = self.w3.eth.chain_id
        if chain_id != BASE_SEPOLIA_CHAIN_ID:
            raise SystemExit(f"Refusing to run: RPC is chain {chain_id}, expected Base Sepolia ({BASE_SEPOLIA_CHAIN_ID}).")
        if not private_key:
            raise SystemExit("PRIVATE_KEY not set (use a fresh testnet-only wallet).")
        self.account = self.w3.eth.account.from_key(private_key)
        self.address = self.account.address
        self.tokens = {s: self.w3.eth.contract(Web3.to_checksum_address(t["address"]),
                                               abi=WETH_ABI if s == "WETH" else ERC20_ABI)
                       for s, t in TOKENS.items()}
        for sym, c in self.tokens.items():
            onchain = c.functions.symbol().call()
            if onchain != sym:
                raise SystemExit(f"Token check failed: expected {sym}, contract says {onchain}")
        self.quoter = self.w3.eth.contract(Web3.to_checksum_address(QUOTER_V2), abi=QUOTER_ABI)
        self.router = self.w3.eth.contract(Web3.to_checksum_address(SWAP_ROUTER_02), abi=ROUTER_ABI)

    # ---- reads -------------------------------------------------------------
    def balances(self):
        out = {"ETH": float(Web3.from_wei(self.w3.eth.get_balance(self.address), "ether"))}
        for sym, c in self.tokens.items():
            out[sym] = from_raw(sym, c.functions.balanceOf(self.address).call())
        return out

    def quote(self, token_in, token_out, amount_in):
        raw_in = to_raw(token_in, amount_in)
        res = self.quoter.functions.quoteExactInputSingle((
            self.tokens[token_in].address, self.tokens[token_out].address, raw_in, POOL_FEE, 0
        )).call()
        return from_raw(token_out, res[0])

    # ---- writes ------------------------------------------------------------
    def _send(self, fn, value=0):
        tx = fn.build_transaction({
            "from": self.address, "value": value,
            "nonce": self.w3.eth.get_transaction_count(self.address),
            "chainId": BASE_SEPOLIA_CHAIN_ID,
        })
        signed = self.account.sign_transaction(tx)
        h = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        rcpt = self.w3.eth.wait_for_transaction_receipt(h, timeout=120)
        if rcpt.status != 1:
            raise RuntimeError(f"tx reverted: {h.hex()}")
        return h.hex()

    def wrap_eth(self, amount_eth):
        return self._send(self.tokens["WETH"].functions.deposit(), value=Web3.to_wei(amount_eth, "ether"))

    def swap(self, token_in, token_out, amount_in, min_out):
        raw_in = to_raw(token_in, amount_in)
        tin = self.tokens[token_in]
        # approve exactly what's needed for this swap (no unlimited approvals)
        if tin.functions.allowance(self.address, self.router.address).call() < raw_in:
            self._send(tin.functions.approve(self.router.address, raw_in))
        return self._send(self.router.functions.exactInputSingle((
            tin.address, self.tokens[token_out].address, POOL_FEE, self.address,
            raw_in, to_raw(token_out, min_out), 0,
        )))
