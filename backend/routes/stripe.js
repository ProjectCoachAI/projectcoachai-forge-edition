// routes/stripe.js - Stripe API Routes
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { sendMail } = require('../lib/emailTransport');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');

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
  liteUnlimited: process.env.STRIPE_LITE_UNLIMITED_PRICE_ID || '',
  // Diary Pro
  'diary-pro-monthly': process.env.STRIPE_DIARY_PRO_MONTHLY || 'price_1TnO15D9SDC8fk3BmqPDbjdd',
  'diary-pro-yearly':  process.env.STRIPE_DIARY_PRO_YEARLY  || 'price_1TnO5LD9SDC8fk3BMOXOndRV',
  // Sweep Pro
  'sweep-pro':         process.env.STRIPE_SWEEP_PRO_MONTHLY || 'price_1TrMESD9SDC8fk3BhhJhp45J',
  'sweep-pro-yearly':  process.env.STRIPE_SWEEP_PRO_YEARLY  || 'price_1TrMO5D9SDC8fk3BABJJdDoe'
};

// ── Per-product entitlement tracking ──────────────────────────────────────────
// A single users.tier column can't represent "subscribed to Sweep AND Forge at
// once" — the most recent purchase just overwrites whatever was there before,
// on every product's profile page, since they all read the same field. This
// table tracks one row per (user, product) instead.
const TIER_TO_PRODUCT = {
  creator: 'forge', professional: 'forge', team: 'forge',
  'creator-yearly': 'forge', 'professional-yearly': 'forge', 'team-yearly': 'forge',
  'lite-unlimited': 'forge',
  'diary-pro-monthly': 'diary', 'diary-pro-yearly': 'diary', 'diary-pro': 'diary',
  'sweep-pro': 'sweep', 'sweep-pro-yearly': 'sweep'
};
function productForTier(tierId) {
  if (!tierId) return null;
  if (TIER_TO_PRODUCT[tierId]) return TIER_TO_PRODUCT[tierId];
  if (tierId.includes('sweep')) return 'sweep';
  if (tierId.includes('diary')) return 'diary';
  if (tierId.includes('excel')) return 'excel';
  if (tierId.includes('document')) return 'documents';
  return 'forge';
}

let _subscriptionsTableEnsured = false;
async function ensureSubscriptionsTable() {
  if (_subscriptionsTableEnsured) return;
  try {
    const db = require('../lib/db');
    await db.query(`CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_email TEXT NOT NULL,
      product TEXT NOT NULL,
      tier TEXT NOT NULL,
      stripe_customer_id TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_email, product)
    )`);
    _subscriptionsTableEnsured = true;
  } catch(_) {}
}

async function upsertSubscription(email, product, tier, customerId, status) {
  if (!email || !product) return false;
  try {
    await ensureSubscriptionsTable();
    const db = require('../lib/db');
    await db.query(
      `INSERT INTO subscriptions (user_email, product, tier, stripe_customer_id, status, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (user_email, product)
       DO UPDATE SET tier=$3, stripe_customer_id=COALESCE($4, subscriptions.stripe_customer_id), status=$5, updated_at=NOW()`,
      [email, product, tier, customerId || null, status || 'active']
    );
    return true;
  } catch(e) { console.warn('[Subscriptions] upsert failed:', e.message); return false; }
}

