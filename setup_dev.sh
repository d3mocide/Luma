#!/usr/bin/env bash

set -euo pipefail

# Luma setup — creates .env with secure random secrets.
# All deployment behaviour (SSL vs proxied, ports, domain, models) is configured
# in .env itself. See .env.example for every available option.

if ! command -v openssl &> /dev/null; then
    echo "ERROR: openssl is required." >&2
    exit 1
fi

if [ -f .env ]; then
    echo ".env already exists — skipping. Edit it directly to change configuration."
    exit 0
fi

cp .env.example .env

# Stamp in cryptographically random secrets.
JWT_SEC=$(openssl rand -hex 32)
HAE_SEC=$(openssl rand -hex 32)
sed -i "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SEC}/" .env
sed -i "s/HAE_SHARED_SECRET=.*/HAE_SHARED_SECRET=${HAE_SEC}/" .env

echo "Created .env with generated secrets."
echo "Edit .env to set your domain, API keys, and deployment mode, then:"
echo "  docker compose up -d --build"
echo "  docker compose exec api alembic upgrade head"
