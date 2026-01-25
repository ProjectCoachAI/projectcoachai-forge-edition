# Cloudflare Dashboard - Create Worker Guide

## ⚠️ Important: Create a Worker, Not a Page

You're currently on the **Pages** creation page. For the Stripe API, we need to create a **Worker** instead.

## 📍 Step 1: Navigate to Workers

In the Cloudflare Dashboard:

1. In the left sidebar, you should see **"Workers & Pages"** (already selected)
2. Instead of clicking "Create", look for a **"Create"** dropdown or button at the top right
3. Select **"Create Worker"** (NOT "Create Page")

**OR:**

1. In the left sidebar, click **"Workers & Pages"**
2. You should see a list of existing Workers/Pages OR a **"Create"** button
3. Click **"Create"** and select **"Worker"** (not "Page")

## 🚀 Step 2: Create the Worker

After selecting "Create Worker", you have two options:

### Option A: Quick Edit (Recommended for First Setup)

1. Click **"Create Worker"** → **"Quick edit"**
2. Cloudflare will open an online code editor
3. Delete the default code
4. Copy and paste the contents of `cloudflare-worker/stripe.js` from the project
5. Click **"Save and deploy"**
6. Name your worker (e.g., `projectcoachai-stripe-api`)

### Option B: Upload from Computer

1. Click **"Create Worker"** → **"Upload Worker"** (if available)
2. Upload the `stripe.js` file from `cloudflare-worker/` directory

### Option C: Deploy via Wrangler CLI (Easiest)

After creating the worker in the dashboard, you can deploy updates using:

```bash
cd cloudflare-worker
wrangler login  # (first time only)
wrangler deploy
```

## 🔐 Step 3: Set Environment Variables

After creating/deploying the worker:

1. In Cloudflare Dashboard → **Workers & Pages** → Select your worker
2. Go to **Settings** → **Variables and Secrets**
3. Under **Environment Variables**, click **"Add variable"**
4. Add as **Encrypted** (Secret):
   - **Variable name**: `STRIPE_SECRET_KEY`
   - **Value**: `sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy`
5. Click **"Save"**

## 🌐 Step 4: Note Your Worker URL

After deployment, Cloudflare will show you a URL like:
```
https://projectcoachai-stripe-api.your-account.workers.dev
```

**Save this URL** - you'll need it to update the Forge app!

## 🔗 Step 5: (Optional) Set Up Custom Route

If you want to use `api.projectcoachai.com/stripe`:

1. In Worker → **Settings** → **Triggers**
2. Under **Routes**, click **"Add route"**
3. Add route: `api.projectcoachai.com/api/stripe/*`
4. Make sure `api.projectcoachai.com` DNS is pointing to Cloudflare

## ✅ Quick Reference

**What you're on now:** Pages creation page ❌

**What you need:** Worker creation page ✅

**How to get there:**
- Look for **"Create"** dropdown → Select **"Worker"**
- OR: URL should be `/workers-and-pages/create/worker` (not `/pages`)
