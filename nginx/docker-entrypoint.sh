#!/bin/sh
# nginx entrypoint — writes its own config and generates a cert if needed.
# Everything is driven by environment variables; no host-side cert management required.
#
# LUMA_PROXY_MODE=false (default)
#   Listens on 80 (redirect) + 443 (SSL). Generates a self-signed cert on first
#   start and stores it in the nginx_certs named volume. To use a real cert,
#   copy fullchain.pem + privkey.pem into that volume before starting.
#
# LUMA_PROXY_MODE=true
#   Listens on 80 only (plain HTTP). TLS is terminated by the upstream proxy.
#   No cert generated or required. Set LUMA_HTTP_PORT to whatever port the
#   upstream proxy connects to (avoids conflict with the proxy's own 80/443).

set -e

PROXY_MODE="${LUMA_PROXY_MODE:-false}"
DOMAIN="${LUMA_DOMAIN:-localhost}"
CERT_DIR="/etc/nginx/certs"
CONF="/etc/nginx/conf.d/default.conf"
HEADERS_INC="/etc/nginx/luma-security-headers.conf"
PROXY_INC="/etc/nginx/luma-api-proxy.conf"

# ── Security headers ──────────────────────────────────────────────────────────
# Included in the server block and in every location that uses its own
# add_header (nginx drops inherited add_header directives in that case).
cat > "$HEADERS_INC" << EOF
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
EOF

if [ "$PROXY_MODE" = "true" ]; then
    # HSTS is only emitted in proxy mode, where the upstream proxy is assumed
    # to hold a real certificate. With the standalone self-signed default it
    # would hard-block the browser's "proceed anyway" option.
    echo 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' >> "$HEADERS_INC"
fi

# ── Shared API proxy settings ─────────────────────────────────────────────────
if [ "$PROXY_MODE" = "true" ]; then
    FWD_PROTO='$http_x_forwarded_proto'
else
    FWD_PROTO='$scheme'
fi

cat > "$PROXY_INC" << EOF
proxy_pass         http://api:8000;
proxy_set_header   Host \$host;
proxy_set_header   X-Real-IP \$remote_addr;
proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
proxy_set_header   X-Forwarded-Proto ${FWD_PROTO};
proxy_read_timeout 600s;
proxy_send_timeout 600s;
client_max_body_size 50m;
EOF

# ── Rate limiting (http context — conf.d files are included at http level) ───
# luma_auth:    credential endpoints (login/setup/change-password) — brute-force guard.
# luma_refresh: token refresh — every page load hits it, so it gets more headroom.
RATE_LIMITS="
limit_req_zone \$binary_remote_addr zone=luma_auth:10m    rate=10r/m;
limit_req_zone \$binary_remote_addr zone=luma_refresh:10m rate=60r/m;
limit_req_status 429;
"

# In proxy mode \$remote_addr is the upstream proxy, which would make the rate
# limits global instead of per-client. Recover the real client IP from
# X-Forwarded-For, trusting only private-range peers (the proxy).
REAL_IP=""
if [ "$PROXY_MODE" = "true" ]; then
    REAL_IP="
    set_real_ip_from 10.0.0.0/8;
    set_real_ip_from 172.16.0.0/12;
    set_real_ip_from 192.168.0.0/16;
    set_real_ip_from 127.0.0.1;
    real_ip_header X-Forwarded-For;
    real_ip_recursive on;
"
fi

# ── Common location blocks (identical in both modes) ─────────────────────────
LOCATIONS=$(cat << EOF
    # Credential endpoints: strict per-IP limit; burst absorbs a legitimate
    # family sharing one NAT address.
    location = /api/v1/auth/login {
        limit_req zone=luma_auth burst=10 nodelay;
        include ${PROXY_INC};
    }

    location = /api/v1/auth/setup {
        limit_req zone=luma_auth burst=10 nodelay;
        include ${PROXY_INC};
    }

    location = /api/v1/auth/change-password {
        limit_req zone=luma_auth burst=10 nodelay;
        include ${PROXY_INC};
    }

    location = /api/v1/auth/refresh {
        limit_req zone=luma_refresh burst=30 nodelay;
        include ${PROXY_INC};
    }

    # HAE ingest: the URL path carries a per-user import token — keep it out
    # of the access log entirely.
    location /api/v1/ingest/ {
        access_log off;
        include ${PROXY_INC};
    }

    location /api/v1/coach/ {
        include ${PROXY_INC};
        proxy_buffering        off;
        proxy_cache            off;
        proxy_read_timeout     300s;
        proxy_send_timeout     300s;
        chunked_transfer_encoding on;
    }

    location /api/ {
        include ${PROXY_INC};
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Service worker must never be immutably cached — iOS PWA won't update otherwise
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        include ${HEADERS_INC};
        try_files \$uri =404;
    }

    # Manifest changes (icons, colors) must be visible quickly
    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache";
        include ${HEADERS_INC};
        try_files \$uri =404;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff2?|svg)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        include ${HEADERS_INC};
        try_files \$uri =404;
    }
EOF
)

if [ "$PROXY_MODE" = "true" ]; then
    echo "[luma] proxy mode — plain HTTP, TLS terminated upstream"

    cat > "$CONF" << EOF
${RATE_LIMITS}

server {
    listen 80;
    server_name _;
${REAL_IP}
    root /var/www/html;
    index index.html;

    include ${HEADERS_INC};

${LOCATIONS}
}
EOF

else
    echo "[luma] standalone mode — SSL on 443, redirect on 80"

    mkdir -p "$CERT_DIR"
    if [ ! -f "$CERT_DIR/fullchain.pem" ] || [ ! -f "$CERT_DIR/privkey.pem" ]; then
        echo "[luma] generating self-signed certificate for ${DOMAIN}..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$CERT_DIR/privkey.pem" \
            -out  "$CERT_DIR/fullchain.pem" \
            -subj "/CN=${DOMAIN}" 2>/dev/null
        echo "[luma] certificate ready"
    else
        echo "[luma] using existing certificate in ${CERT_DIR}"
    fi

    cat > "$CONF" << EOF
${RATE_LIMITS}

server {
    listen 80;
    server_name _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};

    ssl_certificate     ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    root /var/www/html;
    index index.html;

    include ${HEADERS_INC};

${LOCATIONS}
}
EOF

fi

nginx -t
exec nginx -g "daemon off;"
