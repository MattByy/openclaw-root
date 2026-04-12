# Polymarket Connection Modal — Redesign Prompt

## Context

We have a Polymarket HUD dashboard (`dashboards/polymarket/index.html`) — a single-file HTML app with a dark cyber aesthetic (Orbitron + JetBrains Mono fonts, cyan `#00e5ff` accent, dark backgrounds `#04060b` / `#07090f`). It currently has a "Connect Polymarket" modal that dumps all fields at once (private key, proxy wallet, funder, API key, secret, passphrase) regardless of what the user actually wants to do. This is confusing and intimidating.

We need to redesign this modal into a **progressive, step-based connection flow** that adapts based on what the user wants to do and what type of Polymarket wallet they have.

---

## What Needs to Change

### Current State (bad)
The modal shows everything at once:
- Private Key field
- Proxy Wallet field
- Funder field
- API Key / Secret / Passphrase fields
- A single "Connect" button
- Hardcoded to `SIGTYPE 1 (PROXY)` in the header

The user has no idea what they need to fill in, what's optional, or what any of this means.

### Target State (good)
A **multi-step wizard** inside the same modal that:
1. Asks what the user wants to do (their intent)
2. Collects only the credentials needed for that intent
3. Auto-detects their wallet type when possible
4. Validates and connects

---

## Step-by-Step Flow Design

### Step 1: Choose Your Mode

Show 3 clickable cards/options:

| Mode | Icon | Description | What it unlocks |
|------|------|-------------|-----------------|
| **Watch Only** | 👁 (eye icon) | "Track any Polymarket wallet — positions, P&L, history. No keys needed." | Portfolio tracking, position monitoring, trade history |
| **Read + API** | 🔑 (key icon) | "Connect your CLOB API credentials to read your private data (orders, fills). No trading." | Everything above + order book access, personal order history, fills |
| **Full Trading** | ⚡ (bolt icon) | "Place and manage orders programmatically. Requires your private key." | Everything above + place/cancel orders, execute trades |

**Behavior:**
- Clicking a card advances to Step 2
- The selected mode determines which fields appear in the next steps
- Show a subtle "You can upgrade your connection mode later" note

---

### Step 2: Credentials (adapts based on mode)

#### If "Watch Only" selected:
Show a single field:
```
POLYMARKET WALLET ADDRESS
[0x... paste the address you want to track]
Helper text: "Find this on any Polymarket profile page or in your account settings"
```
That's it. One field. Hit Connect → done. We use the Gamma API (no auth needed) + Data API to pull public position data for that address.

#### If "Read + API" selected:
Show the CLOB API credentials section:
```
API KEY
[Polymarket CLOB API key]

API SECRET                    API PASSPHRASE
[base64url secret]            [passphrase]
```
With a helper note:
> "Don't have these? You can generate them from your private key. [Switch to Full Trading mode] to auto-derive them."

Also ask for their wallet address (for the funder/trading address):
```
TRADING ADDRESS
[0x... your Polymarket profile address]
Helper text: "This is the address shown on polymarket.com — NOT necessarily your MetaMask address"
```

#### If "Full Trading" selected:
Show a **two-part progressive form**:

**Part A — Private Key**
```
PRIVATE KEY
[Paste your 0x... Polygon EOA private key]
Helper text: "64 hex chars. Go to Polymarket → Cash → ⋯ → Export Private Key"
```

As soon as the user pastes a valid private key (64 hex chars, with or without 0x prefix), **automatically run wallet type detection** (see Detection Logic below) and show the result:

**Part B — Auto-detected Configuration** (appears after key is pasted)

Show a status card:
```
✓ WALLET DETECTED
  Type: EOA (Signature Type 0)
  Signing Address: 0xAbC1...
  Funder Address: 0xAbC1... (same as signing — no proxy)
  
  [API credentials will be auto-derived on connect]
```

