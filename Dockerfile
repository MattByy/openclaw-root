FROM ghcr.io/phioranex/openclaw-docker:latest
USER root

# Copy ClawMode dashboards into the image
COPY dashboards/ /opt/clawmode/dashboards/
RUN chmod -R a+r /opt/clawmode/dashboards

# Dashboard server (served by entrypoint via python3 -m http.server)
EXPOSE 3333
