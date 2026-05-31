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

if [ "$PROXY_MODE" = "true" ]; then
    echo "[luma] proxy mode — plain HTTP, TLS terminated upstream"

    cat > "$CONF" << EOF
server {
    listen 80;
    server_name _;

    root /var/www/html;
    index index.html;

    location /api/ {
        proxy_pass         http://api:8000;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 50m;
    }

    location /api/v1/coach/ {
        proxy_pass             http://api:8000;
        proxy_set_header       Host \$host;
        proxy_set_header       X-Real-IP \$remote_addr;
        proxy_set_header       X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_buffering        off;
        proxy_cache            off;
        proxy_read_timeout     300s;
        proxy_send_timeout     300s;
        chunked_transfer_encoding on;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Service worker must never be immutably cached — iOS PWA won't update otherwise
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files \$uri =404;
    }

    # Manifest changes (icons, colors) must be visible quickly
    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff2?|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
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

    location /api/ {
        proxy_pass         http://api:8000;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 50m;
    }

    location /api/v1/coach/ {
        proxy_pass             http://api:8000;
        proxy_set_header       Host \$host;
        proxy_set_header       X-Real-IP \$remote_addr;
        proxy_set_header       X-Forwarded-Proto \$scheme;
        proxy_buffering        off;
        proxy_cache            off;
        proxy_read_timeout     300s;
        proxy_send_timeout     300s;
        chunked_transfer_encoding on;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Service worker must never be immutably cached — iOS PWA won't update otherwise
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files \$uri =404;
    }

    # Manifest changes (icons, colors) must be visible quickly
    location = /manifest.webmanifest {
        add_header Cache-Control "no-cache";
        try_files \$uri =404;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|woff2?|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
}
EOF

fi

exec nginx -g "daemon off;"
