#!/bin/bash
# Cloudflare Worker Deployment Script
# This script helps deploy the Stripe API worker to Cloudflare

set -e

echo "🚀 Cloudflare Worker Deployment Script"
echo "======================================"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "⚠️  Wrangler CLI not found. Installing..."
    npm install -g wrangler
    echo "✅ Wrangler installed"
else
    echo "✅ Wrangler CLI found"
    wrangler --version
fi

echo ""
echo "📋 Before deploying, make sure you've:"
echo "   1. Logged in: wrangler login"
echo "   2. Set STRIPE_SECRET_KEY in Cloudflare Dashboard (Workers → Settings → Variables → Secrets)"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "🔐 Checking authentication..."
wrangler whoami || {
    echo "⚠️  Not logged in. Please run: wrangler login"
    exit 1
}

echo ""
echo "📦 Deploying to Cloudflare..."
wrangler deploy

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📍 Next steps:"
echo "   1. Note your worker URL (e.g., https://projectcoachai-stripe-api.your-subdomain.workers.dev)"
echo "   2. Update stripe-client.js in the Forge app with the worker URL"
echo "   3. (Optional) Set up custom domain route: api.projectcoachai.com/api/stripe/*"
echo ""
