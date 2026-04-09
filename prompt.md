# Polymarket Dashboard — Feature Spec

## Data sources

| Source | URL | Auth | What it gives us |
|--------|-----|------|------------------|
| Positions | `GET https://data-api.polymarket.com/positions?user={addr}` | None | Open positions with P&L, avg price, current price |
| Trades | `GET https://data-api.polymarket.com/trades?user={addr}` | None | Trade history with timestamps, sides, prices |
| Activity | `GET https://data-api.polymarket.com/activity?user={addr}` | None | On-chain events: trades, redeems, splits, merges |
| Portfolio value | `GET https://data-api.polymarket.com/value?user={addr}` | None | Total portfolio value |
| Spread | `GET https://clob.polymarket.com/spread?token_id={id}` | None | Current bid/ask spread per token |
| Midpoint | `GET https://clob.polymarket.com/midpoint?token_id={id}` | None | Current mid price per token |
| BTC live price | `wss://stream.binance.com:9443/ws/btcusdt@kline_1s` | None | Real-time BTC/USDT from Binance |
| Market data | `GET https://gamma-api.polymarket.com/markets?slug={slug}` | None | Market metadata, token IDs |

User provides: **Polygon wallet address only.** No private keys for the dashboard.


## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ TOPBAR: Logo | BTC: $97,241 ▲0.3% | 5min window: 02:34 left | Status: Live │
├───────────────────────────────────────┬─────────────────────────┤
│                                       │                         │
│  STATS ROW (6 cards):                 │  AGENT STATUS           │
│  Portfolio | Today P&L | All-time P&L │  Strategy: BTC Straddle │
│  Win Rate  | Trades    | Spread Cost  │  Last: Opened @ 20:14   │
│                                       │  Next: Waiting for <$0.38│
│  ─────────────────────────────────    │                         │
│                                       │  ACTIVITY FEED          │
│  P&L CHART (cumulative, SVG)          │  Agent messages +       │
│  Timeframe tabs: 1H | 24H | 7D | ALL │  on-chain activity      │
│                                       │  scrollable             │
│  ─────────────────────────────────    │                         │
│                                       │                         │
│  OPEN POSITIONS (cards grid)          │                         │
│  Market | Side | Entry | Current | PnL│                         │
│                                       │                         │
│  ─────────────────────────────────    │                         │
│                                       │                         │
│  RECENT TRADES (table)                │                         │
│  Time | Market | Side | Price | Result│                         │
│                                       │                         │
└───────────────────────────────────────┴─────────────────────────┘
```


## Features (what each section does)

### 1. BTC Live Price Ticker (topbar)
- Connect to Binance WebSocket for real-time BTC/USDT
- Show current price, 5min % change
- Reconnect automatically on disconnect
- Mini sparkline (last 60 data points) using SVG path

### 2. 5-Minute Market Window Timer (topbar)
- Calculate current window: `window_ts = now - (now % 300)`
- Show countdown to window close
- When window closes, auto-advance to next
- Color code: green (>3min left), yellow (1-3min), red (<1min)

### 3. Stats Row (6 cards)
- **Portfolio Value**: from `/value` endpoint
- **Today's P&L**: filter trades by today's date, sum profits/losses
- **All-time P&L**: sum of `cashPnl` across all positions
- **Win Rate (today)**: wins/losses from today's resolved positions
- **Trades Today**: count of trades with today's timestamp
- **Straddle Cost**: current combined cost of UP + DOWN tokens for active 5min market
  - Fetch spread for both tokens via CLOB API
  - If combined ask < $1.00, show in green (edge exists)
  - If combined ask >= $1.00, show in red (no edge)

### 4. P&L Chart
- SVG-based line chart, no external libraries
- X axis: time, Y axis: cumulative P&L in dollars
- Built from trade history data
- Tab switcher: 1H, 24H, 7D, ALL
- Animated gradient fill under the line
- Current value dot with pulse animation

### 5. Open Positions
- Grid of cards (2 columns)
- Each card shows: market title, outcome (Yes/No), shares held, avg entry price, current price, current value, unrealized P&L ($), unrealized P&L (%)
- Color the P&L: green for profit, red for loss
- Sorted by current value descending

### 6. Recent Trades
- Table with columns: Time, Market, Outcome, Side (BUY/SELL badge), Price, Size, Result (WON/LOST/OPEN badge), P&L
- Last 20 trades
- Color-coded badges

### 7. Agent Status Panel (right sidebar, top)
- Compact card showing:
  - Strategy name (e.g. "BTC 5min Straddle")
  - Current state (Monitoring / Entering / Holding / Cooldown)
  - Last action with timestamp
  - Next action / what it's waiting for
- Updated via `window.updateAgentStatus(status)` exposed on window

### 8. Activity Feed (right sidebar, bottom)
- Scrollable list of events
- Mix of on-chain activity (from API) and agent messages (pushed via JS)
- Each item: icon, type, description, timestamp
- Types: TRADE (green/red), REDEEM (gold), agent message (cyan)
- `window.addFeedItem(message, type)` for agent to push updates


## Exposed functions (for OpenClaw agent via canvas eval)

```javascript
// Push a message to the activity feed
window.addFeedItem(message: string, type: 'success'|'error'|'')

// Force refresh all data
window.refreshDashboard()

// Update wallet address
window.updateWallet(address: string, proxy?: string)

// Update agent status panel
window.updateAgentStatus({
  strategy: string,     // "BTC 5min Straddle"
  state: string,        // "Monitoring" | "Entering" | "Holding" | "Cooldown"
  lastAction: string,   // "Opened straddle @ $0.47/$0.51"
  lastActionTime: string, // "20:14:32"
  nextAction: string    // "Waiting for spread < $0.38"
})
```


## Auto-refresh intervals

| Data | Interval | Method |
|------|----------|--------|
| BTC price | Real-time | WebSocket |
| 5min countdown | Every second | `setInterval` |
| Positions | 30 seconds | Fetch |
| Trades | 30 seconds | Fetch |
| Activity | 60 seconds | Fetch |
| Portfolio value | 60 seconds | Fetch |
| Spread/straddle cost | 10 seconds | Fetch |


## What NOT to build

- No whale tracking or copy trading
- No leaderboard
- No orderbook depth visualization
- No AI chat interface (OpenClaw WebChat handles that)
- No multi-wallet support (one wallet per container)
- No authentication (container is already auth-gated by the OpenClaw gateway)
- No localStorage for critical data (container is ephemeral)