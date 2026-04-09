# Polymarket Account Connection — Reference

How this Go codebase (`polysnipe`) connects to a Polymarket account and what it does with it. Hand this to the agent rebuilding it in another system.

## Account model

Polymarket accounts are Polygon (chainId 137) smart wallets. A user has:

- **EOA**: an Ethereum private key (the signer). Derived address = `crypto.PubkeyToAddress(privKey.PublicKey)`.
- **Proxy wallet** (`POLY_PROXY`, sigType 1): the actual Polymarket "account" holding USDC.e and positions. Most users use this. Resolved from the EOA via Gamma: `GET https://gamma-api.polymarket.com/public-profile?address=<EOA>` → `proxyWallet`.
- **Funder**: wallet holding the USDC.e used to fund orders. Usually equal to the proxy wallet.
- Alternative: `SigTypeEOA=0` (direct EOA), `SigTypeGnosisSafe=2`.

### Required config / env
From `config/config.go`:
- `PRIVATE_KEY_HEX` — raw hex (with or without `0x`)
- `PROXY_WALLET_ADDRESS` — 0x-prefixed
- `FUNDER_ADDRESS` — defaults to proxy wallet
- `POLY_SIG_TYPE` — default `1` (POLY_PROXY)

These are the only credentials the user supplies. API keys are derived, not entered.

## Authentication: two levels

Polymarket's CLOB (https://clob.polymarket.com) uses a two-tier auth, mirroring `py_clob_client`.

### L1 — EIP-712 wallet signature (one-time, to bootstrap API keys)
Implemented in `polymarket/derive_creds.go` (`GenerateAPICreds`).

1. Build an EIP-712 message in the `ClobAuth` domain:
   - Domain: `EIP712Domain(string name,string version,uint256 chainId)` with `name="ClobAuthDomain"`, `version="1"`, `chainId=137`.
   - Struct: `ClobAuth(address address,string timestamp,uint256 nonce,string message)` where `message="This message attests that I control the given wallet"`, `nonce=0`, `timestamp=unix seconds`.
2. Sign the final `keccak256(0x19 0x01 || domainSeparator || structHash)` with the EOA key. Bump `v` by 27.
3. Send L1 headers (EOA address — never the proxy — for L1):
   - `POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_NONCE`
4. Call `POST https://clob.polymarket.com/auth/api-key` to create, or fall back to `GET /auth/derive-api-key` if a key already exists.
5. Response yields `{apiKey, secret, passphrase}` — these are the L2 credentials, cached for reuse.

### L2 — HMAC API-key signature (per request)
Implemented in `polymarket/auth.go` (`L2Credentials.SignRequest`).

For every authenticated REST call:
- `msg = timestamp + METHOD + path + body` (path only — NO query string; matches official SDKs)
- `signature = base64url(HMAC_SHA256(base64url_decode(secret), msg))`
- Headers:
  - `POLY_ADDRESS` = **proxy wallet** address (for sigType 1)
  - `POLY_SIGNATURE` = HMAC above
  - `POLY_TIMESTAMP` = unix seconds
  - `POLY_API_KEY`
  - `POLY_PASSPHRASE`

## What the bot does with the account

### REST (`polymarket/*.go`, base `https://clob.polymarket.com`)
- `GET /auth/api-keys` — discover the API-key owner UUID (needed for order payload).
- `GET /balance-allowance` — fetch collateral & conditional token balance/allowance. Can request `COLLATERAL` or `CONDITIONAL` (per-tokenID) asset types.
- `POST /balance-allowance/update` — trigger on-chain approval so the CLOB exchange contract can move USDC / conditional tokens. Code polls until allowance becomes non-empty before trading.
- `POST /order` — submit signed orders. Order types: `GTC`, `GTD`, `FOK` (market), `FAK` (partial market). Sizes rounded per tick-size table (`0.1`→size2/amount3, `0.01`→2/4, `0.001`→2/5, `0.0001`→2/6). Signing uses `github.com/polymarket/go-order-utils` (`orderbuilder`) to build the EIP-712 order, signed with the EOA private key. Minimum limit-order size = 5 shares.
- Market / resolution / price endpoints for sniping logic.

