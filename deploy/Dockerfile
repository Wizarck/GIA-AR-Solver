# Build the web POC and serve it with Caddy (automatic HTTPS).
# The camera API (getUserMedia) requires a secure context, so the site must
# be served over HTTPS with a real domain — Caddy handles the certificate.

FROM node:20-alpine AS build
WORKDIR /app
COPY web/package.json web/package-lock.json* ./
RUN npm install
COPY web/ ./
RUN npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
