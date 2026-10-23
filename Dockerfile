# Serves the static app with Caddy. Railway builds this automatically.
FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html app.js data.js styles.css /srv/
