# ============================================================
# ClawMode OpenClaw Image
# ============================================================
# Bakes all runtime deps + static UI patches + CLI symlink into
# the image. Customer containers start in ~30s instead of 5-10min.
# ============================================================

FROM ghcr.io/phioranex/openclaw-docker:latest

USER root

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
# Copy JS files from repo instead of inline heredoc (more reliable)
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

EXPOSE 3333 18789

# Entrypoint is mounted per-customer by Dokploy at /entrypoint.sh
# Dokploy start command: sh /entrypoint.sh