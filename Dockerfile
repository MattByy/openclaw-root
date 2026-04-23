# ============================================================
# ClawMode OpenClaw Image — CLEAN
# ============================================================
# Runs as `node` from start. No runtime chown, no setpriv dance,
# no root-phase entrypoint. All ownership is correct at build
# time, which means:
#   - No race between chown and healthcheck
#   - Compatible with no-new-privileges security option
#   - Customer containers start in ~5s instead of 30s
#
# The n8n-generated entrypoint is mounted per-customer at
# /entrypoint.sh and is responsible ONLY for per-tenant dynamic
# work (load .env, assemble dashboards, start gateway).
# ============================================================

# Pinned to digest so rebuilds are reproducible. To bump:
#   docker pull ghcr.io/phioranex/openclaw-docker:latest
#   docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/phioranex/openclaw-docker:latest
FROM ghcr.io/phioranex/openclaw-docker@sha256:366fd80cc4b3b2051167e2a24daa01136cc8db4d56fa20c441dfdb54922a2127

# ------------------------------------------------------------
# System install phase — runs as root (required for apt/npm -g)
# ------------------------------------------------------------
USER root

# Shared playwright browser cache — writable by root at install time,
# later chown'd to node so the non-root runtime can launch chromium.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# System packages
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3-pip \
      libreoffice-writer \
      curl \
      wget \
      jq \
      git \
      poppler-utils \
      zip \
      unzip \
      tar \
      file \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf /usr/bin/pip3 /usr/local/bin/pip \
 && ln -sf /usr/bin/python3 /usr/local/bin/python

# Python packages
RUN pip3 install --break-system-packages --no-cache-dir \
      python-docx \
      openpyxl \
      requests \
      beautifulsoup4 \
      duckduckgo-search \
      PyPDF2 \
      Pillow \
      mammoth \
      markdown

# Node globals
RUN npm install -g clawhub firecrawl-cli

# Playwright + Chromium (needs root for apt-based deps)
RUN npx -y playwright install chromium \
 && npx -y playwright install-deps chromium

# openclaw CLI symlink
RUN printf '#!/bin/sh\nexec node /app/openclaw.mjs "$@"\n' > /usr/local/bin/openclaw \
 && chmod +x /usr/local/bin/openclaw

# ClawMode dashboards
COPY dashboards/ /opt/clawmode/dashboards/
RUN chmod -R a+r /opt/clawmode/dashboards \
 && chmod +x /opt/clawmode/dashboards/_serve.py

# Control UI static patches (auth + dashboard button)
COPY control-ui-patches/clawauth.js /app/dist/control-ui/assets/clawauth.js
COPY control-ui-patches/clawdash.js /app/dist/control-ui/assets/clawdash.js

RUN INDEX="/app/dist/control-ui/index.html" \
 && if ! grep -q "clawauth" "$INDEX"; then \
      sed -i 's|</head>|<script src="./assets/clawauth.js"></script></head>|' "$INDEX"; \
    fi \
 && if ! grep -q "clawdash" "$INDEX"; then \
      sed -i 's|</head>|<script src="./assets/clawdash.js"></script></head>|' "$INDEX"; \
    fi

# ------------------------------------------------------------
# Pre-create the directory structure the entrypoint expects,
# with correct ownership. This eliminates any need for
# runtime chown and lets us run as non-root from PID 1.
# ------------------------------------------------------------
RUN mkdir -p \
      /home/node/.openclaw/agents/main \
      /home/node/.openclaw/canvas \
      /home/node/.openclaw/skills \
      /home/node/.openclaw/tools \
      /home/node/.openclaw/browser \
      /home/node/.openclaw/cron/runs \
      /home/node/.openclaw/media/inbound \
      /home/node/.openclaw/logs \
      /home/node/.openclaw/configs \
      /home/node/.openclaw/dashboards \
 && chown -R node:node /home/node /opt/clawmode "$PLAYWRIGHT_BROWSERS_PATH"

# ------------------------------------------------------------
# Switch to non-root user for everything from here on.
# Dokploy start command is `sh /entrypoint.sh` which will run
# as node because of this USER directive.
# ------------------------------------------------------------
USER node
WORKDIR /home/node/.openclaw

EXPOSE 3333 18789

# Healthcheck. Generous start_period for slow first-boot plugin init.
# Interval/retries tuned so a transient blip does not trigger Swarm
# task rescheduling.
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD curl -fsS http://127.0.0.1:18789/healthz || exit 1

# No CMD / ENTRYPOINT — Dokploy provides the start command per-app:
#   sh /entrypoint.sh
#
# Because we are already USER node, the entrypoint runs as node
# directly. No chown, no setpriv, no privilege drop needed.