// GET /api/stripe/subscriptions/mine — per-product entitlements for the current user
router.get('/subscriptions/mine', requireAuth, async (req, res) => {
  try {
    await ensureSubscriptionsTable();
    const db = require('../lib/db');
    const r = await db.query(
      'SELECT product, tier, status FROM subscriptions WHERE user_email=$1 AND status=$2',
      [req.userEmail, 'active']
    );
    const subscriptions = {};
    r.rows.forEach(row => { subscriptions[row.product] = row.tier; });
    res.json({ ok: true, subscriptions });
  } catch(e) {
    console.error('[Subscriptions] mine error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Create Checkout Session
router.post('/create-checkout-session', optionalAuth, async (req, res) => {
  try {
    const { priceId, tierId, successUrl, cancelUrl } = req.body;
    
    const userEmail = req.userEmail || req.body.email || null;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID required' });
    }

    // Check for existing active subscription to prevent duplicates
    const db = require('../lib/db');
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
      ...(userEmail ? { customer_email: userEmail } : {}),
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
          await upsertSubscription(email, productForTier(tierId), tierId, customerId, 'active');
          // Reset diary saves count on upgrade so user starts fresh with unlimited
          if (['creator','professional','team','pro','diary-pro','forge'].some(t => tierId.includes(t))) {
            await db.query('UPDATE users SET diary_saves_count=0 WHERE email=$1', [email]).catch(()=>{});
          }
          console.log(`Checkout complete: ${email} -> ${tierId}`);
          // Send confirmation email to user
          try {
            await sendMail({
              from: '"Diary" <noreply@projectcoachai.com>',
              to: email,
              subject: 'Welcome to Diary Pro 🎉',
              html: '<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;background:#F5F3EE;padding:32px;border-radius:12px">' +
                '<h2 style="color:#1B2A4A;font-size:24px;margin-bottom:8px">You are now on Diary Pro</h2>' +
                '<p style="color:#4A4035;font-size:15px;line-height:1.7">Your AI memory is now unlimited — every answer you save is stored permanently in your personal archive.</p>' +
                '<div style="margin:24px 0">' +
                '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Unlimited saves</p>' +
                '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Lifetime archive — stored permanently</p>' +
                '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Full search across everything</p>' +
                '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Auto-categories &amp; smart tags</p>' +
                '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Quick Answer — ask any AI, save instantly</p>' +
                '</div>' +
                '<a href="https://diary.projectcoachai.com/app.html" style="display:inline-block;padding:12px 24px;background:#C17D3C;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif">Open My Diary →</a>' +
                '<p style="color:#9E9890;font-size:12px;margin-top:24px">Questions? Reply to this email or contact support@projectcoachai.com</p>' +
                '<p style="color:#9E9890;font-size:11px">Xencore Global GmbH · Zürich, Switzerland</p>' +
                '</div>'
            });
          } catch(mailErr) { console.warn('[Stripe] Welcome email failed:', mailErr.message); }
          // Mark referral as converted
          await db.query(
            'UPDATE referral_clicks SET converted=TRUE, signup_email=$1 WHERE signup_email=$1 AND converted=FALSE',
            [email]
          ).catch(e => console.warn('[Referral] convert failed:', e.message));
          // If student — mark is_student in users table
          if (session.discounts?.some(d => d.coupon === 'STUDENT50')) {
            await db.query('UPDATE users SET is_student=TRUE WHERE email=$1', [email])
              .catch(e => console.warn('[Student] flag failed:', e.message));
          }
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
          const userRow = await db.query('SELECT email FROM users WHERE stripe_customer_id=$1', [customerId]);
          const userEmail = userRow.rows[0]?.email;
          if (userEmail) await upsertSubscription(userEmail, productForTier(tierId), tierId, customerId, 'active');
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
        const cancelledTierId = sub.metadata?.tierId || null;
        const product = productForTier(cancelledTierId);
        if (product) {
          const userRow = await db.query('SELECT email FROM users WHERE stripe_customer_id=$1', [sub.customer]);
          const userEmail = userRow.rows[0]?.email;
          if (userEmail) {
            await ensureSubscriptionsTable();
            await db.query(`UPDATE subscriptions SET status='canceled', updated_at=NOW() WHERE user_email=$1 AND product=$2`, [userEmail, product]);
          }
        }
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

// Exposed for the one-off reconciliation script (backend/scripts/reconcile-subscriptions.js)
// so it reuses this exact mapping/upsert logic instead of duplicating it.
router.PRICE_IDS = PRICE_IDS;
router.productForTier = productForTier;
router.upsertSubscription = upsertSubscription;
router.ensureSubscriptionsTable = ensureSubscriptionsTable;

module.exports = router;
