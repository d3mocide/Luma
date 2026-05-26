#!/usr/bin/env bash

set -euo pipefail

# Luma Developer Setup Script
# Automatically configures the local developer environment with SSL certificates, environment variables, and initial parameters.

echo "============================================="
echo "        Luma Dev Setup & Initializer         "
echo "============================================="
echo ""

# 1. Check dependencies
if ! command -v openssl &> /dev/null; then
    echo "ERROR: openssl is required but not installed." >&2
    exit 1
fi

# 2. Check and configure environment variables
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    
    # Generate secure random secrets for JWT_SECRET and HAE_SHARED_SECRET
    JWT_SEC=$(openssl rand -hex 32)
    HAE_SEC=$(openssl rand -hex 32)
    
    # Replace placeholders in the newly created .env file
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=${JWT_SEC}/" .env
    sed -i "s/HAE_SHARED_SECRET=.*/HAE_SHARED_SECRET=${HAE_SEC}/" .env
    
    echo "Generated new secure random secrets for JWT_SECRET and HAE_SHARED_SECRET in .env."
else
    echo ".env file already exists. Skipping creation."
fi

# 3. Check and configure SSL certificates
mkdir -p certs
if [ ! -f certs/fullchain.pem ] || [ ! -f certs/privkey.pem ]; then
    echo "Generating self-signed developer SSL certificates in certs/..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout certs/privkey.pem \
      -out certs/fullchain.pem \
      -subj "/C=US/ST=State/L=City/O=Luma/OU=Dev/CN=localhost" 2>/dev/null
    
    echo "SSL Certificates generated successfully!"
else
    echo "Developer SSL certificates already exist in certs/. Skipping generation."
fi

echo ""
echo "============================================="
echo "Setup complete! Ready to start Luma."
echo "============================================="
echo "Next steps:"
echo "1. Run: docker compose up -d --build"
echo "2. Run: docker compose exec api alembic upgrade head"
echo "3. Access the web app at: https://localhost"
echo "4. Follow the interactive wizard to set up your primary Operator account!"
echo "============================================="