OR for proxy/Safe users:
```
✓ WALLET DETECTED
  Type: Magic/Email Proxy (Signature Type 1)
  Signing Address (EOA): 0xAbC1...
  Proxy Wallet (Funder): 0xDeF2...
  
  [API credentials will be auto-derived on connect]
```

OR for Safe users:
```
✓ WALLET DETECTED
  Type: Browser Wallet Safe (Signature Type 2)
  Signing Address (EOA): 0xAbC1...
  Safe Wallet (Funder): 0x7890...
  
  [API credentials will be auto-derived on connect]
```

If detection fails or the user wants to override, show a collapsible "Advanced: Override detected settings" section with manual fields for:
- Signature Type dropdown (0 = EOA, 1 = Magic Proxy, 2 = Gnosis Safe)
- Funder Address (manual override)
- API Key / Secret / Passphrase (manual override, if they already have these)

---

### Step 3: Connect & Validate

Show a "Connect" button that:
1. For **Watch Only**: validates the address format, pings the Gamma API for that address, shows positions if found
2. For **Read + API**: validates API creds by calling the CLOB API's health/auth endpoint, shows connection status
3. For **Full Trading**: 
   - Derives API credentials from the private key using `ethers.js` + EIP-712 signing
   - Tests the connection
   - Checks token allowances (warns if USDC/CTF approvals not set for EOA users)
   - Shows final connection status with balance

**On success**, show:
```
✓ CONNECTED — [mode name]
  Address: 0x...
  USDC Balance: $XXX.XX
  Open Positions: N
```

**On failure**, show specific error messages:
- "$0 balance? Your funder address might be wrong. The funder should be the address shown on your Polymarket profile, not your MetaMask address."
- "API credentials invalid. Try re-deriving them or switch to Full Trading mode to auto-generate."
- "Allowances not set. You need to approve the Exchange contract before trading. [Make a small trade on polymarket.com first] or [Set allowances programmatically]."

---

## Wallet Type Auto-Detection Logic

When the user pastes a private key, derive the EOA address using ethers.js, then check two smart contract factories on Polygon to determine the wallet type:

```javascript
import { ethers } from 'ethers';

const POLYGON_RPC = 'https://polygon-rpc.com'; // or our own RPC
const provider = new ethers.JsonRpcProvider(POLYGON_RPC);

// Factory contract addresses on Polygon
const PROXY_FACTORY = '0xaB45c5A4B0c941a2F231C04C3f49182e1A254052';
const SAFE_FACTORY = '0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b';

// Init code hashes (from Polymarket's contracts — verify these from their SDK source)
const PROXY_INIT_CODE_HASH = '...'; // Get from @polymarket/clob-client source or magic-proxy-builder-example
const SAFE_INIT_CODE_HASH = '...';  // Get from builder-relayer-client derive.ts

async function detectWalletType(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  const eoaAddress = wallet.address;
  
  // 1. Derive the Proxy Wallet address (Type 1 — Magic/Email)
  const proxySalt = ethers.keccak256(ethers.solidityPacked(['address'], [eoaAddress]));
  const proxyAddress = ethers.getCreate2Address(PROXY_FACTORY, proxySalt, PROXY_INIT_CODE_HASH);
  
  // 2. Derive the Safe Wallet address (Type 2 — Browser wallet)
  const safeSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address'], [eoaAddress]));
  const safeAddress = ethers.getCreate2Address(SAFE_FACTORY, safeSalt, SAFE_INIT_CODE_HASH);
  
  // 3. Check which one has deployed code
  const [proxyCode, safeCode] = await Promise.all([
    provider.getCode(proxyAddress),
    provider.getCode(safeAddress),
  ]);
  
  if (proxyCode !== '0x') {
    return {
      signatureType: 1,
      label: 'Magic/Email Proxy',
      signingAddress: eoaAddress,
      funderAddress: proxyAddress,
    };
  }
  
  if (safeCode !== '0x') {
    return {
      signatureType: 2,
      label: 'Browser Wallet (Gnosis Safe)',
      signingAddress: eoaAddress,
      funderAddress: safeAddress,
    };
  }
  
  // Neither proxy exists — pure EOA
  return {
    signatureType: 0,
    label: 'EOA (Direct Wallet)',
    signingAddress: eoaAddress,
    funderAddress: eoaAddress, // same address
  };
}
```

