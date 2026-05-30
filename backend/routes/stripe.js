// routes/stripe.js - Stripe API Routes
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Price IDs from stripe-config.js (matching the Forge app configuration)
const PRICE_IDS = {
  // Monthly prices
  creator:      process.env.STRIPE_MONTHLY_DECIDE_FASTER    || 'price_1SmiW2D9SDC8fk3BeVx8z6Cq',
  professional: process.env.STRIPE_MONTHLY_WORK_LIKE_A_PRO  || 'price_1SmicRD9SDC8fk3Bu7lTCFyw',
  team:         process.env.STRIPE_MONTHLY_RUN_A_TEAM       || 'price_1SmifSD9SDC8fk3Bujjy1Nsh',
  // Yearly prices
  'creator-yearly':      process.env.STRIPE_YEARLY_DECIDE_FASTER    || 'price_1TVJBOD9SDC8fk3BaAi0uiCo',
  'professional-yearly': process.env.STRIPE_YEARLY_WORK_LIKE_A_PRO  || 'price_1TVJxZD9SDC8fk3Bpxiia6YM',
  'team-yearly':         process.env.STRIPE_YEARLY_RUN_A_TEAM       || 'price_1TVK0CD9SDC8fk3BEff3fuXq',
  liteUnlimited: process.env.STRIPE_LITE_UNLIMITED_PRICE_ID || ''
};

// Create Checkout Session
router.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, tierId, successUrl, cancelUrl } = req.body;
    
    if (!priceId) {
      return res.status(400).json({ error: 'Price ID required' });
    }

    // Check for existing active subscription to prevent duplicates
    const db = require('../lib/db');
    const userEmail = req.body.email || req.userEmail;
    if (userEmail && tierId) {
      const existing = await db.query('SELECT tier, stripe_customer_id FROM users WHERE email=$1', [userEmail]);
      const user = existing.rows[0];
      if (user && user.tier === tierId) {
        return res.status(400).json({ 
          error: 'You already have an active ' + tierId + ' subscription. Please manage your subscription in your Profile instead of purchasing again.',
          code: 'ALREADY_SUBSCRIBED'
        });
      }
      // If user has existing Stripe customer, use it
      if (user?.stripe_customer_id) {
        req.body.existingCustomerId = user.stripe_customer_id;
      }
    }
    
    // Auto-apply STUDENT50 coupon for verified students
    const isStudent = !!(await db.query('SELECT is_student FROM users WHERE email=$1', [userEmail]).then(r => r.rows[0]?.is_student).catch(() => false));
    const studentDiscount = isStudent ? { discounts: [{ coupon: 'STUDENT50' }] } : {};

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
      success_url: successUrl || 'https://forge.projectcoachai.com/pricing.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://forge.projectcoachai.com/pricing.html?canceled=true',
      metadata: {
        tierId: tierId,
        userId: req.headers['x-user-id'] || 'anonymous'
      },
      subscription_data: {
        metadata: {
          tierId: tierId
        }
      },
      ...studentDiscount,
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
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      try {
        const db = require('../lib/db');
        const amount = invoice.amount_paid / 100; // convert from cents
        const stripeFee = parseFloat((amount * 0.029 + 0.30).toFixed(2));
        const net = parseFloat((amount - stripeFee).toFixed(2));
        const ym = new Date(invoice.created * 1000).toISOString().slice(0, 7);
        await db.query(`
          INSERT INTO revenue_events(stripe_invoice_id, customer_id, amount_gross, stripe_fee, amount_net, year_month, created_at)
          VALUES($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT (stripe_invoice_id) DO NOTHING`,
          [invoice.id, invoice.customer, amount, stripeFee, net, ym, new Date(invoice.created*1000).toISOString()]
        );
        console.log('Revenue tracked:', invoice.id, '$' + amount);
      } catch(err) { console.error('Revenue tracking failed:', err.message); }
      break;
    }
    case 'invoice.payment_failed':
      console.log('Payment failed:', event.data.object.id); break;
  }
  res.json({ received: true });
});

// GET /api/stripe/revenue — admin revenue summary
const { requireAuth, requireAdmin } = require('../middleware/auth');
router.get('/revenue', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require('../lib/db');
    // Ensure table exists
    await db.query(`CREATE TABLE IF NOT EXISTS revenue_events (
      stripe_invoice_id TEXT PRIMARY KEY,
      customer_id TEXT,
      amount_gross NUMERIC,
      stripe_fee NUMERIC,
      amount_net NUMERIC,
      year_month TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(()=>{});

    const period = req.query.period || 'month';
    const now = new Date();
    let ym;
    switch(period) {
      case 'day':   ym = now.toISOString().slice(0,10); break;
      case 'year':  ym = now.getFullYear().toString(); break;
      default:      ym = now.toISOString().slice(0,7);
    }

    const r = await db.query(
      `SELECT SUM(amount_gross) as gross, SUM(stripe_fee) as fees, SUM(amount_net) as net, COUNT(*) as payments
       FROM revenue_events WHERE year_month LIKE $1`,
      [ym + '%']
    );
    const row = r.rows[0] || {};

    // Get MRR from active subscribers
    const subs = await db.query(
      `SELECT tier, COUNT(*) as cnt FROM users WHERE tier NOT IN ('starter','free') AND tier IS NOT NULL GROUP BY tier`
    );
    const TIER_PRICES = { starter:0, lite:9.95, creator:14.95, professional:34.95, 'work-like-a-pro':34.95, pro:34.95, team:59.95, enterprise:99.95 };
    const mrr = subs.rows.reduce((sum, row) => sum + (TIER_PRICES[row.tier] || 0) * parseInt(row.cnt), 0);

    res.json({
      ok: true,
      period,
      gross: parseFloat(row.gross || 0).toFixed(2),
      fees:  parseFloat(row.fees  || 0).toFixed(2),
      net:   parseFloat(row.net   || 0).toFixed(2),
      payments: parseInt(row.payments || 0),
      mrr:   parseFloat(mrr).toFixed(2),
      arr:   parseFloat(mrr * 12).toFixed(2),
      subscribers: subs.rows
    });
  } catch(e) {
    console.error('[Revenue]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
