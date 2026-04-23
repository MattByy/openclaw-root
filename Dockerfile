# ============================================================
# ClawMode OpenClaw Image
# ============================================================
# Bakes all runtime deps + static UI patches + CLI symlink into
# the image. Customer containers start in ~30s instead of 5-10min.
#
# Runs as the unprivileged `node` user by default. n8n's generated
# entrypoint must be compatible (no `su` wrappers, .env chown'd to
# node:node) — see Claude.md § Non-root entrypoint requirements.
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

# ------------------------------------------------------------
# Narrow sudo escape hatch for the non-root entrypoint.
# Dokploy mounts /home/node/.openclaw as a fresh volume owned by
# root; the node-user entrypoint needs exactly one privileged call
# to re-chown it before writing config. No password, no other
# commands — locked to this one invocation.
# ------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends sudo \
 && rm -rf /var/lib/apt/lists/* \
 && echo 'node ALL=(root) NOPASSWD: /bin/chown -R node\:node /home/node/.openclaw*' > /etc/sudoers.d/node-chown \
 && chmod 440 /etc/sudoers.d/node-chown

EXPOSE 3333 18789

# curl is installed above; healthz is served by the gateway on 18789.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:18789/healthz || exit 1

USER node

# Entrypoint is mounted per-customer by Dokploy at /entrypoint.sh.
# Dokploy start command: sh /entrypoint.sh
