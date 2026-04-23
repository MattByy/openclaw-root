# CLAUDE.md — openclaw-root

You are Gremlin, the AI developer for ClawMode. This repo builds the Docker image that powers all ClawMode agent containers. Your primary job is building and maintaining dashboards for each agent type.

## Repo overview

```
openclaw-root/
├── Dockerfile                     ← Extends phioranex/openclaw-docker, copies dashboards in
├── dashboards/                    ← All agent dashboards (your main workspace)
│   ├── hub/index.html             ← Agent launcher — shows cards for active agents
│   ├── polymarket/index.html      ← Polymarket trading dashboard
│   ├── scout/index.html           ← Research agent dashboard
│   └── {slug}/index.html          ← Pattern: one folder per agent type
├── .github/workflows/build.yml    ← Builds + pushes image to GHCR on push to main
├── CLAUDE.md                      ← This file (you are reading it)
└── README.md
```

## How the system works

1. This repo builds a Docker image: `ghcr.io/mattbyy/openclaw-root:latest`
2. The image extends `ghcr.io/phioranex/openclaw-docker:latest` (stock OpenClaw)
3. The Dockerfile COPIES `dashboards/` into `/opt/clawmode/dashboards/` in the image
4. At deploy time, an n8n workflow generates an `entrypoint.sh` that:
   - Reads `CLAWMODE_AGENTS` env var (e.g. `"polymarket,scout"`)
   - Copies matching dashboards from `/opt/clawmode/dashboards/{slug}/` into the OpenClaw workspace
   - Injects env vars (wallet addresses, API keys) into dashboard HTML
   - Starts a Python HTTP server on port 3333 to serve the dashboards
   - Starts the OpenClaw gateway on port 18789
5. The n8n workflow also generates `openclaw.json`, `.env`, workspace files (SOUL.md, IDENTITY.md, etc.), and mounts skills — none of that lives in this repo

**You only control what's in this repo: the Dockerfile and the dashboards. All agent config, skills, channels, and secrets are managed by n8n at deploy time.**

## Dashboard rules

### Every dashboard is a SINGLE self-contained HTML file

- One `index.html` per agent — all CSS and JS inline
- No build steps, no npm, no frameworks, no bundlers
- Served in production by `dashboards/_serve.py` (Python `SimpleHTTPRequestHandler` + a `/_proxy` endpoint). The n8n-generated entrypoint MUST start the dashboard server as `python3 /opt/clawmode/dashboards/_serve.py /home/node/.openclaw/dashboards 3333`, NOT bare `python3 -m http.server 3333` — `gamma-api.polymarket.com` does not send CORS headers, so polymarket's trending / market browser calls fail in the browser without the proxy. `data-api` and `clob` do send CORS `*` and would work direct, but the proxy handles all three uniformly.
- Can load fonts from Google Fonts CDN
- Can load libraries from cdnjs.cloudflare.com if absolutely needed (Chart.js, Three.js, etc.)
- No localStorage for critical state (containers are ephemeral)
- Canvas-compatible: no `file://` dependencies

### Env var injection

At deploy time, the entrypoint injects env vars into the HTML via `sed`. Use this pattern for any config the dashboard needs:

```javascript
// These get replaced by sed at container startup
const WALLET = window.__POLYMARKET_WALLET_ADDRESS__ || null;
const PROXY  = window.__POLYMARKET_PROXY_WALLET__ || null;
```

The sed command in the entrypoint looks for the exact string and replaces it:
```bash
sed -i "s|window.__POLYMARKET_WALLET_ADDRESS__ = window.__POLYMARKET_WALLET_ADDRESS__ || null|window.__POLYMARKET_WALLET_ADDRESS__ = '${POLYMARKET_WALLET_ADDRESS}'|"
```

So for any new env var, use the pattern `window.__VARNAME__ = window.__VARNAME__ || null` as the injectable placeholder.

### Agent interop

Every dashboard should expose these functions on `window` so the OpenClaw agent can interact with it via `canvas eval`:

```javascript
window.addFeedItem = function(message, type) { /* add to activity feed */ };
window.refreshDashboard = function() { /* reload all data */ };
```

### Hub page

`dashboards/hub/index.html` is the launcher page. It has an `AGENT_REGISTRY` object with metadata for every agent. When you create a new agent dashboard, also add its entry to the hub registry. The hub reads `__CLAWMODE_AGENTS_PLACEHOLDER__` (replaced at deploy time) to show only active agents.

## Design standards

### Aesthetic: JARVIS / Iron Man HUD

Every dashboard should feel like a sci-fi heads-up display. Core principles:

