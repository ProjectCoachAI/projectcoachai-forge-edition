// routes/stripe.js - Stripe API Routes
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { sendMail } = require('../lib/emailTransport');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');
const revenue = require('../lib/revenue');

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
  // Diary Pro — updated to the $14.95/mo repricing (from $11.99), and
  // the yearly discount reduced from 30% to 20% (see index.html/app.html
  // for the full reasoning). Confirmed via direct code inspection that
  // this PRICE_IDS mapping is entirely unused/dead for the actual
  // checkout flow — /create-checkout-session below uses whatever
  // priceId the client sends directly, never looks this mapping up at
  // all. Updated anyway for consistency/documentation, since a stale
  // entry here would be actively misleading to anyone reading this file
  // even though it's never read from at runtime. The actual, live price
  // IDs that matter are hardcoded directly in app.html's own
  // startDiaryCheckout().
  'diary-pro-monthly': process.env.STRIPE_DIARY_PRO_MONTHLY || 'price_1UChweD9SDC8fk3Bm9Eemu3z',
  'diary-pro-yearly':  process.env.STRIPE_DIARY_PRO_YEARLY  || 'price_1UChuPD9SDC8fk3BgoMWsUuJ',
  // Sweep Pro
  'sweep-pro':         process.env.STRIPE_SWEEP_PRO_MONTHLY || 'price_1TrMESD9SDC8fk3BhhJhp45J',
  'sweep-pro-yearly':  process.env.STRIPE_SWEEP_PRO_YEARLY  || 'price_1TrMO5D9SDC8fk3BABJJdDoe'
};

// ── Stripe Tax ────────────────────────────────────────────────────────────────
// Off by default. Set STRIPE_TAX_ENABLED=true in Railway only AFTER Stripe Tax
// is set up in the Stripe Dashboard (origin address, default tax behaviour =
// exclusive, matching the current prices, and at least one registration). If this were on before that, Stripe would reject
// every checkout. With it on, Checkout calculates VAT/GST/sales tax from the
// customer's billing address, asks business customers for a VAT/tax ID (so EU
// reverse charge works) and puts the tax on the invoice.
const STRIPE_TAX_ENABLED = process.env.STRIPE_TAX_ENABLED === 'true';
function taxCheckoutParams() {
  if (!STRIPE_TAX_ENABLED) return {};
  return {
    automatic_tax: { enabled: true },
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true }
  };
}

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

// ── Which plan a price buys ───────────────────────────────────────────────────
// The browser tells us both a priceId and a tierId when it starts checkout.
// The tierId is what the webhook later writes to users.tier, so it must never be
// taken on trust: someone could pay for Diary Pro and claim 'team'. Each price we
// sell is registered here with the plan it buys. A price that is not listed is
// refused. A tierId that does not belong to the price is replaced by the price's
// own plan. 'canonical' is the plain plan name the rest of the backend already
// recognises; 'accepts' also lists the spelling existing pages send.
const PRICE_PLANS = {};
function registerPrice(priceId, canonical, ...alsoAccept) {
  if (!priceId) return;
  PRICE_PLANS[priceId] = { tier: canonical, accepts: [canonical, ...alsoAccept] };
}
registerPrice(PRICE_IDS.creator,        'creator');
registerPrice(PRICE_IDS.professional,   'professional', 'work-like-a-pro');
registerPrice(PRICE_IDS.team,           'team');
registerPrice(PRICE_IDS['creator-yearly'],      'creator',      'creator-yearly');
registerPrice(PRICE_IDS['professional-yearly'], 'professional', 'professional-yearly', 'work-like-a-pro');
registerPrice(PRICE_IDS['team-yearly'],         'team',         'team-yearly');
registerPrice(PRICE_IDS['diary-pro-monthly'], 'diary-pro', 'diary-pro-monthly');
registerPrice(PRICE_IDS['diary-pro-yearly'],  'diary-pro', 'diary-pro-yearly');
registerPrice(PRICE_IDS['sweep-pro'],         'sweep-pro');
registerPrice(PRICE_IDS['sweep-pro-yearly'],  'sweep-pro', 'sweep-pro-yearly');
// Any other price that is sold through this endpoint (for example a product not
// listed above) is added in Railway without a code change:
//   STRIPE_EXTRA_PRICES = price_xxx:excel-pro,price_yyy:documents-pro
(process.env.STRIPE_EXTRA_PRICES || '').split(',').forEach(pair => {
  const [pid, tier] = pair.split(':').map(x => (x || '').trim());
  if (pid && tier) registerPrice(pid, tier);
});

