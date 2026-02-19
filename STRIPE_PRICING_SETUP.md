# Stripe Pricing Setup Guide

## 📊 Current Pricing Structure

Based on the designer's recommendations, here are the finalized pricing tiers:

| Tier | Name | Price | Billing | Test Price ID | Production Price ID |
|------|------|-------|---------|---------------|---------------------|
| **Starter** | Starter | $0 | Forever free | N/A | N/A |
| **Creator** | Creator | $14.95 | Per month | `price_1Smim8D9SDC8fk3Bn8O6zXh0` ✅ | `price_1SmiW2D9SDC8fk3BeVx8z6Cq` ✅ |
| **Professional** | Professional | $34.95 | Per month | `price_1SmioHD9SDC8fk3BJ2ADKiBX` ✅ | `price_1SmicRD9SDC8fk3Bu7lTCFyw` ✅ |
| **Team** | Team | $59.95 | Per month | `price_1SmippD9SDC8fk3B7Aq1DglU` ✅ | `price_1SmifSD9SDC8fk3Bujjy1Nsh` ✅ |
| **Enterprise** | Enterprise | Custom | Custom pricing | N/A | N/A |

---

## 🔄 Test vs Production Mode

The application automatically uses **test mode Price IDs** by default. To switch to production:

1. **Set environment variable:**
   ```bash
   STRIPE_MODE=production
   ```
   or
   ```bash
   STRIPE_MODE=live
   ```

2. **Or update `stripe-config.js`:**
   ```javascript
   const STRIPE_MODE = process.env.STRIPE_MODE || 'production'; // Change from 'test' to 'production'
   ```