**Important notes for implementation:**
- The `PROXY_INIT_CODE_HASH` and `SAFE_INIT_CODE_HASH` values need to be extracted from Polymarket's SDK source code. Check:
  - `@polymarket/clob-client` → look for CREATE2 derivation constants
  - `@polymarket/builder-relayer-client` → `src/builder/derive.ts` has `deriveSafe()`
  - The `magic-proxy-builder-example` repo on GitHub has `deriveProxyAddress()` with the exact constants
- The RPC call (`provider.getCode()`) hits Polygon mainnet — use a reliable RPC (Alchemy, QuickNode, or our Hetzner node if we have one)
- Cache the detection result in localStorage alongside the credentials so we don't re-check on every page load

---

## API Credential Derivation (Full Trading Mode)

When auto-deriving CLOB API credentials from the private key:

```javascript
// Using the py-clob-client pattern, but in JS:
// The CLOB client signs an EIP-712 typed message to derive/create API keys

const CLOB_HOST = 'https://clob.polymarket.com';

async function deriveApiCredentials(privateKey) {
  const wallet = new ethers.Wallet(privateKey);
  
  // 1. Get server timestamp and nonce
  const timeRes = await fetch(`${CLOB_HOST}/time`);
  const { timestamp } = await timeRes.json();
  const nonce = 0; // First derivation uses nonce 0
  
  // 2. Sign EIP-712 message
  const domain = {
    name: 'ClobAuthDomain',
    version: '1',
    chainId: 137,
  };
  const types = {
    ClobAuth: [
      { name: 'address', type: 'address' },
      { name: 'timestamp', type: 'string' },
      { name: 'nonce', type: 'uint256' },
      { name: 'message', type: 'string' },
    ],
  };
  const value = {
    address: wallet.address,
    timestamp: timestamp.toString(),
    nonce: nonce,
    message: 'This message attests that I control the given wallet',
  };
  
  const signature = await wallet.signTypedData(domain, types, value);
  
  // 3. Call derive endpoint
  const deriveRes = await fetch(`${CLOB_HOST}/auth/derive-api-key`, {
    method: 'GET',
    headers: {
      'POLY_ADDRESS': wallet.address,
      'POLY_SIGNATURE': signature,
      'POLY_TIMESTAMP': timestamp.toString(),
      'POLY_NONCE': nonce.toString(),
    },
  });
  
  if (!deriveRes.ok) {
    // If derive fails, try create
    const createRes = await fetch(`${CLOB_HOST}/auth/api-key`, {
      method: 'POST',
      headers: {
        'POLY_ADDRESS': wallet.address,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp.toString(),
        'POLY_NONCE': nonce.toString(),
      },
    });
    return await createRes.json(); // { apiKey, secret, passphrase }
  }
  
  return await deriveRes.json(); // { apiKey, secret, passphrase }
}
```

**Note:** The exact header names and endpoint paths should be verified against the current Polymarket CLOB API docs. The pattern above is based on the `py-clob-client` and `@polymarket/clob-client` SDK source code. If the JS SDK (`@polymarket/clob-client`) is importable via CDN, prefer using `ClobClient.createOrDeriveApiKey()` directly instead of reimplementing.

---

## Data Storage

All credentials are stored in `localStorage` under a namespaced key:

```javascript
const STORAGE_KEY = 'polymarket_connection';

// Structure:
{
  mode: 'watch' | 'read' | 'trade',
  address: '0x...',           // The wallet address being tracked/used
  signatureType: 0 | 1 | 2,  // Only for 'trade' mode
  funderAddress: '0x...',     // Only for 'trade' mode (may differ from signing address)
  apiKey: '...',              // Only for 'read' and 'trade' modes
  apiSecret: '...',           // Only for 'read' and 'trade' modes
  apiPassphrase: '...',       // Only for 'read' and 'trade' modes
  privateKey: '...',          // Only for 'trade' mode — ENCRYPTED or stored carefully
  connectedAt: '2026-04-12T...',
}
```