// The plan a live subscription is on, taken from the price it is actually billed
// for. This matters when a customer changes plan in Stripe's own portal: the
// subscription's saved metadata still names the old plan, the price does not lie.
function tierFromSubscription(sub) {
  try {
    const item = sub && sub.items && sub.items.data && sub.items.data[0];
    const plan = item && item.price && PRICE_PLANS[item.price.id];
    if (plan) {
      const meta = sub.metadata && sub.metadata.tierId;
      return plan.accepts.includes(meta) ? meta : plan.tier;
    }
  } catch (_) {}
  return (sub && sub.metadata && sub.metadata.tierId) || null;
}

// Returns { tier, corrected } for a price, or null if we don't sell that price.
function resolvePlan(priceId, claimedTier) {
  const plan = PRICE_PLANS[priceId];
  if (!plan) return null;
  if (claimedTier && plan.accepts.includes(claimedTier)) return { tier: claimedTier, corrected: false };
  return { tier: plan.tier, corrected: true };
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
    const { priceId, tierId: claimedTierId, successUrl, cancelUrl } = req.body;
    
    const userEmail = req.userEmail || req.body.email || null;

    if (!priceId) {
      return res.status(400).json({ error: 'Price ID required' });
    }

    // The plan comes from the price, never from the browser (see PRICE_PLANS).
    const plan = resolvePlan(priceId, claimedTierId);
    if (!plan) {
      console.warn('[Stripe] checkout refused: unknown priceId=' + priceId + ' claimedTier=' + claimedTierId + ' user=' + (userEmail || 'anonymous'));
      return res.status(400).json({
        error: 'This plan is not available right now. Please contact support@projectcoachai.com.',
        code: 'UNKNOWN_PRICE'
      });
    }
    const tierId = plan.tier;
    if (plan.corrected) {
      console.warn('[Stripe] tier corrected from price: priceId=' + priceId + ' claimed=' + claimedTierId + ' using=' + tierId + ' user=' + (userEmail || 'anonymous'));
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
      // users.tier only shows the most recent purchase, so someone who bought
      // Diary Pro and then Sweep would pass the check above and could buy Diary
      // Pro a second time. The per-product table keeps one row per product.
      try {
        await ensureSubscriptionsTable();
        const have = await db.query(
          "SELECT tier FROM subscriptions WHERE user_email=$1 AND product=$2 AND status='active'",
          [userEmail, productForTier(tierId)]
        );
        if (have.rows[0] && have.rows[0].tier === tierId) {
          return res.status(400).json({
            error: 'You already have an active ' + tierId + ' subscription. Please manage your subscription in your Profile instead of purchasing again.',
            code: 'ALREADY_SUBSCRIBED'
          });
        }
      } catch (e) {
        console.warn('[Stripe] per-product duplicate check failed (continuing):', e.message);
      }
      // If user has existing Stripe customer, use it
      if (user?.stripe_customer_id) {
        req.body.existingCustomerId = user.stripe_customer_id;
      }
    }
    
    // Auto-apply STUDENT50 coupon for verified students
    const isStudent = !!(await db.query('SELECT is_student FROM users WHERE email=$1', [userEmail]).then(r => r.rows[0]?.is_student).catch(() => false));
    const studentDiscount = isStudent ? { discounts: [{ coupon: 'STUDENT50' }] } : {};

    // Diary is sold on its own, so its checkout says "Diary" and returns to Diary.
    const isDiaryPurchase = productForTier(tierId) === 'diary';
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
      ...taxCheckoutParams(),
      custom_text: {
        submit: {
          message: isDiaryPurchase
            ? 'Diary by Xencore Global GmbH'
            : 'ProjectCoachAI Forge Edition by Xencore Global GmbH'
        }
      },
      success_url: successUrl || (isDiaryPurchase
        ? 'https://diary.projectcoachai.com/app.html?upgraded=true'
        : 'https://forge.projectcoachai.com/pricing.html?session_id={CHECKOUT_SESSION_ID}'),
      cancel_url: cancelUrl || (isDiaryPurchase
        ? 'https://diary.projectcoachai.com/app.html'
        : 'https://forge.projectcoachai.com/pricing.html?canceled=true'),
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
      ...taxCheckoutParams(),
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
// Requires a login. The customer is always the logged-in user's own Stripe
// customer; a customerId in the request is ignored (it used to be trusted, so
// anyone who knew an ID could open that customer's billing portal).
router.post('/create-portal-session', requireAuth, async (req, res) => {
  try {
    const { customerId: requestedCustomerId, returnUrl } = req.body || {};
    const db = require('../lib/db');
    const own = await db.query('SELECT stripe_customer_id FROM users WHERE email=$1', [req.userEmail]);
    const customerId = own.rows[0] && own.rows[0].stripe_customer_id;
    if (!customerId) {
      return res.status(404).json({ error: 'No billing account was found for this login.' });
    }
    if (requestedCustomerId && requestedCustomerId !== customerId) {
      console.warn('[Stripe] portal: request named a different customer than the logged-in user\'s; using the user\'s own. user=' + req.userEmail);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || defaultPortalReturn(req),
    });
    
    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Where "Return to ..." in the billing portal goes when the page did not say.
// Web visitors land back on the site they came from. The desktop-app link stays
// the fallback for requests that do not come from a browser page.
function defaultPortalReturn(req) {
  let host = '';
  try { host = new URL(req.get('origin') || req.get('referer') || '').hostname; } catch (_) {}
  if (host === 'diary.projectcoachai.com') return 'https://diary.projectcoachai.com/profile';
  if (host === 'forge.projectcoachai.com') return 'https://forge.projectcoachai.com/profile.html';
  return 'projectcoachai://subscription-managed';
}

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
          // Welcome email: this one is written for Diary Pro, so it is only sent
          // for a Diary purchase (it used to go to every buyer, Forge and Sweep
          // included). The list matches what Diary Pro actually adds.
          if (productForTier(tierId) === 'diary') {
            try {
              await sendMail({
                from: '"Diary" <noreply@projectcoachai.com>',
                to: email,
                subject: 'Welcome to Diary Pro 🎉',
                html: '<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;background:#F5F3EE;padding:32px;border-radius:12px">' +
                  '<h2 style="color:#1B2A4A;font-size:24px;margin-bottom:8px">You are now on Diary Pro</h2>' +
                  '<p style="color:#4A4035;font-size:15px;line-height:1.7">Thank you for upgrading. Here is what Diary Pro adds to your free plan:</p>' +
                  '<div style="margin:24px 0">' +
                  '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Unlimited search across your whole diary</p>' +
                  '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Unlimited Continue Conversation on your saved entries</p>' +
                  '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Much longer continued conversations</p>' +
                  '<p style="color:#4A4035;font-size:14px;margin-bottom:8px">✓ Unlimited Listen</p>' +
                  '</div>' +
                  '<p style="color:#4A4035;font-size:14px;line-height:1.7">Saving stays free and unlimited, as before, and your diary is stored permanently.</p>' +
                  '<a href="https://diary.projectcoachai.com/app.html" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#C17D3C;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-family:sans-serif">Open My Diary →</a>' +
                  '<p style="color:#9E9890;font-size:12px;margin-top:24px">Questions? Reply to this email or contact support@projectcoachai.com</p>' +
                  '<p style="color:#9E9890;font-size:11px">Xencore Global GmbH · Zürich, Switzerland</p>' +
                  '</div>'
              });
            } catch(mailErr) { console.warn('[Stripe] Welcome email failed:', mailErr.message); }
          }
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
      const tierId = tierFromSubscription(sub) || 'starter';
      const customerId = sub.customer;
      if (customerId && sub.status === 'active') {
        try {
          const db = require('../lib/db');
          const userRow = await db.query('SELECT email, tier FROM users WHERE stripe_customer_id=$1', [customerId]);
          const userEmail = userRow.rows[0]?.email;
          const currentTier = userRow.rows[0]?.tier;
          // users.tier holds one value, so it is only changed when this update is
          // for the same product it already shows (a plan change), or when the
          // user is on the free tier. Otherwise a renewal or change on an older
          // product would overwrite a newer one. The per-product table below is
          // always updated.
          const sameProduct = !currentTier || currentTier === 'starter' || productForTier(currentTier) === productForTier(tierId);
          if (sameProduct) {
            await db.query('UPDATE users SET tier=$1, stripe_customer_id=$2 WHERE stripe_customer_id=$2', [tierId, customerId]);
          }
          console.log(`Subscription updated: ${customerId} -> ${tierId}${sameProduct ? '' : ' (users.tier left as is: different product)'}`);
          if (userEmail) await upsertSubscription(userEmail, productForTier(tierId), tierId, customerId, 'active');
        } catch(err) { console.error('DB update failed:', err.message); }
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      try {
        const db = require('../lib/db');
        const cancelledTierId = tierFromSubscription(sub);
        const product = productForTier(cancelledTierId);
        const userRow = await db.query('SELECT email FROM users WHERE stripe_customer_id=$1', [sub.customer]);
        const userEmail = userRow.rows[0]?.email;
        let newTier = 'starter';
        if (product && userEmail) {
          await ensureSubscriptionsTable();
          await db.query(`UPDATE subscriptions SET status='canceled', updated_at=NOW() WHERE user_email=$1 AND product=$2`, [userEmail, product]);
          // The user may still hold another product (for example Forge as well as
          // Diary). users.tier then shows that one instead of dropping to free.
          const left = await db.query(
            `SELECT tier FROM subscriptions WHERE user_email=$1 AND status='active' ORDER BY updated_at DESC LIMIT 1`,
            [userEmail]
          );
          if (left.rows[0]) newTier = left.rows[0].tier;
        }
        await db.query('UPDATE users SET tier=$1 WHERE stripe_customer_id=$2', [newTier, sub.customer]);
        console.log(`Subscription cancelled: ${sub.customer} -> ${newTier}`);
      } catch(err) { console.error('DB update failed:', err.message); }
      break;
    }
    case 'invoice.payment_succeeded': {
      // Revenue is recorded without the tax collected for the tax authority.
      // See lib/revenue.js for the rules.
      const invoice = event.data.object;
      try {
        const db = require('../lib/db');
        const out = await revenue.recordInvoice(db, invoice);
        console.log('Revenue tracked:', invoice.id, out.recorded ? ('$' + out.amount) : ('skipped: ' + out.reason));
      } catch(err) { console.error('Revenue tracking failed:', err.message); }
      break;
    }
    case 'credit_note.created': {
      // A refund: recorded as negative revenue so refunded payments stop counting.
      const cn = event.data.object;
      try {
        const db = require('../lib/db');
        const out = await revenue.recordCreditNote(db, cn);
        console.log('Credit note tracked:', cn.id, out.recorded ? ('-$' + out.amount) : ('skipped: ' + out.reason));
      } catch(err) { console.error('Credit note tracking failed:', err.message); }
      break;
    }
    case 'charge.refunded': {
      // A refund made directly on a payment (no credit note). Booked as negative revenue.
      const charge = event.data.object;
      try {
        const db = require('../lib/db');
        for (const rf of ((charge.refunds && charge.refunds.data) || [])) {
          const out = await revenue.recordRefund(stripe, db, rf, charge);
          console.log('Refund tracked:', rf.id, out.recorded ? ('-$' + out.amount) : ('skipped: ' + out.reason));
        }
      } catch(err) { console.error('Refund tracking failed:', err.message); }
      break;
    }
    case 'invoice.payment_failed':
      console.log('Payment failed:', event.data.object.id); break;
  }
  res.json({ received: true });
});

