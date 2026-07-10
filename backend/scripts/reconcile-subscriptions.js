#!/usr/bin/env node
'use strict';
/**
 * One-time reconciliation: backfill the `subscriptions` table directly from
 * Stripe's own records — NOT from users.tier, since that column was already
 * overwritten for accounts that hold more than one product's subscription
 * (a single tier string can't represent "Sweep Pro AND Forge" at once).
 *
 * Stripe is the actual source of truth for what someone is paying for, so this
 * reads every active subscription from Stripe directly and upserts the correct
 * (user_email, product) row for each one.
 *
 * Safe to re-run: upserts are idempotent (UNIQUE(user_email, product),
 * ON CONFLICT DO UPDATE) — running this twice just re-confirms the same data.
 *
 * Usage:
 *   node scripts/reconcile-subscriptions.js
 *
 * Requires STRIPE_SECRET_KEY and DATABASE_URL to already be set in the
 * environment (same as the running backend — e.g. `railway run node
 * scripts/reconcile-subscriptions.js` if running against Railway's env).
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const {
  PRICE_IDS,
  productForTier,
  upsertSubscription,
  ensureSubscriptionsTable
} = require('../routes/stripe');

// Reverse map: Stripe Price ID -> our tierId, for older subscriptions that
// predate metadata.tierId being attached at checkout time.
const PRICE_ID_TO_TIER = {};
Object.entries(PRICE_IDS).forEach(([tierId, priceId]) => {
  if (priceId) PRICE_ID_TO_TIER[priceId] = tierId;
});

function resolveTierId(subscription) {
  if (subscription.metadata && subscription.metadata.tierId) {
    return subscription.metadata.tierId;
  }
  const priceId = subscription.items && subscription.items.data &&
    subscription.items.data[0] && subscription.items.data[0].price &&
    subscription.items.data[0].price.id;
  return priceId ? (PRICE_ID_TO_TIER[priceId] || null) : null;
}

async function run() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set in the environment. Aborting.');
    process.exit(1);
  }

  await ensureSubscriptionsTable();

  let processed = 0, upserted = 0, failed = 0, skippedNoEmail = 0;
  const unresolved = []; // subscriptions we couldn't map to a tierId — needs manual review
  let startingAfter;

  console.log('Fetching active Stripe subscriptions...\n');

  while (true) {
    const page = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: startingAfter,
      expand: ['data.customer']
    });

    for (const sub of page.data) {
      processed++;
      const customer = sub.customer;
      const email = typeof customer === 'object' && customer ? customer.email : null;

      if (!email) {
        skippedNoEmail++;
        console.warn(`  ! Skipped ${sub.id} — no customer email on file`);
        continue;
      }

      const tierId = resolveTierId(sub);
      if (!tierId) {
        unresolved.push({ id: sub.id, email, priceId: sub.items?.data?.[0]?.price?.id || null });
        console.warn(`  ! Skipped ${sub.id} (${email}) — could not resolve a tierId (unknown price, no metadata)`);
        continue;
      }

      const product = productForTier(tierId);
      const customerId = typeof customer === 'object' ? customer.id : customer;
      const ok = await upsertSubscription(email, product, tierId, customerId, 'active');
      if (ok) {
        upserted++;
        console.log(`  \u2713 ${email} -> ${product} (${tierId})`);
      } else {
        failed++;
        console.error(`  \u2717 ${email} -> ${product} (${tierId}) — DATABASE WRITE FAILED, see warning above`);
      }
    }

    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  console.log('\n--- Done ---');
  console.log(`Processed: ${processed}`);
  console.log(`Upserted:  ${upserted}`);
  console.log(`Failed (database error): ${failed}`);
  console.log(`Skipped (no email): ${skippedNoEmail}`);
  console.log(`Skipped (unresolved tier): ${unresolved.length}`);

  if (unresolved.length) {
    console.log('\nThe following subscriptions need manual review (check the Price ID against your Stripe dashboard, then add it to PRICE_IDS in stripe.js and re-run):');
    unresolved.forEach(u => console.log(`  - ${u.email} | subscription ${u.id} | price ${u.priceId}`));
  }

  process.exit(0);
}

run().catch(err => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
