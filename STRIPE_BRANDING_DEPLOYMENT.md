# Stripe Checkout Branding Deployment Guide

## Overview

This guide covers deploying the updated Stripe checkout with ProjectCoach AI Forge Edition branding.

## Changes Made

### 1. Cloudflare Worker (`cloudflare-worker/stripe.js`)
- ✅ Added branding metadata (Product, Company, Country)
- ✅ Pre-fills user email if available
- ✅ Enables promo codes
- ✅ Auto-detects user locale
- ✅ Collects billing address automatically
- ✅ Uses `forge://` protocol for redirects (back to Forge app)

### 2. Forge App (`stripe-client.js` & `main.js`)
- ✅ Passes user email/ID to Cloudflare Worker
- ✅ Custom protocol handler (`forge://`) for redirects
- ✅ Opens Forge's pricing page after payment

## Step 1: Deploy Cloudflare Worker

### Option A: Using Wrangler CLI (Recommended)

```bash
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/cloudflare-worker"

# Make sure you're logged in
wrangler whoami

# If not logged in:
wrangler login

# Deploy the worker
wrangler deploy
```

### Option B: Using Cloudflare Dashboard

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → Your Worker
3. Click **Edit code**
4. Copy the contents of `cloudflare-worker/stripe.js`
5. Paste into the editor
6. Click **Save and deploy**

### Verify Deployment

Test the health endpoint:
```bash
curl https://broken-cake-8815.daniel-jones-0fb.workers.dev/health
```

Expected response:
```json
{"status":"ok","service":"stripe-api"}
```

## Step 2: Configure Stripe Dashboard Branding

**Important:** Visual branding (logo, colors) must be set in Stripe Dashboard.

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Settings** → **Branding**
3. Configure:
   - **Logo**: Upload ProjectCoach AI logo (128x128px PNG recommended)
   - **Brand color**: `#ff6b35` (orange accent)
   - **Company name**: `Xencore Global GmbH`
   - **Business website**: `https://projectcoachai.com`
   - **Support email**: Your support email
   - **Support phone**: (Optional)

4. Click **Save**

## Step 3: Rebuild Forge App

The app needs to be rebuilt to include:
- Updated `stripe-client.js` (passes user info)
- Updated `main.js` (custom protocol handler)
- Updated `package.json` (protocol registration)

### Build Commands

```bash
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"

# Build macOS (Intel + Apple Silicon)
npm run build:mac

# Build Windows
npm run build:win
```

### Sign Apps (macOS)

After building, sign the macOS apps:

```bash
./sign-apps.sh
```

## Step 4: Test Stripe Checkout Flow

### Test Checklist

1. **Open Forge App**
   - Sign in with a test account
   - Navigate to pricing page
   - Click "Subscribe" on Creator/Professional/Team

2. **Stripe Checkout Opens**
   - ✅ Email should be pre-filled (if signed in)
   - ✅ Company name shows "Xencore Global GmbH"
   - ✅ Logo appears (if configured in Stripe Dashboard)
   - ✅ Brand colors match (`#ff6b35` orange)

3. **Complete/Cancel Payment**
   - ✅ Success: Redirects to `forge://subscription-success?session_id=...`
   - ✅ Cancel: Redirects to `forge://subscription-cancel?canceled=true`
   - ✅ Forge app opens automatically
   - ✅ Pricing page shows in Forge app

4. **Verify Subscription**
   - ✅ Subscription status updates in Forge app
   - ✅ Tier upgrade reflected immediately

## Troubleshooting

### Issue: Protocol handler not working

**Symptoms:** Clicking Stripe redirect doesn't open Forge app

**Fix:**
1. Rebuild the app (protocol registration requires rebuild)
2. On macOS: System Settings → Privacy & Security → Full Disk Access → Add Forge app
3. On Windows: Protocol should register automatically during install

### Issue: Email not pre-filled

**Symptoms:** Stripe checkout shows empty email field

**Fix:**
1. Ensure user is signed in to Forge app
2. Check `currentUser.email` is set in `main.js`
3. Verify Cloudflare Worker receives `x-user-email` header

### Issue: Branding not showing

**Symptoms:** Stripe checkout shows default Stripe branding

**Fix:**
1. Configure branding in Stripe Dashboard (Settings → Branding)
2. Wait 5-10 minutes for changes to propagate
3. Clear browser cache and try again

### Issue: SSL Certificate Error

**Symptoms:** Browser shows SSL error when redirecting

**Fix:**
- This should NOT happen anymore (we're using `forge://` protocol)
- If you see this, the redirect URL is still pointing to `https://projectcoachai.com`
- Check Cloudflare Worker is using `forge://` URLs

## API Endpoints

### Create Checkout Session
```
POST https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe/create-checkout-session
Headers:
  Content-Type: application/json
  x-user-email: user@example.com (optional)
  x-user-id: user123 (optional)
Body:
  {
    "priceId": "price_...",
    "tierId": "creator",
    "successUrl": "forge://subscription-success?session_id={CHECKOUT_SESSION_ID}",
    "cancelUrl": "forge://subscription-cancel?canceled=true"
  }
```

### Verify Session
```
GET https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe/verify-session/{sessionId}
```

### Health Check
```
GET https://broken-cake-8815.daniel-jones-0fb.workers.dev/health
```

## Files Changed

- ✅ `cloudflare-worker/stripe.js` - Added branding parameters
- ✅ `stripe-client.js` - Passes user info to API
- ✅ `main.js` - Custom protocol handler + user info passing
- ✅ `package.json` - Protocol registration

## Next Steps After Deployment

1. ✅ Deploy Cloudflare Worker
2. ✅ Configure Stripe Dashboard branding
3. ✅ Rebuild Forge app
4. ✅ Test checkout flow
5. ✅ Upload new installers to GitHub Releases

## Support

If you encounter issues:
1. Check Cloudflare Worker logs: Dashboard → Workers → Your Worker → Logs
2. Check Stripe Dashboard → Payments → Checkout sessions
3. Check Forge app console for protocol handler errors