// GET /api/stripe/revenue?period=day|week|month|quarter|year — admin revenue summary.
// Revenue excludes VAT and subtracts refunds; accounts named in the
// INTERNAL_ACCOUNT_EMAILS / INTERNAL_ACCOUNT_DOMAINS variables are reported
// separately under `internal` and left out of every headline figure.
router.get('/revenue', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require('../lib/db');
    const period = ['day', 'week', 'month', 'quarter', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const isInternal = revenue.loadInternalFilter();
    await revenue.fillMissingEmails(db, stripe).catch(e => console.warn('[Revenue] email fill:', e.message));
    const summary = await revenue.summarise(db, period, isInternal);
    let mrr = { mrr: null, arr: null, subscribers: null, cancelling: 0, nonUsd: 0, internal: null, error: null };
    try { mrr = await revenue.computeMrr(stripe, isInternal); }
    catch (e) { console.warn('[Revenue] MRR from Stripe failed:', e.message); mrr.error = 'MRR unavailable'; }
    res.json({
      ok: true, ...summary,
      mrr: mrr.mrr, arr: mrr.arr, subscribers: mrr.subscribers,
      cancelling: mrr.cancelling, nonUsdSubscriptions: mrr.nonUsd,
      internalMrr: mrr.internal, mrrError: mrr.error || undefined,
      internalFilterConfigured: !!(process.env.INTERNAL_ACCOUNT_EMAILS || process.env.INTERNAL_ACCOUNT_DOMAINS)
    });
  } catch(e) {
    console.error('[Revenue]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/stripe/revenue/resync — rebuild revenue_events from Stripe (paid
// invoices and credit notes). Idempotent; use after deploying this change to pick
// up refunds issued earlier, or any time a webhook may have been missed.
// Body: { days: 400 } (how far back, max 1500).
router.post('/revenue/resync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const db = require('../lib/db');
    const days = Math.min(Math.max(parseInt(req.body && req.body.days, 10) || 400, 1), 1500);
    const out = await revenue.resync(stripe, db, new Date(Date.now() - days * 86400000));
    res.json({ ok: true, days, ...out });
  } catch(e) {
    console.error('[Revenue resync]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Exposed for the one-off reconciliation script (backend/scripts/reconcile-subscriptions.js)
// so it reuses this exact mapping/upsert logic instead of duplicating it.
router.PRICE_IDS = PRICE_IDS;
router.productForTier = productForTier;
router.resolvePlan = resolvePlan;
router.tierFromSubscription = tierFromSubscription;
router.PRICE_PLANS = PRICE_PLANS;
router.upsertSubscription = upsertSubscription;
router.ensureSubscriptionsTable = ensureSubscriptionsTable;

module.exports = router;
