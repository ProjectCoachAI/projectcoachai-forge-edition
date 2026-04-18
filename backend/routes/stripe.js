// routes/stripe.js - Stripe API Routes
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Price IDs from stripe-config.js (matching the Forge app configuration)
const PRICE_IDS = {
  creator: process.env.STRIPE_TEST_CREATOR_PRICE_ID || 'price_1SmiW2D9SDC8fk3BeVx8z6Cq',
  professional: process.env.STRIPE_TEST_PROFESSIONAL_PRICE_ID || 'price_1SmicRD9SDC8fk3Bu7lTCFyw',
  team: process.env.STRIPE_TEST_TEAM_PRICE_ID || 'price_1SmifSD9SDC8fk3Bujjy1Nsh',
  liteUnlimited: process.env.STRIPE_LITE_UNLIMITED_PRICE_ID || ''
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
      custom_text: {
        submit: {
          message: 'ProjectCoachAI Forge Edition by Xencore Global GmbH'
        }
      },
      success_url: successUrl || 'https://projectcoachai.com/pricing.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://projectcoachai.com/pricing.html?canceled=true',
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

// Forge Lite Unlimited — Checkout
router.post('/lite-unlimited-checkout', async (req, res) => {
  try {
    const priceId = PRICE_IDS.liteUnlimited;
    if (!priceId) {
      return res.status(503).json({
        error: 'Lite Unlimited is not yet available. Coming soon!'
      });
    }

    const origin = req.headers.origin || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      custom_text: {
        submit: {
          message: 'ProjectCoachAI Forge Edition by Xencore Global GmbH'
        }
      },
      success_url: `${origin}/?lite_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?lite_checkout=cancelled`,
      metadata: {
        tierId: 'lite-unlimited',
        source: 'forge-lite'
      },
      subscription_data: {
        metadata: { tierId: 'lite-unlimited' }
      }
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Lite Unlimited checkout error:', error);
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
    case 'checkout.session.completed': {
      const session = event.data.object;
      const customerId = session.customer;
      const tierId = session.metadata?.tierId || 'starter';
      const email = session.customer_details?.email || session.customer_email;
      if (email) {
        try {
          const db = require('../lib/db');
          await db.query('UPDATE users SET tier=$1, stripe_customer_id=$2 WHERE email=$3', [tierId, customerId, email]);
          console.log(`Checkout complete: ${email} -> ${tierId}`);
        } catch(err) { console.error('DB update failed:', err.message); }
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const tierId = sub.metadata?.tierId || 'starter';
      const customerId = sub.customer;
      if (customerId && sub.status === 'active') {
        try {
          const db = require('../lib/db');
          await db.query('UPDATE users SET tier=$1, stripe_customer_id=$2 WHERE stripe_customer_id=$2', [tierId, customerId]);
          console.log(`Subscription updated: ${customerId} -> ${tierId}`);
        } catch(err) { console.error('DB update failed:', err.message); }
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      try {
        const db = require('../lib/db');
        await db.query('UPDATE users SET tier=$1 WHERE stripe_customer_id=$2', ['starter', sub.customer]);
        console.log(`Subscription cancelled: ${sub.customer} -> starter`);
      } catch(err) { console.error('DB update failed:', err.message); }
      break;
    }
    case 'invoice.payment_succeeded':
      console.log('Payment succeeded:', event.data.object.id); break;
    case 'invoice.payment_failed':
      console.log('Payment failed:', event.data.object.id); break;
  }
  res.json({ received: true });
});

module.exports = router;