### USDC balance check (on-chain, bypasses CLOB)
`polymarket/balance.go` calls Polygon RPC `eth_call` against USDC.e (`0x2791bca1f2de4661ed88a30c99a7a9449aa84174`) using selector `balanceOf(address)` (`0x70a08231`), rotating over public RPCs (`polygon-rpc.com`, `ankr`, `publicnode`). Returns float USDC for the proxy/funder.

### WebSocket — RTDS market data
`polymarket/rtds.go` connects to Polymarket's Real-Time Data Service for live orderbook / price-change / trade feeds. Public feed, no auth required beyond subscribing to `asset_ids`.

### Other data sources referenced (not Polymarket auth, but used alongside)
- `brti.go`, `chainlink.go`, `chainlink_rpc.go`, `cryptoprice.go` — reference prices for the strategy, not account access.

## Minimum viable port checklist

To replicate account connectivity in another system, an agent needs:

1. **Key handling**: load `PRIVATE_KEY_HEX`, derive EOA via secp256k1. Never log it.
2. **Proxy lookup**: `GET gamma-api.polymarket.com/public-profile?address=<eoa>` → `proxyWallet`.
3. **L1 EIP-712 signer** for `ClobAuthDomain` exactly as above (chainId 137, nonce 0, fixed message string). Test vectors: hash must match `py_clob_client`.
4. **API-key bootstrap**: `POST /auth/api-key`; on non-200, `GET /auth/derive-api-key`. Cache `{apiKey, secret, passphrase}` to disk/secret store.
5. **L2 HMAC signer**: base64url-decode the secret → HMAC-SHA256 over `ts+METHOD+path+body` → base64url-encode. Sign path only, never query.
6. **Header assembly**: L1 uses EOA address; L2 uses proxy wallet address as `POLY_ADDRESS`.
7. **Balance / allowance**: call `/balance-allowance` and trigger `/balance-allowance/update` before first trade; poll until confirmed (code uses ~1s interval).
8. **Order builder**: use `@polymarket/order-utils` (JS) or `go-order-utils` (Go) or the Python SDK's equivalent — do NOT hand-roll the order EIP-712, the struct is non-trivial (fee rate bps, tick-size rounding, signature type byte). Minimum 5 shares for GTC/GTD.
9. **Optional**: on-chain USDC.e balance via Polygon RPC `eth_call` for a trust-but-verify check against CLOB-reported balance.
10. **RTDS WS** for live book data if the strategy needs it.

## Endpoints summary
| Purpose | Method | URL |
|---|---|---|
| Resolve proxy wallet | GET | `https://gamma-api.polymarket.com/public-profile?address=<eoa>` |
| Create API key | POST | `https://clob.polymarket.com/auth/api-key` |
| Derive existing API key | GET | `https://clob.polymarket.com/auth/derive-api-key` |
| List API keys | GET | `https://clob.polymarket.com/auth/api-keys` |
| Balance & allowance | GET | `https://clob.polymarket.com/balance-allowance` |
| Update allowance | POST | `https://clob.polymarket.com/balance-allowance/update` |
| Place order | POST | `https://clob.polymarket.com/order` |
| USDC.e on-chain | JSON-RPC | `https://polygon-rpc.com` (+ fallbacks) |

## Relevant files to port
- `polymarket/derive_creds.go` — L1 EIP-712 + api-key bootstrap
- `polymarket/auth.go` — L2 HMAC signer
- `polymarket/api_keys.go` — list keys
- `polymarket/balance.go` — on-chain USDC.e
- `polymarket/balance_allowance.go` — CLOB balance/allowance + approval polling
- `polymarket/orders.go` — order builder, signing, submission
- `polymarket/rtds.go` — WebSocket market data
- `config/config.go` (env loading) — the 4 vars listed above