**Security notes:**
- Private keys in localStorage are a known risk. Display a warning: "Use a burner EOA funded just for Polymarket trading. Never paste your main wallet's key."
- Consider encrypting the private key with a user-provided PIN/password before storing
- Only `clob.polymarket.com` and `gamma-api.polymarket.com` should ever receive these values

---

## UI/UX Specs

### Keep the existing design system:
- Dark background: `--bg0: #04060b`, `--bg1: #07090f`, `--bg2: #0a0d14`
- Accent: `--accent: #00e5ff` (cyan)
- Fonts: Orbitron (headings), JetBrains Mono (code/values), Outfit (body text)
- Panel borders: `rgba(0, 229, 255, 0.18)`
- Input fields: dark backgrounds with subtle cyan borders on focus

### Step indicator:
Show a minimal step progress at the top of the modal:
```
[1 ● ──── 2 ○ ──── 3 ○]  or  [MODE → CREDENTIALS → CONNECT]
```

### Transitions:
- Steps slide left/right with a subtle CSS transition (200-300ms)
- Show a back arrow/button to return to previous step
- The modal should not change size dramatically between steps — keep a consistent height or animate smoothly

### Mode cards (Step 1):
- Each card has a subtle border that glows cyan on hover
- Selected card gets a solid cyan border + checkmark
- Cards are stacked vertically on mobile, horizontal on wider screens

### Detected wallet card (Step 2, Full Trading):
- Show as a success-styled card with a green/cyan checkmark icon
- Animate in after detection completes (show a brief loading spinner while checking Polygon)
- If detection takes >3 seconds, show "Checking wallet type on Polygon..."

---

## Files to Modify

- `dashboards/polymarket/index.html` — The main file. The connection modal HTML/CSS/JS is all inline in this file.
- `dashboards/polymarket/connection.md` — Reference doc for connection logic (update to match new flow)
- Potentially create a `connection.js` module if the logic gets too large for inline `<script>` tags

---

## Edge Cases to Handle

1. **User pastes a private key that has never traded on Polymarket** — No proxy/Safe will exist. Detect as EOA (type 0), but warn: "This wallet hasn't traded on Polymarket yet. You may need to set token allowances before placing orders."

2. **User pastes API credentials that don't match their private key** — If both private key and manual API creds are provided, validate that the API key belongs to the same wallet. If mismatch, warn.

3. **User switches modes after connecting** — Allow upgrading (Watch → Read → Trade) without disconnecting. Downgrading should prompt confirmation since it removes stored credentials.

4. **Invalid private key format** — Validate immediately on paste: must be 64 hex characters (with or without `0x` prefix). Show inline error: "Invalid key format — expected 64 hex characters."

5. **RPC failures during detection** — If the Polygon RPC call fails, fall back to showing the manual signature type selector instead of auto-detection. Show: "Couldn't auto-detect wallet type. Please select manually."

6. **User already connected** — When reopening the modal, show current connection status with an option to reconnect, change mode, or disconnect.

---

## Summary of the Three Modes

| | Watch Only | Read + API | Full Trading |
|---|---|---|---|
| **User provides** | Wallet address | API Key + Secret + Passphrase + Trading address | Private key (everything else auto-derived) |
| **APIs used** | Gamma (public) + Data API | Gamma + CLOB (authenticated read) + Data | Gamma + CLOB (full) + Data |
| **Can see positions** | ✓ | ✓ | ✓ |
| **Can see order book** | ✓ (public) | ✓ (personal orders) | ✓ (personal orders) |
| **Can place orders** | ✗ | ✗ | ✓ |
| **Can cancel orders** | ✗ | ✗ | ✓ |
| **Needs private key** | ✗ | ✗ | ✓ |
| **Security risk** | None | Low (API creds only) | Medium (private key stored) |