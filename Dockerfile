# ============================================================
# ClawMode OpenClaw Image — FINAL
# ============================================================
# Container starts as root so the entrypoint can chown the
# Docker-mounted workspace directories that Docker creates as
# root-owned during bind-mount setup. The entrypoint immediately
# drops to `node` via `setpriv` before doing anything else.
#
# This is the standard pattern used by nginx, postgres, redis,
# and most production images with bind-mounted volumes.
#
# Security posture:
#   - Capabilities dropped at Dokploy level (cap_drop: ALL + a few)
#   - no-new-privileges:true blocks setuid escalation
#   - setpriv (util-linux) drops privileges, fully compatible with
#     no-new-privileges (it only DROPS privileges, never gains)
#   - Root phase is ~1 second, only runs chown + setpriv
#   - After setpriv, container is node (uid 1000) forever
# ============================================================

# Pinned to digest so rebuilds are reproducible. To bump:
#   docker pull ghcr.io/phioranex/openclaw-docker:latest
#   docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/phioranex/openclaw-docker:latest
FROM ghcr.io/phioranex/openclaw-docker@sha256:366fd80cc4b3b2051167e2a24daa01136cc8db4d56fa20c441dfdb54922a2127

USER root

# Shared playwright browser cache — writable by root at install time,
# later chown'd to node so the non-root runtime can launch chromium.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# ------------------------------------------------------------
# System packages
# ------------------------------------------------------------
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

# ------------------------------------------------------------
# Python packages
# ------------------------------------------------------------
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

# ------------------------------------------------------------
# Node globals
# ------------------------------------------------------------
RUN npm install -g clawhub firecrawl-cli

# ------------------------------------------------------------
# Playwright + Chromium (needs root for apt-based deps)
# ------------------------------------------------------------
RUN npx -y playwright install chromium \
 && npx -y playwright install-deps chromium

# ------------------------------------------------------------
# openclaw CLI symlink
# ------------------------------------------------------------
RUN printf '#!/bin/sh\nexec node /app/openclaw.mjs "$@"\n' > /usr/local/bin/openclaw \
 && chmod +x /usr/local/bin/openclaw

# ------------------------------------------------------------
# ClawMode dashboards
# ------------------------------------------------------------
COPY dashboards/ /opt/clawmode/dashboards/
RUN chmod -R a+r /opt/clawmode/dashboards \
 && chmod +x /opt/clawmode/dashboards/_serve.py

# ------------------------------------------------------------
# Control UI static patches (auth + dashboard button)
# ------------------------------------------------------------
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
# Pre-create node's home directory structure + configs dir
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

EXPOSE 3333 18789

# Healthcheck. Generous start_period for slow first-boot plugin init.
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD curl -fsS http://127.0.0.1:18789/healthz || exit 1

# ------------------------------------------------------------
# Container starts as USER root.
# The entrypoint (mounted per-customer by Dokploy at /entrypoint.sh)
# chowns workspace dirs to node, then exec's setpriv to drop to node.
# ------------------------------------------------------------
# No explicit CMD — Dokploy sets the start command to `sh /entrypoint.sh`