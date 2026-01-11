# Railway Deployment Guide

## Overview

ProjectCoachAI Forge Edition is an **Electron desktop application**, which presents unique challenges for Railway deployment since Railway is primarily designed for web applications and APIs.

## Current Architecture

- **Main App**: Electron desktop application (`main.js`)
- **Frontend**: HTML/CSS/JS files (renderer process)
- **Backend Services**: 
  - Stripe integration (subscription management)
  - OpenAI API (synthesis engine)
  - No standalone backend server (Electron handles IPC)

## Deployment Options

### Option 1: Backend Services on Railway (Recommended)

If you plan to add backend services (API, webhooks, etc.), Railway can host:

1. **Stripe Webhook Handler**
   - Webhook endpoint for subscription events
   - Update subscription status in database
   - Process payment confirmations

2. **API Proxy Service**
   - Proxy OpenAI API calls (if needed)
   - Rate limiting and caching
   - Analytics tracking

3. **Analytics/Telemetry Service**
   - Usage analytics
   - Error reporting
   - Feature usage tracking

### Option 2: Web Version (Future)

If you want to deploy a web version of ProjectCoachAI:

1. Convert Electron app to web app
2. Deploy on Railway as Node.js application
3. Use Railway's static file hosting or Node.js server

### Option 3: CI/CD Pipeline

Use Railway to:
- Build Electron apps automatically
- Run tests
- Deploy to app stores
- Handle releases

## Railway Configuration Files

### railway.toml (if deploying backend services)

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm install"

[deploy]
startCommand = "node server.js"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### Procfile (alternative to railway.toml)

```
web: node server.js
```

### Environment Variables Needed

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OpenAI Configuration
OPENAI_API_KEY=sk-...

# Application
NODE_ENV=production
PORT=3000

# Stripe Price IDs
STRIPE_LITE_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_TEAM_PRICE_ID=price_...
```

## Current Setup Status

### ✅ What's Ready
- Environment variable structure in `stripe-config.js`
- Stripe integration code
- OpenAI API integration

### ⚠️ What's Missing for Railway
1. **No backend server** - Need to create one if deploying services
2. **No database** - Need to decide on storage (PostgreSQL, MongoDB, etc.)
3. **No webhook handler** - Need to create if using Stripe webhooks

## Recommendations

### For Now (Electron Desktop App)
**Railway is not needed** for the desktop Electron application. The app runs locally.

### For Future Backend Services
If you want to add backend services:

1. **Create a backend server** (`backend/server.js`)
   ```javascript
   const express = require('express');
   const app = express();
   
   // Stripe webhook handler
   app.post('/webhooks/stripe', ...);
   
   // API endpoints
   app.get('/api/subscription/:userId', ...);
   
   app.listen(process.env.PORT || 3000);
   ```

2. **Deploy to Railway**
   - Connect GitHub repository
   - Set environment variables
   - Railway auto-deploys on push

3. **Update Electron app**
   - Point to Railway backend URL
   - Handle API calls to backend

## Next Steps

1. **Decide on backend needs**:
   - Do you need a backend server?
   - What services need to run remotely?
   - Do you need Stripe webhooks?

2. **If yes, create backend**:
   - Set up Express/Fastify server
   - Add Stripe webhook handling
   - Add API endpoints
   - Set up database (if needed)

3. **If no, skip Railway for now**:
   - Focus on Electron app distribution
   - Use Electron Builder for packaging
   - Deploy to app stores directly

## Questions to Consider

1. **Do you need a backend server?**
   - Subscription management could be done client-side (current approach)
   - Analytics/telemetry might need backend
   - Multi-device sync might need backend

2. **Do you need Stripe webhooks?**
   - Current implementation handles subscriptions locally
   - Webhooks provide better reliability for payment events
   - Recommended for production

3. **Do you need user accounts?**
   - Current app uses local storage
   - Cloud sync would require backend
   - User accounts would require backend

4. **What's the priority?**
   - Desktop app distribution (use Electron Builder)
   - Backend services (use Railway)
   - Web version (convert app, use Railway)




