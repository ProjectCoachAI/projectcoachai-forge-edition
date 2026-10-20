// lib/revenue.js — revenue bookkeeping for the admin Command Center.
//
// What this does (and why it lives in its own file):
//  - revenue_events holds one row per paid Stripe invoice (positive amount,
//    VAT/GST already taken out: that money is not ours) and one NEGATIVE row
//    per issued credit note OR per refund made straight on a payment (the Refund
//    button in the Stripe dashboard creates no credit note), so refunds reduce revenue.
//  - Accounts that belong to the company (the owners' own test accounts) can be
//    listed in the INTERNAL_ACCOUNT_EMAILS / INTERNAL_ACCOUNT_DOMAINS Railway
//    variables. They are kept in the table but reported separately, so the
//    pages show only what outside customers pay.
//  - MRR is read from Stripe's active subscriptions with yearly plans divided
//    by 12, instead of being guessed from a tier-price table.
//
// Money is stored as NUMERIC in the invoice currency, which is USD for every
// price in use today. Stripe's processing fee is an ESTIMATE (2.9% + $0.30);
// the real fee is higher on foreign-currency and non-card payments.
'use strict';

const FEE_PERCENT = 0.029;
const FEE_FIXED = 0.30;

let _ensured = false;
async function ensureRevenueTable(db) {
  if (_ensured) return;
  await db.query(`CREATE TABLE IF NOT EXISTS revenue_events (
    stripe_invoice_id TEXT PRIMARY KEY,
    customer_id TEXT,
    amount_gross NUMERIC,
    stripe_fee NUMERIC,
    amount_net NUMERIC,
    year_month TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await db.query(`ALTER TABLE revenue_events ADD COLUMN IF NOT EXISTS customer_email TEXT`);
  await db.query(`ALTER TABLE revenue_events ADD COLUMN IF NOT EXISTS refund_of TEXT`);
  _ensured = true;
}

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const ymOf = unixSeconds => new Date(unixSeconds * 1000).toISOString().slice(0, 7);

// ── Recording ───────────────────────────────────────────────────────────────

// Revenue is what the customer paid minus tax collected for the tax authority.
// total_excluding_tax is absent on very old invoices, so fall back to the amount
// paid. Invoices that moved no money (free trials, 100% coupons) are not revenue.
function invoiceToRow(invoice) {
  if (!invoice || !invoice.id) return null;
  const paidCents = invoice.amount_paid || 0;
  const exclTaxCents = (typeof invoice.total_excluding_tax === 'number') ? invoice.total_excluding_tax : paidCents;
  const gross = Math.min(paidCents, exclTaxCents) / 100;
  if (!(gross > 0)) return null;
  const fee = round2(gross * FEE_PERCENT + FEE_FIXED);
  return {
    id: invoice.id,
    customerId: invoice.customer || null,
    email: invoice.customer_email || null,
    gross: round2(gross),
    fee,
    net: round2(gross - fee),
    ym: ymOf(invoice.created),
    createdAt: new Date(invoice.created * 1000).toISOString()
  };
}

async function recordInvoice(db, invoice) {
  const row = invoiceToRow(invoice);
  if (!row) return { recorded: false, reason: 'no revenue' };
  await ensureRevenueTable(db);
  const r = await db.query(
    `INSERT INTO revenue_events(stripe_invoice_id, customer_id, amount_gross, stripe_fee, amount_net, year_month, created_at, customer_email)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (stripe_invoice_id)
     DO UPDATE SET customer_email = COALESCE(revenue_events.customer_email, EXCLUDED.customer_email)
     RETURNING (xmax = 0) AS inserted`,
    [row.id, row.customerId, row.gross, row.fee, row.net, row.ym, row.createdAt, row.email]
  );
  return { recorded: true, inserted: !!(r.rows[0] && r.rows[0].inserted), amount: row.gross };
}

// The amount of a credit note that reduces revenue, in cents, excluding tax.
function creditNoteCents(cn) {
  if (typeof cn.total_excluding_tax === 'number') return cn.total_excluding_tax;
  const total = typeof cn.total === 'number' ? cn.total : 0;
  const tax = Array.isArray(cn.tax_amounts) ? cn.tax_amounts.reduce((s, t) => s + (t.amount || 0), 0) : 0;
  return total - tax;
}

// A refund only reduces revenue if the invoice it refunds was recorded as paid
// (a credit note on an unpaid invoice just lowers what was ever owed), and never
// by more than what is left of that invoice after earlier credit notes.
async function recordCreditNote(db, cn) {
  if (!cn || !cn.id || !cn.invoice) return { recorded: false, reason: 'no invoice' };
  if (cn.status && cn.status !== 'issued') return { recorded: false, reason: 'status ' + cn.status };
  await ensureRevenueTable(db);
  const key = 'cn_' + cn.id;
  const existing = await db.query(`SELECT 1 FROM revenue_events WHERE stripe_invoice_id=$1`, [key]);
  if (existing.rows.length) return { recorded: false, reason: 'already recorded' };
  const orig = await db.query(
    `SELECT amount_gross, customer_id, customer_email FROM revenue_events WHERE stripe_invoice_id=$1`, [cn.invoice]);
  if (!orig.rows.length) return { recorded: false, reason: 'invoice not recorded as paid' };
  const done = await db.query(
    `SELECT COALESCE(SUM(-amount_gross),0) AS s FROM revenue_events WHERE refund_of=$1`, [cn.invoice]);
  const remaining = num(orig.rows[0].amount_gross) - num(done.rows[0].s);
  const amount = round2(Math.min(creditNoteCents(cn) / 100, Math.max(remaining, 0)));
  if (!(amount > 0)) return { recorded: false, reason: 'nothing left to refund' };
  await db.query(
    `INSERT INTO revenue_events(stripe_invoice_id, customer_id, amount_gross, stripe_fee, amount_net, year_month, created_at, customer_email, refund_of)
     VALUES($1,$2,$3,0,$3,$4,$5,$6,$7)
     ON CONFLICT (stripe_invoice_id) DO NOTHING`,
    [key, cn.customer || orig.rows[0].customer_id, -amount, ymOf(cn.created), new Date(cn.created * 1000).toISOString(),
     orig.rows[0].customer_email, cn.invoice]
  );
  return { recorded: true, amount };
}

// A refund made directly on a payment (Stripe dashboard "Refund" button, or the
// API) creates a Refund object but no credit note. Refunds issued THROUGH a credit
// note are skipped here because recordCreditNote already books them (the amount
// there is exact and excludes VAT). The refund amount includes VAT, so it is
// scaled to the revenue recorded for that invoice. `charge` may be passed when
// the caller already has it (the charge.refunded webhook carries it).
async function recordRefund(stripe, db, refund, charge) {
  if (!refund || !refund.id) return { recorded: false, reason: 'no refund' };
  if (refund.status && refund.status !== 'succeeded' && refund.status !== 'pending') return { recorded: false, reason: 'refund ' + refund.status };
  await ensureRevenueTable(db);
  const key = 'rf_' + refund.id;
  const existing = await db.query(`SELECT 1 FROM revenue_events WHERE stripe_invoice_id=$1`, [key]);
  if (existing.rows.length) return { recorded: false, reason: 'already recorded' };

  if (!charge || typeof charge !== 'object') {
    const chargeId = typeof refund.charge === 'string' ? refund.charge : (refund.charge && refund.charge.id);
    if (!chargeId) return { recorded: false, reason: 'no charge' };
    charge = await stripe.charges.retrieve(chargeId);
  }
  const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : (charge.invoice && charge.invoice.id);
  if (!invoiceId) return { recorded: false, reason: 'not an invoice payment' };

  const orig = await db.query(
    `SELECT amount_gross, customer_id, customer_email FROM revenue_events WHERE stripe_invoice_id=$1`, [invoiceId]);
  if (!orig.rows.length) return { recorded: false, reason: 'invoice not recorded as paid' };

  // Already booked through a credit note? Then leave it to that path.
  try {
    const cns = await stripe.creditNotes.list({ invoice: invoiceId, limit: 100 });
    const linked = (cns.data || []).some(cn => cn.refund === refund.id ||
      (Array.isArray(cn.refunds) && cn.refunds.some(r => r === refund.id || r.id === refund.id || r.refund === refund.id)));
    if (linked) return { recorded: false, reason: 'covered by credit note' };
  } catch (_) { /* fall through: the cap below still prevents refunding more than was paid */ }

  const paidCents = charge.amount || 0;
  if (!(paidCents > 0) || !(refund.amount > 0)) return { recorded: false, reason: 'no amount' };
  const gross = num(orig.rows[0].amount_gross);
  const done = await db.query(`SELECT COALESCE(SUM(-amount_gross),0) AS s FROM revenue_events WHERE refund_of=$1`, [invoiceId]);
  const remaining = Math.max(gross - num(done.rows[0].s), 0);
  const amount = round2(Math.min(gross * Math.min(refund.amount / paidCents, 1), remaining));
  if (!(amount > 0)) return { recorded: false, reason: 'nothing left to refund' };
  await db.query(
    `INSERT INTO revenue_events(stripe_invoice_id, customer_id, amount_gross, stripe_fee, amount_net, year_month, created_at, customer_email, refund_of)
     VALUES($1,$2,$3,0,$3,$4,$5,$6,$7)
     ON CONFLICT (stripe_invoice_id) DO NOTHING`,
    [key, charge.customer || orig.rows[0].customer_id, -amount, ymOf(refund.created), new Date(refund.created * 1000).toISOString(),
     orig.rows[0].customer_email, invoiceId]
  );
  return { recorded: true, amount };
}

// ── Internal accounts ──────────────────────────────────────────────────────

function loadInternalFilter(env) {
  env = env || process.env;
  const list = s => String(s || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const emails = new Set(list(env.INTERNAL_ACCOUNT_EMAILS));
  const domains = new Set(list(env.INTERNAL_ACCOUNT_DOMAINS).map(d => d.replace(/^@/, '')));
  return function isInternal(email) {
    if (!email) return false;
    const e = String(email).trim().toLowerCase();
    if (emails.has(e)) return true;
    const at = e.lastIndexOf('@');
    return at >= 0 && domains.has(e.slice(at + 1));
  };
}

// Revenue rows only know the Stripe customer id (older rows have no email). Look
// the email up from our own users table first and from Stripe for the rest, a few
// at a time, so no one-off backfill script is needed.
async function fillMissingEmails(db, stripe, maxCustomers) {
  await ensureRevenueTable(db);
  const r = await db.query(
    `SELECT DISTINCT r.customer_id FROM revenue_events r
      WHERE r.customer_email IS NULL AND r.customer_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.stripe_customer_id = r.customer_id)
      LIMIT $1`, [maxCustomers || 20]);
  let filled = 0;
  for (const row of r.rows) {
    let email = '';
    try {
      const c = await stripe.customers.retrieve(row.customer_id);
      if (c && c.email) email = c.email;
    } catch (_) { /* leave as unknown */ }
    // '' marks "looked up, no email" so it is not asked for again on every load.
    await db.query(`UPDATE revenue_events SET customer_email=$2 WHERE customer_id=$1 AND customer_email IS NULL`,
      [row.customer_id, email]);
    filled++;
  }
  return filled;
}

// ── Reporting ──────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_MS = 86400000;

// Calendar periods in UTC (the same clock invoice dates are stored in).
function periodBounds(period, now) {
  now = now || new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  let start, end, label;
  if (period === 'day') {
    start = Date.UTC(y, m, d); end = start + DAY_MS;
    label = 'Today · ' + d + ' ' + MONTHS[m] + ' ' + y;
  } else if (period === 'week') {
    const dow = (now.getUTCDay() + 6) % 7; // Monday = 0
    start = Date.UTC(y, m, d - dow); end = start + 7 * DAY_MS;
    const s = new Date(start), e = new Date(end - DAY_MS);
    label = 'Week · ' + s.getUTCDate() + (s.getUTCMonth() !== e.getUTCMonth() ? ' ' + MONTHS[s.getUTCMonth()] : '')
      + '–' + e.getUTCDate() + ' ' + MONTHS[e.getUTCMonth()] + ' ' + e.getUTCFullYear();
  } else if (period === 'quarter') {
    const qm = Math.floor(m / 3) * 3;
    start = Date.UTC(y, qm, 1); end = Date.UTC(y, qm + 3, 1);
    label = 'Q' + (qm / 3 + 1) + ' ' + y + ' (' + MONTHS[qm] + '–' + MONTHS[qm + 2] + ')';
  } else if (period === 'year') {
    start = Date.UTC(y, 0, 1); end = Date.UTC(y + 1, 0, 1);
    label = y + ' (Jan–' + MONTHS[m] + ', to date)';
  } else {
    start = Date.UTC(y, m, 1); end = Date.UTC(y, m + 1, 1);
    label = MONTHS_LONG[m] + ' ' + y;
  }
  return { start: new Date(start), end: new Date(end), label };
}

function emptyTotals() { return { billed: 0, refunded: 0, fees: 0, payments: 0, refunds: 0 }; }
function addRow(t, amount, fee) {
  if (amount > 0) { t.billed += amount; t.fees += fee; t.payments++; }
  else if (amount < 0) { t.refunded += -amount; t.refunds++; }
}
function finish(t) {
  const gross = t.billed - t.refunded;
  return {
    billed: round2(t.billed), refunded: round2(t.refunded), gross: round2(gross),
    fees: round2(t.fees), net: round2(gross - t.fees), payments: t.payments, refunds: t.refunds
  };
}

async function summarise(db, period, isInternal, now) {
  now = now || new Date();
  await ensureRevenueTable(db);
  const b = periodBounds(period, now);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const from = b.start < yearStart ? b.start : yearStart;
  const to = b.end > yearEnd ? b.end : yearEnd;
  const r = await db.query(
    `SELECT r.amount_gross, r.stripe_fee, r.created_at, COALESCE(r.customer_email, u.email) AS email
       FROM revenue_events r
       LEFT JOIN LATERAL (SELECT email FROM users WHERE stripe_customer_id = r.customer_id LIMIT 1) u ON true
      WHERE r.created_at >= $1 AND r.created_at < $2`, [from.toISOString(), to.toISOString()]);

  const ext = emptyTotals(), internal = emptyTotals();
  const months = {};
  for (let i = 0; i <= now.getUTCMonth(); i++) {
    months[now.getUTCFullYear() + '-' + String(i + 1).padStart(2, '0')] = emptyTotals();
  }
  for (const row of r.rows) {
    const amount = num(row.amount_gross);
    if (amount === 0) continue; // legacy zero-value rows carried a phantom fee
    const fee = amount > 0 ? num(row.stripe_fee) : 0;
    const at = new Date(row.created_at);
    const isInt = isInternal(row.email);
    if (at >= b.start && at < b.end) addRow(isInt ? internal : ext, amount, fee);
    if (!isInt) {
      const key = at.toISOString().slice(0, 7);
      if (months[key]) addRow(months[key], amount, fee);
    }
  }
  return {
    period, label: b.label, start: b.start.toISOString(), end: b.end.toISOString(),
    ...finish(ext),
    internal: finish(internal),
    byMonth: Object.keys(months).map(k => ({ month: k, ...finish(months[k]) }))
  };
}

// ── MRR ─────────────────────────────────────────────────────────────────────

async function listActiveSubscriptions(stripe) {
  const out = [];
  let startingAfter;
  for (let page = 0; page < 20; page++) { // safety cap: 2000 subscriptions
    const res = await stripe.subscriptions.list(Object.assign(
      { status: 'active', limit: 100, expand: ['data.customer'] },
      startingAfter ? { starting_after: startingAfter } : {}));
    out.push(...res.data);
    if (!res.has_more || !res.data.length) break;
    startingAfter = res.data[res.data.length - 1].id;
  }
  return out;
}

// One subscription's recurring revenue per month, in the price currency's major
// unit, with yearly (and other) intervals converted to a month.
function monthlyAmount(sub) {
  let total = 0;
  const items = (sub.items && sub.items.data) || [];
  for (const it of items) {
    const p = it.price || {};
    if (!p.recurring || typeof p.unit_amount !== 'number') continue;
    const count = p.recurring.interval_count || 1;
    const perInterval = (p.unit_amount / 100) * (it.quantity || 1);
    switch (p.recurring.interval) {
      case 'month': total += perInterval / count; break;
      case 'year': total += perInterval / (12 * count); break;
      case 'week': total += perInterval * 52 / 12 / count; break;
      case 'day': total += perInterval * 365 / 12 / count; break;
    }
  }
  return total;
}

let _mrrCache = null;
async function computeMrr(stripe, isInternal) {
  if (_mrrCache && Date.now() - _mrrCache.at < 60000) return _mrrCache.value;
  const subs = await listActiveSubscriptions(stripe);
  const ext = { mrr: 0, count: 0 }, internal = { mrr: 0, count: 0 };
  let cancelling = 0, nonUsd = 0;
  for (const s of subs) {
    const cur = ((s.items && s.items.data[0] && s.items.data[0].price && s.items.data[0].price.currency) || s.currency || 'usd');
    if (cur !== 'usd') { nonUsd++; continue; } // not added: amounts would be a different currency
    const email = s.customer && typeof s.customer === 'object' ? s.customer.email : null;
    const bucket = isInternal(email) ? internal : ext;
    bucket.mrr += monthlyAmount(s);
    bucket.count++;
    if (s.cancel_at_period_end && !isInternal(email)) cancelling++;
  }
  const value = {
    // ARR is twelve times the MRR as displayed, so the two figures always agree.
    mrr: round2(ext.mrr), arr: round2(round2(ext.mrr) * 12), subscribers: ext.count, cancelling, nonUsd,
    internal: { mrr: round2(internal.mrr), subscribers: internal.count }
  };
  _mrrCache = { at: Date.now(), value };
  return value;
}
function clearMrrCache() { _mrrCache = null; }

// ── Re-sync from Stripe ─────────────────────────────────────────────────────

// Replays paid invoices and credit notes from Stripe into revenue_events. Safe to
// run any number of times: existing rows are left alone (only a missing email is
// filled in). Covers refunds issued before this code existed and any webhook that
// was missed.
async function resync(stripe, db, sinceDate) {
  await ensureRevenueTable(db);
  const sinceTs = Math.floor(sinceDate.getTime() / 1000);
  const result = { invoicesSeen: 0, invoicesAdded: 0, creditNotesSeen: 0, creditNotesAdded: 0, refundsSeen: 0, refundsAdded: 0, skipped: {} };

  let after;
  for (let page = 0; page < 50; page++) {
    const res = await stripe.invoices.list(Object.assign(
      { status: 'paid', created: { gte: sinceTs }, limit: 100 }, after ? { starting_after: after } : {}));
    for (const inv of res.data) {
      result.invoicesSeen++;
      const o = await recordInvoice(db, inv);
      if (o.recorded && o.inserted) result.invoicesAdded++;
      else if (!o.recorded) result.skipped[o.reason] = (result.skipped[o.reason] || 0) + 1;
    }
    if (!res.has_more || !res.data.length) break;
    after = res.data[res.data.length - 1].id;
  }

  after = undefined;
  let older = false;
  for (let page = 0; page < 50 && !older; page++) {
    const res = await stripe.creditNotes.list(Object.assign({ limit: 100 }, after ? { starting_after: after } : {}));
    for (const cn of res.data) {
      if (cn.created < sinceTs) { older = true; continue; }
      result.creditNotesSeen++;
      const o = await recordCreditNote(db, cn);
      if (o.recorded) result.creditNotesAdded++;
      else result.skipped[o.reason] = (result.skipped[o.reason] || 0) + 1;
    }
    if (!res.has_more || !res.data.length) break;
    after = res.data[res.data.length - 1].id;
  }
  // Refunds made directly on a payment (no credit note). Done after credit notes so
  // the ones already booked through a credit note are recognised and skipped.
  after = undefined;
  for (let page = 0; page < 50; page++) {
    const res = await stripe.refunds.list(Object.assign(
      { created: { gte: sinceTs }, limit: 100 }, after ? { starting_after: after } : {}));
    for (const rf of res.data) {
      result.refundsSeen++;
      let o;
      try { o = await recordRefund(stripe, db, rf); }
      catch (e) { o = { recorded: false, reason: 'error: ' + e.message }; }
      if (o.recorded) result.refundsAdded++;
      else result.skipped['refund: ' + o.reason] = (result.skipped['refund: ' + o.reason] || 0) + 1;
    }
    if (!res.has_more || !res.data.length) break;
    after = res.data[res.data.length - 1].id;
  }
  clearMrrCache();
  return result;
}

module.exports = {
  ensureRevenueTable, invoiceToRow, recordInvoice, recordCreditNote, recordRefund, creditNoteCents,
  loadInternalFilter, fillMissingEmails, periodBounds, summarise,
  monthlyAmount, computeMrr, clearMrrCache, resync
};
