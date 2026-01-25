// routes/stripe.js - Stripe API Routes
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Price IDs from stripe-config.js (matching the Forge app configuration)
const PRICE_IDS = {
  creator: process.env.STRIPE_TEST_CREATOR_PRICE_ID || 'price_1Smim8D9SDC8fk3Bn8O6zXh0',
  professional: process.env.STRIPE_TEST_PROFESSIONAL_PRICE_ID || 'price_1SmioHD9SDC8fk3BJ2ADKiBX',
  team: process.env.STRIPE_TEST_TEAM_PRICE_ID || 'price_1SmippD9SDC8fk3B7Aq1DglU'
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
