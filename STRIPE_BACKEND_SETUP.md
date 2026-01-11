# Stripe Backend API Setup for Railway

## 🎯 Overview

Your Electron app needs a backend API to handle Stripe checkout sessions securely. This guide shows you how to add Stripe endpoints to your Railway proxy server.

---

## 📦 Required Dependencies

Add to your Railway server's `package.json`:

```json
{
  "dependencies": {
    "stripe": "^14.0.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  }
}
```

---

## 🔑 Environment Variables

In Railway dashboard, add these environment variables:

```
STRIPE_MODE=test  # Use 'production' for live mode

# Test Mode Keys (for development)
STRIPE_SECRET_KEY=sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy  # Test key (✅ configured)
STRIPE_PUBLISHABLE_KEY=pk_test_Yt5OzkNXjY81VtFQtU9m3KHC00jkRUCLng  # Test key (✅ configured)

# Production Mode Keys (for live launch)
# STRIPE_SECRET_KEY=sk_live_...  # Production key (get from Stripe Dashboard)
STRIPE_PUBLISHABLE_KEY=pk_live_IGNQS7HcBdhsOTQvygwT8ME300X0WcDciA  # Production key (✅ configured)

# Webhook Secret (separate for test and production)
STRIPE_WEBHOOK_SECRET=whsec_...  # Get from Stripe Dashboard → Webhooks
```

**⚠️ Security Note:** 
- Never commit secret keys to version control
- Test keys are safe for development
- Production keys should only be used in production environment

---

## 📝 Stripe API Routes

Add these routes to your Railway server (`routes/stripe.js`):

```javascript
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Price IDs from Stripe Dashboard (create these in Stripe)
const PRICE_IDS = {
  creator: process.env.STRIPE_CREATOR_PRICE_ID || 'price_xxxxx', // Replace with actual Price ID
  professional: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_xxxxx', // Replace with actual Price ID
  team: process.env.STRIPE_TEAM_PRICE_ID || 'price_xxxxx'   // Replace with actual Price ID
};

// Create Checkout Session
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, tierId, successUrl, cancelUrl } = req.body;
    
    if (!priceId) {
      return res.status(400).json({ error: 'Price ID required' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || 'projectcoachai://subscription-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'projectcoachai://subscription-cancel',
      metadata: {
        tierId: tierId,
        userId: req.headers['x-user-id'] || 'anonymous'
      },
      subscription_data: {
        metadata: {
          tierId: tierId
        }
      }
    });
    
    res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verify Checkout Session
router.get('/verify-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid' && session.subscription) {
      // Get subscription details
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      
      // Get tier from metadata
      const tierId = session.metadata?.tierId || subscription.metadata?.tierId;
      
      res.json({
        success: true,
        tier: tierId,
        customerId: session.customer,
        subscriptionId: session.subscription,
        expiresAt: subscription.current_period_end * 1000 // Convert to milliseconds
      });
    } else {
      res.json({
        success: false,
        error: 'Payment not completed'
      });
    }
  } catch (error) {
    console.error('Session verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Customer Portal Session
router.post('/create-portal-session', async (req, res) => {
  try {
    const { customerId, returnUrl } = req.body;
    
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID required' });
    }
    
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || 'projectcoachai://subscription-managed',
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook Handler (for subscription updates)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle subscription events
  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      // Update user's subscription in your database
      // For now, we'll just log it
      console.log('Subscription updated:', subscription.id);
      break;
    
    case 'invoice.payment_succeeded':
      // Subscription payment succeeded
      console.log('Payment succeeded');
      break;
    
    case 'invoice.payment_failed':
      // Payment failed - notify user
      console.log('Payment failed');
      break;
  }
  
  res.json({ received: true });
});

module.exports = router;
```

---

## 🔧 Integration with Main Server

In your main `server.js`:

```javascript
const stripeRoutes = require('./routes/stripe');
app.use('/api/stripe', stripeRoutes);
```

---

## 📋 Stripe Dashboard Setup

### 1. Create Products & Prices

1. Go to Stripe Dashboard → Products
2. Create products:
   - **ProjectCoachAI Creator** - $14.95/month (recurring)
   - **ProjectCoachAI Professional** - $34.95/month (recurring)
   - **ProjectCoachAI Team** - $59.95/month (recurring)
3. Copy the **Price IDs** (starts with `price_...`)
4. Add to Railway environment variables:
   - `STRIPE_CREATOR_PRICE_ID=price_xxxxx`
   - `STRIPE_PROFESSIONAL_PRICE_ID=price_xxxxx`
   - `STRIPE_TEAM_PRICE_ID=price_xxxxx`

### 2. Set Up Webhooks

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-railway-app.up.railway.app/api/stripe/webhook`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy the **Webhook Signing Secret** (starts with `whsec_...`)
5. Add to Railway: `STRIPE_WEBHOOK_SECRET=whsec_xxxxx`

### 3. Get API Keys

1. Go to Stripe Dashboard → Developers → API keys
2. Copy:
   - **Publishable key** (starts with `pk_...`)
   - **Secret key** (starts with `sk_...`)
3. Add to Railway:
   - `STRIPE_PUBLISHABLE_KEY=pk_xxxxx`
   - `STRIPE_SECRET_KEY=sk_xxxxx`

---

## 🔄 Update Electron App

Update `stripe-client.js` to use your Railway URL:

```javascript
constructor(baseURL, userId) {
    // Change to your Railway URL
    this.baseURL = baseURL || 'https://your-project.up.railway.app';
    this.userId = userId || 'local-user';
}
```

---

## ✅ Testing Flow

1. **Test Mode:**
   - Use Stripe test keys (`sk_test_...`, `pk_test_...`)
   - Use test card: `4242 4242 4242 4242`
   - Any future expiry date, any CVC

2. **Test Subscription:**
   - User clicks "Upgrade to Lite"
   - Stripe checkout opens
   - User enters test card
   - Payment succeeds
   - User redirected back to app
   - Subscription verified
   - Tier upgraded

3. **Test Customer Portal:**
   - User clicks "Manage Subscription"
   - Portal opens
   - User can cancel/update subscription

---

## 🚀 Production Checklist

- [ ] Create Stripe account
- [ ] Create products & prices in Stripe
- [ ] Get Price IDs
- [ ] Set up webhooks
- [ ] Add environment variables to Railway
- [ ] Deploy Stripe routes to Railway
- [ ] Test checkout flow
- [ ] Test webhook handling
- [ ] Switch to live Stripe keys
- [ ] Test with real payment

---

## 💡 Quick Start

1. **Add Stripe routes to Railway server**
2. **Create products in Stripe Dashboard**
3. **Add environment variables to Railway**
4. **Deploy and test!**

The Electron app is already wired up - it just needs the backend API endpoints! 🚀










