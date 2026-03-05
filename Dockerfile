FROM ghcr.io/phioranex/openclaw-docker:latest
USER root
RUN npm install -g openclaw@latest
