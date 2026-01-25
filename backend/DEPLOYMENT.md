# Backend Deployment Guide

## ✅ What's Been Set Up

I've created the Stripe API backend with the following:

1. **Stripe Routes** (`routes/stripe.js`):
   - `POST /api/stripe/create-checkout-session` - Create Stripe checkout
   - `GET /api/stripe/verify-session/:sessionId` - Verify payment
   - `POST /api/stripe/create-portal-session` - Customer portal
   - `POST /api/stripe/webhook` - Webhook handler

2. **Server Integration** (`server.js`):
   - Stripe routes integrated
   - CORS enabled
   - JSON body parsing

3. **Dependencies** (`package.json`):
   - `stripe` package added
   - `dotenv` for environment variables

## 📋 What I Need From You

To complete the setup, please provide:

### 1. Stripe Secret Key (Test Mode)
- Go to [Stripe Dashboard](https://dashboard.stripe.com/test/apikeys)
- Copy your **Secret key** (starts with `sk_test_...`)
- This will be set as `STRIPE_SECRET_KEY` environment variable

### 2. API Deployment URL
Where will you deploy this backend?
- **Railway**: `https://your-app.railway.app`
- **Heroku**: `https://your-app.herokuapp.com`
- **Custom domain**: `https://api.projectcoachai.com`

### 3. Hosting Platform
Which platform will you use?
- Railway (recommended - easiest)
- Heroku
- Vercel
- Custom VPS

## 🚀 Deployment Steps

### Option 1: Railway (Recommended)

1. **Install Railway CLI** (optional):
   ```bash
   npm i -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

3. **Deploy from backend directory**:
   ```bash
   cd backend
   railway init
   railway up
   ```

4. **Set Environment Variables in Railway Dashboard**:
   - Go to your project → Variables
   - Add: `STRIPE_SECRET_KEY=sk_test_...`
   - Add: `STRIPE_MODE=test`

5. **Get your deployment URL**:
   - Railway will give you a URL like: `https://your-app.up.railway.app`
   - Update `stripe-client.js` in the Forge app to use this URL

### Option 2: Manual Deployment

1. **Install dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Set environment variables** (create `.env` file):
   ```bash
   cp .env.example .env
   # Edit .env with your Stripe keys
   ```

3. **Test locally**:
   ```bash
   npm start
   # Server runs on http://localhost:3000
   ```

4. **Deploy to your platform** (follow their instructions)

## 🔧 Update Forge App Configuration

After deployment, update `stripe-client.js` in the Forge app:

```javascript
// Change this line:
const API_URL = process.env.STRIPE_API_URL || 'https://api.projectcoachai.com/stripe';

// To your actual deployment URL:
const API_URL = process.env.STRIPE_API_URL || 'https://your-app.up.railway.app/api/stripe';
```

## ✅ Testing

Once deployed, test the endpoint:

```bash
curl -X POST https://your-api-url/api/stripe/create-checkout-session \
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

## 🔐 Security Notes

- Never commit `.env` file to git
- Use test keys for development
- Production keys only in production environment
- Webhook secret is optional (only needed for webhooks)