**Important:** 
- Use **test mode** during development and testing
- Use **production mode** only when launching to real users
- Test mode uses test Price IDs (won't charge real cards)
- Production mode uses production Price IDs (will charge real cards)

---

## 🎯 Pricing Tier Details

### Starter (Free Forever)
- **Price:** $0
- **Features:**
  - 2 panes
  - 2 AI models (ChatGPT + 1 other)
  - 5 saved comparisons
  - 1 synthesis mode (Basic)
  - Basic template library
  - Community support

### Creator ($14.95/month) - **Most Popular**
- **Price:** $14.95/month
- **Features:**
  - 4 panes
  - 4 AI models (ChatGPT, Claude, Gemini, Perplexity)
  - 25 saved comparisons
  - 3 synthesis modes (Executive Summary, Consensus, Divergence)
  - File attachments
  - Full template library
  - Export: PDF, JSON, Markdown
  - Community support

### Professional ($34.95/month)
- **Price:** $34.95/month
- **Features:**
  - 8 panes
  - All AI models (unlimited)
  - Unlimited saved comparisons
  - All 7 synthesis modes
  - File attachments
  - Full + custom templates
  - Export: PDF, JSON, Markdown
  - Agentic chains
  - Priority support

### Team ($59.95/month)
- **Price:** $59.95/month
- **Features:**
  - 12 panes
  - All AI models (unlimited)
  - Unlimited saved comparisons
  - All 7 synthesis modes
  - File attachments
  - Full + custom templates
  - Export: PDF, JSON, Markdown
  - Agentic chains
  - Team collaboration (5 seats)
  - Team workspace
  - Shared templates
  - Role-based permissions
  - Usage analytics
  - Priority support

### Enterprise (Custom)
- **Price:** Custom pricing
- **Features:**
  - 16+ panes
  - All AI models + custom
  - Unlimited saved comparisons
  - All 7 synthesis modes + custom
  - File attachments
  - Full team template library
  - Export: PDF, JSON, Markdown
  - Agentic chains
  - Team collaboration
  - SSO
  - API access
  - SLA
  - Custom onboarding
  - Audit logs
  - Dedicated support

---

## 🔧 Stripe Dashboard Setup

### Step 1: Create Products in Stripe

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → **Products**
2. Click **"+ Add product"** for each tier:

#### Creator Product
- **Name:** ProjectCoachAI Creator
- **Description:** For serious coaches & creators
- **Pricing:**
  - **Price:** $14.95
  - **Billing period:** Monthly (recurring)
  - **Currency:** USD
- **Copy the Price ID** (starts with `price_...`)

#### Professional Product
- **Name:** ProjectCoachAI Professional
- **Description:** For AI trainers, analysts, and agencies
- **Pricing:**
  - **Price:** $34.95
  - **Billing period:** Monthly (recurring)
  - **Currency:** USD
- **Copy the Price ID** (starts with `price_...`)

#### Team Product
- **Name:** ProjectCoachAI Team
- **Description:** For small teams, studios, and partnerships (5 seats)
- **Pricing:**
  - **Price:** $59.95
  - **Billing period:** Monthly (recurring)
  - **Currency:** USD
- **Copy the Price ID** (starts with `price_...`)

### Step 2: Get API Keys

**Test Mode Keys (Already Configured):**
- ✅ **Secret key:** `sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy`
- ✅ **Publishable key:** `pk_test_Yt5OzkNXjY81VtFQtU9m3KHC00jkRUCLng`

**Production Mode Keys:**
- ✅ **Publishable key:** `pk_live_IGNQS7HcBdhsOTQvygwT8ME300X0WcDciA` (✅ configured)
- ⏳ **Secret key:** `sk_live_...` (get from Stripe Dashboard → Developers → API keys → Live mode)

### Step 3: Set Up Webhooks

1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Click **"+ Add endpoint"**
3. **Endpoint URL:** `https://your-railway-app.up.railway.app/api/stripe/webhook`
4. **Events to listen to:**
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Webhook Signing Secret** (starts with `whsec_...`)

---

## 🔐 Environment Variables

Add these to your Railway dashboard (or local `.env` file for testing):

```bash
# Stripe Mode (test or production)
STRIPE_MODE=test  # Use 'production' for live mode

# Stripe API Keys
# Test Mode (for development)
STRIPE_SECRET_KEY=sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy  # Test key (✅ configured)
STRIPE_PUBLISHABLE_KEY=pk_test_Yt5OzkNXjY81VtFQtU9m3KHC00jkRUCLng  # Test key (✅ configured)

# Production Mode (for live launch)
# STRIPE_SECRET_KEY=sk_live_...  # Production key (get from Stripe Dashboard)
STRIPE_PUBLISHABLE_KEY=pk_live_IGNQS7HcBdhsOTQvygwT8ME300X0WcDciA  # Production key (✅ configured)

# Webhook Secret
STRIPE_WEBHOOK_SECRET=whsec_...  # Get from Stripe Dashboard → Webhooks (separate for test and production)

# Stripe Price IDs (optional - already configured in code)
# These are optional since Price IDs are hardcoded in stripe-config.js
# But you can override them with environment variables if needed:
STRIPE_TEST_CREATOR_PRICE_ID=price_1Smim8D9SDC8fk3Bn8O6zXh0
STRIPE_TEST_PROFESSIONAL_PRICE_ID=price_1SmioHD9SDC8fk3BJ2ADKiBX
STRIPE_TEST_TEAM_PRICE_ID=price_1SmippD9SDC8fk3B7Aq1DglU
```

**⚠️ Security Note:** 
- Never commit secret keys to version control
- Use environment variables or secure secret management
- Test keys are safe to use in development
- Production keys should only be used in production environment

---

## 📝 Update Code Files

### 1. Update `stripe-config.js`

The file already has the correct prices, but you need to update the Price ID references:

```javascript
lite: {
    // ...
    stripePriceId: process.env.STRIPE_CREATOR_PRICE_ID || 'price_creator_monthly',
    // ...
},
pro: {
    // ...
    stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_professional_monthly',
    // ...
},
team: {
    // ...
    stripePriceId: process.env.STRIPE_TEAM_PRICE_ID || 'price_team_monthly',
    // ...
}
```

### 2. Update `STRIPE_BACKEND_SETUP.md`

The documentation still references old prices. Update it with the new pricing structure.

---

## ✅ Pre-Launch Checklist

- [ ] Create all 3 products in Stripe Dashboard (Creator, Professional, Team)
- [ ] Copy all Price IDs from Stripe
- [ ] Get Stripe API keys (test mode first)
- [ ] Set up webhook endpoint in Stripe
- [ ] Copy webhook signing secret
- [ ] Add all environment variables to Railway
- [ ] Update `stripe-config.js` with actual Price IDs (or use env vars)
- [ ] Test checkout flow with Stripe test card (`4242 4242 4242 4242`)
- [ ] Test subscription verification
- [ ] Test customer portal (manage/cancel subscription)
- [ ] Test webhook handling
- [ ] Switch to live Stripe keys before production launch
- [ ] Test with real payment (small amount) before full launch

---

## 🧪 Testing

### Test Mode
- Use Stripe test keys (`sk_test_...`, `pk_test_...`)
- Use test card: `4242 4242 4242 4242`
- Any future expiry date (e.g., `12/34`)
- Any CVC (e.g., `123`)

### Test Flow
1. User clicks "Upgrade to Creator" ($14.95)
2. Stripe checkout opens in browser
3. User enters test card details
4. Payment succeeds
5. User redirected back to app
6. Subscription verified
7. Tier upgraded in app

---

## 📞 Support

For Stripe-related issues:
- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com)

---

## 🚀 Next Steps

1. **Today:** Set up products in Stripe Dashboard (test mode)
2. **Today:** Get Price IDs and add to environment variables
3. **Tomorrow:** Test full checkout flow
4. **Before Launch:** Switch to live keys and test with real payment

