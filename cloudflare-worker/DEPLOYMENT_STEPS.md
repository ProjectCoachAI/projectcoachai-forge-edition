# Cloudflare Worker Deployment - Step by Step

## ✅ What I've Done

- ✅ Created Cloudflare Worker code (`stripe.js`)
- ✅ Created `wrangler.toml` configuration
- ✅ Created `package.json` with dependencies
- ✅ Created deployment script (`deploy.sh`)
- ✅ Verified code structure

## 📋 What You Need to Do

### Step 1: Install Wrangler CLI (if not installed)

```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

This will open your browser to authenticate with Cloudflare.

### Step 3: Set Stripe Secret Key in Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages**
3. Click **Create Worker** (or select existing if you have one)
4. Go to **Settings** → **Variables**
5. Under **Environment Variables** → **Secrets**, click **Add Secret**
6. Add:
   - **Variable Name**: `STRIPE_SECRET_KEY`
   - **Value**: `sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy`
   - Click **Encrypt** and **Save**

### Step 4: Deploy the Worker

**Option A: Using the deployment script**
```bash
cd cloudflare-worker
./deploy.sh
```

**Option B: Manual deployment**
```bash
cd cloudflare-worker
wrangler deploy
```

### Step 5: Note Your Worker URL

After deployment, Wrangler will show you a URL like:
```
https://projectcoachai-stripe-api.your-subdomain.workers.dev
```

**Save this URL!** You'll need it to update the Forge app.

### Step 6: (Optional) Set Up Custom Domain

If you want to use `api.projectcoachai.com/stripe`:

1. In Cloudflare Dashboard → **Workers & Pages** → Your Worker
2. Go to **Settings** → **Triggers** → **Routes**
3. Click **Add Route**
4. Add route: `api.projectcoachai.com/api/stripe/*`
5. Make sure `api.projectcoachai.com` DNS is pointing to Cloudflare

### Step 7: Update Forge App

Once deployed, update `stripe-client.js` in the Forge app:

```javascript
// In stripe-client.js, update the API_URL:
const API_URL = process.env.STRIPE_API_URL || 'https://your-worker-url.workers.dev/api/stripe';
// Or if using custom domain:
const API_URL = process.env.STRIPE_API_URL || 'https://api.projectcoachai.com/api/stripe';
```

## 🧪 Testing

After deployment, test the endpoint:

```bash
curl -X POST https://your-worker-url.workers.dev/api/stripe/create-checkout-session \
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

## ✅ Summary

**Files Ready:**
- ✅ `cloudflare-worker/stripe.js` - Worker code
- ✅ `cloudflare-worker/wrangler.toml` - Configuration
- ✅ `cloudflare-worker/package.json` - Dependencies
- ✅ `cloudflare-worker/deploy.sh` - Deployment script

**What You Need:**
- ⏳ Login to Cloudflare (`wrangler login`)
- ⏳ Set `STRIPE_SECRET_KEY` secret in Cloudflare Dashboard
- ⏳ Run deployment (`wrangler deploy`)
- ⏳ Update Forge app with worker URL
