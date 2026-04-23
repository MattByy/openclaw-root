# ============================================================
# ClawMode OpenClaw Image
# ============================================================
# Bakes all runtime deps + static UI patches + CLI symlink into
# the image. Customer containers start in ~30s instead of 5-10min.
#
# The container starts as root so the entrypoint can chown the
# Docker-mounted /home/node/.openclaw volume, then drops to node
# via `setpriv --reuid=node --regid=node` (util-linux, present by
# default on the bookworm base — no apt install needed). setpriv
# only drops privileges, so it is compatible with Dokploy's
# no-new-privileges security option, which blocks sudo.
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
# Playwright + Chromium
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
# Ownership handoff — everything the node user needs to read or
# write at runtime must be node-owned before we drop privileges.
# ------------------------------------------------------------
RUN chown -R node:node /home/node /opt/clawmode "$PLAYWRIGHT_BROWSERS_PATH"

EXPOSE 3333 18789

# curl is installed above; healthz is served by the gateway on 18789.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:18789/healthz || exit 1

# Container starts as root. The n8n-generated entrypoint chowns
# Docker-mounted volumes, then drops to node via
#   setpriv --reuid=node --regid=node --init-groups -- <cmd>
# before starting the gateway.
#
# Entrypoint is mounted per-customer by Dokploy at /entrypoint.sh.
# Dokploy start command: sh /entrypoint.sh
