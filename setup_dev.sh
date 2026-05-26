#!/usr/bin/env bash

set -euo pipefail

# Luma Developer Setup Script
# Usage:
#   ./setup_dev.sh                              — local dev (self-signed cert)
#   ./setup_dev.sh --server --domain=host.com  — standalone server (Let's Encrypt)
#   ./setup_dev.sh --proxied --domain=host.com  — behind an external reverse proxy

MODE="local"
DOMAIN=""
PORT="8080"

for arg in "$@"; do
  case "$arg" in
    --server)    MODE="server" ;;
    --proxied)   MODE="proxied" ;;
    --domain=*)  DOMAIN="${arg#--domain=}" ;;
    --port=*)    PORT="${arg#--port=}" ;;
  esac
done

echo "============================================="
echo "        Luma Dev Setup & Initializer         "
echo "  Mode: ${MODE}"
echo "============================================="
echo ""

# ── Dependency checks ─────────────────────────────────────────────────────────

if ! command -v openssl &> /dev/null; then
    echo "ERROR: openssl is required but not installed." >&2
    exit 1
fi

if [ "$MODE" = "server" ] && ! command -v certbot &> /dev/null; then
    echo "ERROR: certbot is required for server mode."
    echo "  Install: sudo apt install certbot"
    exit 1
fi

if [ "$MODE" = "proxied" ] && [ -z "$DOMAIN" ]; then
    echo "ERROR: --domain=yourdomain.com is required in proxied mode." >&2
    exit 1
fi

# ── Environment ───────────────────────────────────────────────────────────────

if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env

    JWT_SEC=$(openssl rand -hex 32)
    HAE_SEC=$(openssl rand -hex 32)

    sed -i "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SEC}/" .env
    sed -i "s/HAE_SHARED_SECRET=.*/HAE_SHARED_SECRET=${HAE_SEC}/" .env

    if [ "$MODE" = "server" ] || [ "$MODE" = "proxied" ]; then
        sed -i "s|LOCAL_AI_API_BASE=.*|LOCAL_AI_API_BASE=|" .env
        sed -i "s|ENVIRONMENT=.*|ENVIRONMENT=production|" .env
        sed -i "s|CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|" .env
        echo "  Set ANTHROPIC_API_KEY and GEMINI_API_KEY in .env before starting."
    fi

    if [ "$MODE" = "proxied" ]; then
        # Expose Luma on a non-standard port so the outer proxy owns 80/443.
        sed -i "s|#LUMA_HTTP_PORT=.*|LUMA_HTTP_PORT=${PORT}|" .env
        sed -i "s|#LUMA_HTTPS_PORT=.*|LUMA_HTTPS_PORT=8443|" .env
        echo "  Proxied mode: Luma will listen on port ${PORT}."
    fi

    echo "Generated new secure random secrets in .env."
else
    echo ".env already exists — skipping creation."
fi

# ── SSL Certificates ──────────────────────────────────────────────────────────

mkdir -p certs

if [ "$MODE" = "local" ]; then
    if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
        echo "Generating self-signed developer SSL certificate (localhost)..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
          -keyout certs/privkey.pem \
          -out certs/fullchain.pem \
          -subj "/C=US/ST=State/L=City/O=Luma/OU=Dev/CN=localhost" 2>/dev/null
        echo "Self-signed cert generated. Your browser will show a security warning — this is expected for local dev."
    else
        echo "SSL certificates already exist in certs/ — skipping."
    fi

elif [ "$MODE" = "server" ]; then
    if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
        echo "Obtaining Let's Encrypt certificate for ${DOMAIN}..."
        certbot certonly --standalone \
          --non-interactive \
          --agree-tos \
          --register-unsafely-without-email \
          -d "$DOMAIN"
        cp "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" certs/fullchain.pem
        cp "/etc/letsencrypt/live/${DOMAIN}/privkey.pem"   certs/privkey.pem
        echo "Let's Encrypt certificate obtained and installed in certs/."
    else
        echo "SSL certificates already exist in certs/ — skipping."
    fi
    sed -i "s/server_name _;/server_name ${DOMAIN};/" nginx/conf.d/luma.conf
    echo "Nginx server_name set to ${DOMAIN}."

elif [ "$MODE" = "proxied" ]; then
    # No certs needed — TLS is terminated by the upstream proxy.
    # Create an empty certs/ dir so the compose.yml bind mount doesn't fail.
    echo "Proxied mode: skipping cert generation (TLS handled by upstream proxy)."
fi

echo ""
echo "============================================="
echo "Setup complete!"
echo "============================================="
if [ "$MODE" = "local" ]; then
    echo "Next steps:"
    echo "  1. docker compose up -d --build"
    echo "  2. docker compose exec api alembic upgrade head"
    echo "  3. Open https://localhost (accept the self-signed cert warning)"
elif [ "$MODE" = "server" ]; then
    echo "Next steps:"
    echo "  1. Fill in ANTHROPIC_API_KEY and GEMINI_API_KEY in .env"
    echo "  2. docker compose up -d --build"
    echo "  3. docker compose exec api alembic upgrade head"
    echo "  4. Open https://${DOMAIN}"
    echo ""
    echo "HAE setup:"
    echo "  - Endpoint: https://${DOMAIN}/api/v1/ingest/hae"
    echo "  - Header:   X-HAE-Signature: <HMAC-SHA256 of body using HAE_SHARED_SECRET>"
else
    echo "Next steps:"
    echo "  1. Fill in ANTHROPIC_API_KEY and GEMINI_API_KEY in .env"
    echo "  2. docker compose -f compose.yml -f compose.proxied.yml up -d --build"
    echo "  3. docker compose -f compose.yml -f compose.proxied.yml exec api alembic upgrade head"
    echo ""
    echo "Your outer nginx proxy_pass block:"
    echo "  location / {"
    echo "      proxy_pass http://127.0.0.1:${PORT};"
    echo "      proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "      proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;"
    echo "      proxy_set_header Host              \$host;"
    echo "  }"
    echo ""
    echo "HAE setup:"
    echo "  - Endpoint: https://${DOMAIN}/api/v1/ingest/hae"
    echo "  - Header:   X-HAE-Signature: <HMAC-SHA256 of body using HAE_SHARED_SECRET>"
fi
echo "============================================="
