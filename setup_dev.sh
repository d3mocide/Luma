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

# Generate VAPID keys for push notifications.
# Requires Python 3 with the 'cryptography' package (pip install cryptography).
# If not available here, run  make gen-vapid  after the first  docker compose up.
_VAPID_KEYS=$(python3 - 2>/dev/null << 'PYEOF'
try:
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    import base64
    k = ec.generate_private_key(ec.SECP256R1())
    priv = base64.urlsafe_b64encode(k.private_numbers().private_value.to_bytes(32,'big')).rstrip(b'=').decode()
    pub  = base64.urlsafe_b64encode(k.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)).rstrip(b'=').decode()
    print(priv)
    print(pub)
except Exception:
    pass
PYEOF
)
if [ -n "$_VAPID_KEYS" ]; then
    _VAPID_PRIV=$(printf '%s' "$_VAPID_KEYS" | sed -n '1p')
    _VAPID_PUB=$(printf '%s'  "$_VAPID_KEYS" | sed -n '2p')
    sed -i "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${_VAPID_PRIV}|" .env
    sed -i "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${_VAPID_PUB}|"   .env
    echo "Created .env with generated secrets (JWT, HAE, VAPID)."
else
    echo "Created .env with generated secrets (JWT, HAE)."
    echo "  VAPID keys not generated — Python 'cryptography' package unavailable on this host."
    echo "  After starting containers run:  make gen-vapid"
fi
echo "Edit .env to set your domain, API keys, and deployment mode, then:"
echo "  docker compose up -d --build"
echo "  docker compose exec api alembic upgrade head"
echo "  open Luma in the browser and create the first operator account"