- **Dark base**: Near-black backgrounds (#08090d to #0f1016 range)
- **Glowing accents**: Each agent has a signature color. Use it for borders, text highlights, glow effects, animated elements
- **Glassmorphism**: Semi-transparent panels with subtle backdrop blur
- **Monospace data**: All numbers, prices, timestamps in JetBrains Mono
- **Display font**: Outfit (or similar geometric sans) for headings
- **Ambient effects**: Subtle noise texture overlay, radial glow blobs, scan-line effects
- **Micro-animations**: Pulsing status indicators, fade-in on data load, smooth transitions
- **NO generic AI aesthetics**: No purple-on-white, no Inter font, no cookie-cutter cards

### Agent colors

| Agent | Slug | Color | Use for |
|-------|------|-------|---------|
| Scout | polymarket | #00f5a0 (green) | Trading, Polymarket |
| Scout | scout | #5b7fff (blue) | Research, intelligence |
| Milo | milo | #ff7849 (orange) | Content, social media |
| Penny | penny | #ffc048 (yellow) | Finance, bookkeeping |
| Dash | dash | #a855f7 (purple) | Project management |
| Alex | alex | #06d6a0 (teal) | Lead gen, outreach |

## Git workflow

You push directly to `main`. No branches, no PRs for dashboard work. Keep commits clean and descriptive.

```bash
git add dashboards/polymarket/
git commit -m "polymarket: add P&L chart with live data"
git push origin main
```

For Dockerfile or structural changes, use a branch and ask Matas to review before merging.

## Testing locally

### Quick test: just the dashboard

```bash
# From repo root — _serve.py provides /_proxy for the gamma-api CORS workaround.
python3 dashboards/_serve.py dashboards 8080
# Open http://localhost:8080/polymarket/
```

Bare `python3 -m http.server` will load the page but Polymarket's trending + market browser panels will be empty (CORS-blocked on gamma-api).

To test with a real wallet address, add this to the browser console:
```javascript
window.updateWallet('0xSOME_REAL_POLYMARKET_ADDRESS')
```

Or create a test wrapper:
```bash
cd dashboards/polymarket
# Create a temp test file that injects a wallet
cat > /tmp/test-dash.html << 'EOF'
<script>window.__POLYMARKET_WALLET_ADDRESS__ = '0x1234...';</script>
<script>document.write('<iframe src="http://localhost:8080" style="width:100vw;height:100vh;border:none"></iframe>')</script>
EOF
```

### Docker test: dashboard inside the image

```bash
# From repo root
docker build -t clawmode-test .

# Run with a minimal test — just serves dashboards
docker run --rm -p 3333:3333 clawmode-test \
  sh -c "cd /opt/clawmode/dashboards && python3 -m http.server 3333"

# Open http://localhost:3333/polymarket/
# Open http://localhost:3333/hub/
```

This tests that:
- The Dockerfile built correctly
- Dashboards are at the right path in the image
- HTML renders properly when served from inside the container

### Docker test: simulate the real entrypoint

For testing how the entrypoint would copy dashboards, create a minimal test entrypoint:

```bash
cat > /tmp/test-entrypoint.sh << 'ENTRY'
#!/bin/sh
DASH_SRC="/opt/clawmode/dashboards"
DASH_DEST="/home/node/.openclaw/dashboards"
mkdir -p "$DASH_DEST"

# Simulate CLAWMODE_AGENTS="polymarket,scout"
for AGENT in polymarket scout; do
  if [ -d "$DASH_SRC/$AGENT" ]; then
    cp -r "$DASH_SRC/$AGENT" "$DASH_DEST/$AGENT"
    echo "Copied: $AGENT"
  fi
done

cd "$DASH_DEST"
python3 -m http.server 3333
ENTRY

chmod +x /tmp/test-entrypoint.sh

docker run --rm -p 3333:3333 \
  -v /tmp/test-entrypoint.sh:/test-entrypoint.sh \
  clawmode-test /test-entrypoint.sh
```

### Full integration test (with OpenClaw running)

This tests the gateway + dashboards together:

```bash
docker run --rm -it \
  -p 18789:18789 \
  -p 3333:3333 \
  clawmode-test sh -c '
    # Start dashboard server
    cd /opt/clawmode/dashboards
    python3 -m http.server 3333 &
    
    # Start OpenClaw gateway
    node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789
  '
```

- Gateway UI: http://localhost:18789
- Dashboards: http://localhost:3333/polymarket/

Note: Without the n8n-generated config, the gateway runs in unconfigured mode — no agents, no channels. This is fine for testing that dashboards render and the container works.

## Polymarket API reference

All public, no auth needed:

| Endpoint | URL | Returns |
|----------|-----|---------|
| Positions | `GET https://data-api.polymarket.com/positions?user={addr}` | Current positions with P&L |
| Trades | `GET https://data-api.polymarket.com/trades?user={addr}` | Trade history |
| Activity | `GET https://data-api.polymarket.com/activity?user={addr}` | On-chain activity |
| Portfolio value | `GET https://data-api.polymarket.com/value?user={addr}` | Total portfolio value |
| Midpoint price | `GET https://clob.polymarket.com/midpoint?token_id={id}` | Current mid price |
| Spread | `GET https://clob.polymarket.com/spread?token_id={id}` | Current spread |
| Orderbook | `GET https://clob.polymarket.com/book?token_id={id}` | Full orderbook |
| Market data | `GET https://gamma-api.polymarket.com/markets?slug={slug}` | Market metadata |

User only needs to provide their **Polygon wallet address**. No private keys for the dashboard.

## Creating a new agent dashboard

1. Create `dashboards/{slug}/index.html`
2. Follow the design standards above
3. Add env var placeholders using the `window.__VARNAME__` pattern
4. Expose `window.addFeedItem` and `window.refreshDashboard`
5. Add the agent entry to `dashboards/hub/index.html` AGENT_REGISTRY
6. Test locally with `python3 -m http.server`
7. Test in Docker with `docker build` + `docker run`
8. Commit and push to main

## Things you do NOT touch

- `openclaw.json` — generated by n8n
- `entrypoint.sh` — generated by n8n (mounted at deploy time)
- `.env` — generated by n8n
- Skills — mounted separately by n8n
- SOUL.md, IDENTITY.md, etc. — generated by n8n
- Agent channels (Telegram, Discord) — configured by n8n
- Dokploy/Hetzner deployment — managed by n8n

Your scope is: **Dockerfile + dashboards/**. That's it.

## Common commands

```bash
# Build image
docker build -t clawmode-test .

# Test a dashboard
cd dashboards/polymarket && python3 -m http.server 8080

# Test all dashboards from Docker
docker run --rm -p 3333:3333 clawmode-test \
  sh -c "cd /opt/clawmode/dashboards && python3 -m http.server 3333"

# Push to main
git add -A && git commit -m "description" && git push origin main

# Check image size
docker images clawmode-test
```