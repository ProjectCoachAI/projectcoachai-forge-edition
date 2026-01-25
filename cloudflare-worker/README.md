# Cloudflare Worker for Stripe API

## ✅ Perfect for Your Setup!

Since you're already using Cloudflare for your website, this Worker keeps everything in one place. It's serverless, fast, and free to start.

## 🚀 Quick Setup

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
# or
npm install wrangler --save-dev
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Set Environment Variable in Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select your worker (or create new one)
3. Go to Settings → Variables
4. Add Secret Variable:
   - **Name**: `STRIPE_SECRET_KEY`
   - **Value**: `sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy` (your test key)

### 4. Deploy

```bash
cd cloudflare-worker
wrangler deploy
```

Cloudflare will give you a URL like:
`https://projectcoachai-stripe-api.your-subdomain.workers.dev`

### 5. Set Up Custom Domain (Optional)

If you want to use `api.projectcoachai.com`:

1. In Cloudflare Dashboard → Workers & Pages → Your Worker
2. Go to Settings → Triggers → Routes
3. Add Route: `api.projectcoachai.com/api/stripe/*`
4. Make sure `api.projectcoachai.com` DNS points to Cloudflare

Or use a subdomain:
- Route: `stripe-api.projectcoachai.com/*`

## 📋 Endpoints

After deployment, your endpoints will be:

- `POST /api/stripe/create-checkout-session` - Create Stripe checkout
- `GET /api/stripe/verify-session/:sessionId` - Verify payment
- `POST /api/stripe/create-portal-session` - Customer portal
- `GET /health` - Health check

## 🔧 Update Forge App

Once deployed, update `stripe-client.js` in the Forge app:

```javascript
// Change from:
const API_URL = process.env.STRIPE_API_URL || 'https://api.projectcoachai.com/stripe';

// To your Cloudflare Worker URL:
const API_URL = process.env.STRIPE_API_URL || 'https://api.projectcoachai.com/stripe';
// Or: 'https://projectcoachai-stripe-api.your-subdomain.workers.dev/api/stripe'
```

## ✅ Testing

Test the endpoint:

```bash
curl -X POST https://your-worker-url/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{
    "priceId": "price_1Smim8D9SDC8fk3Bn8O6zXh0",
    "tierId": "creator"
  }'
```

Should return:
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

## 💰 Cloudflare Workers Pricing

- **Free tier**: 100,000 requests/day
- **Paid**: $5/month for 10 million requests
- Perfect for Stripe API calls (low volume)

## 🔐 Security

- Stripe secret key stored as Cloudflare Secret (encrypted)
- Environment variables not exposed to client
- CORS enabled for your domains only (adjust in code if needed)
