'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT email, user_id, name, role, is_admin, tier, stripe_customer_id,
             created_at, last_login, updated_at, two_factor
      FROM users ORDER BY created_at DESC
    `);
    const users = result.rows.map(u => ({
      email:           u.email,
      userId:          u.user_id,
      name:            u.name,
      role:            u.role || 'user',
      isAdmin:         u.is_admin,
      tier:            u.tier || 'starter',
      stripeCustomerId: u.stripe_customer_id,
      createdAt:       u.created_at,
      lastLogin:       u.last_login,
      updatedAt:       u.updated_at,
      twoFactorEnabled: u.two_factor?.enabled || false,
    }));
    res.json({ success:true, users, total: users.length });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

// GET /api/admin/stats
// GET /api/admin/stats — usage for admin, full financial for super_admin
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const usersR = await db.query('SELECT tier, is_admin, last_login FROM users');
    const users = usersR.rows;
    const day30ago = new Date(Date.now() - 30*86400000).toISOString();
    const tierCounts = {};
    users.forEach(u => {
      const t = u.tier || 'starter';
      tierCounts[t] = (tierCounts[t] || 0) + 1;
    });
    const promptsR = await db.query('SELECT COUNT(*) as count FROM prompts');
    const synthR = await db.query('SELECT SUM(used) as total FROM synthesis_usage');
    res.json({
      success: true,
      role: req.user.role,
      isSuperAdmin: req.user.role === 'super_admin',
      stats: {
        totalUsers:   users.length,
        adminUsers:   users.filter(u => u.is_admin).length,
        paidUsers:    users.filter(u => u.tier && !['starter','free'].includes(u.tier) && u.stripe_customer_id).length,
        activeUsers:  users.filter(u => u.last_login && (Date.now() - new Date(u.last_login).getTime()) < 30*24*60*60*1000).length,
        activeMonth:  users.filter(u => u.last_login && u.last_login >= day30ago).length,
        tierCounts,
        totalPrompts: parseInt(promptsR.rows[0]?.count || 0),
        totalSyntheses: parseInt(synthR.rows[0]?.total || 0),
      }
    });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

// POST /api/admin/users/:email/tier
router.post('/users/:email/tier', requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.params.email || '').toLowerCase().trim();
    const tier  = String(req.body?.tier || '').toLowerCase();
    const valid = ['starter','lite','creator','pro','professional','team','enterprise'];
    if (!valid.includes(tier)) return res.status(400).json({ success:false, error:'Invalid tier' });
    const r = await db.query('UPDATE users SET tier=$1, updated_at=NOW() WHERE email=$2 RETURNING email', [tier, email]);
    if (!r.rows.length) return res.status(404).json({ success:false, error:'User not found' });
    res.json({ success:true, email, tier });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

// POST /api/admin/users/:email/admin — toggle admin
router.post('/users/:email/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.params.email || '').toLowerCase().trim();
    const isAdmin = Boolean(req.body?.isAdmin);
    await db.query('UPDATE users SET is_admin=$1, updated_at=NOW() WHERE email=$2', [isAdmin, email]);
    res.json({ success:true, email, isAdmin });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

// GET /api/admin/qr-stats — QR code visit tracking
router.get('/qr-stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const total = await db.query(
      "SELECT COUNT(*) as count FROM traffic_visits WHERE source = 'qr_code'"
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const week = await db.query(
      "SELECT COUNT(*) as count FROM traffic_visits WHERE source = 'qr_code' AND created_at >= NOW() - INTERVAL '7 days'"
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const byDay = await db.query(
      `SELECT DATE(created_at) as day, COUNT(*) as visits
       FROM traffic_visits WHERE source = 'qr_code'
       AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day DESC LIMIT 30`
    ).catch(() => ({ rows: [] }));
    const signups = await db.query(
      `SELECT COUNT(DISTINCT user_email) as count FROM traffic_visits
       WHERE source = 'qr_code' AND user_email IS NOT NULL`
    ).catch(() => ({ rows: [{ count: 0 }] }));
    const recent = await db.query(
      `SELECT source, medium, campaign, page, created_at
       FROM traffic_visits WHERE source = 'qr_code'
       ORDER BY created_at DESC LIMIT 20`
    ).catch(() => ({ rows: [] }));

    const t = parseInt(total.rows[0]?.count) || 0;
    const s = parseInt(signups.rows[0]?.count) || 0;
    res.json({
      ok: true,
      total: t,
      thisWeek: parseInt(week.rows[0]?.count) || 0,
      signups: s,
      conversionRate: t > 0 ? Math.round((s / t) * 100) : 0,
      byDay: byDay.rows,
      recent: recent.rows,
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/feature-usage — provider and feature usage by tier (7 days)
router.get('/feature-usage', requireAuth, requireAdmin, async (req, res) => {
  try {
    const usage = await db.query(`
      SELECT
        feature,
        usage_date,
        SUM(used) as total_used,
        COUNT(DISTINCT user_email) as unique_users
      FROM feature_usage
      WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY feature, usage_date
      ORDER BY usage_date DESC, feature
    `).catch(() => ({ rows: [] }));

    const providerStats = await db.query(`
      SELECT
        DATE(created_at) as day,
        COUNT(*) as total_runs,
        AVG(response_count) as avg_providers
      FROM synthesis_logs
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY day ORDER BY day DESC
    `).catch(() => ({ rows: [] }));

    const isSuperAdmin = req.user.role === 'super_admin';

    const featureRows = usage.rows.reduce((acc, r) => {
      if (!acc[r.feature]) acc[r.feature] = { total: 0, users: 0 };
      acc[r.feature].total += parseInt(r.total_used) || 0;
      acc[r.feature].users += parseInt(r.unique_users) || 0;
      return acc;
    }, {});

    // Estimated costs — only visible to super_admin
    const COSTS = { perspectives: 0.042, sweep: 0.042, synthesis: 0.017, quick_answer: 0.007, excel: 0.017 };
    const withCosts = Object.entries(featureRows).map(([feature, data]) => ({
      feature,
      total: data.total,
      users: data.users,
      estimatedCost: isSuperAdmin ? (data.total * (COSTS[feature] || 0)).toFixed(2) : undefined,
    }));

    res.json({ ok: true, features: withCosts, providers: providerStats.rows, isSuperAdmin });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/referral-stats — referral programme health
router.get('/referral-stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const links = await db.query(`
      SELECT u.email, u.name, u.referral_code,
             COUNT(DISTINCT r.referred_email) as signups,
             COUNT(DISTINCT CASE WHEN r.converted THEN r.referred_email END) as paid_conversions
      FROM users u
      LEFT JOIN referrals r ON r.referrer_code = u.referral_code
      WHERE u.referral_code IS NOT NULL
      GROUP BY u.email, u.name, u.referral_code
      ORDER BY paid_conversions DESC, signups DESC
      LIMIT 20
    `).catch(() => ({ rows: [] }));

    const totals = await db.query(`
      SELECT
        COUNT(*) as total_signups,
        COUNT(CASE WHEN converted THEN 1 END) as total_conversions
      FROM referrals
    `).catch(() => ({ rows: [{ total_signups: 0, total_conversions: 0 }] }));

    const isSuperAdmin = req.user.role === 'super_admin';
    const t = totals.rows[0];

    const revenueAttributed = isSuperAdmin
      ? (parseInt(t.total_conversions || 0) * 14.95).toFixed(2)
      : undefined;

    res.json({
      ok: true,
      totalSignups: parseInt(t.total_signups) || 0,
      totalConversions: parseInt(t.total_conversions) || 0,
      revenueAttributed,
      topReferrers: links.rows,
      isSuperAdmin,
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/users/:email/role — set user role (super_admin only)
router.post('/users/:email/role', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { email } = req.params;
    const { role } = req.body;
    if (!['user','admin','super_admin'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }
    const isAdmin = ['admin','super_admin'].includes(role);
    await db.query(
      'UPDATE users SET role=$1, is_admin=$2, updated_at=NOW() WHERE email=$3',
      [role, isAdmin, email]
    );
    res.json({ ok: true, email, role });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/subscriptions — list all paid subscribers with Stripe status
router.get('/subscriptions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT email, name, tier, stripe_customer_id, created_at, updated_at
      FROM users
      WHERE tier NOT IN ('starter','free')
        AND stripe_customer_id IS NOT NULL
      ORDER BY updated_at DESC
    `);
    const users = result.rows;

    // Tier pricing map
    const tierPrice = {
      'creator': 14.95, 'creator-yearly': 149.00,
      'professional': 29.95, 'professional-yearly': 299.00,
      'team': 49.95, 'team-yearly': 499.00,
      'liteUnlimited': 9.95, 'student': 4.95, 'enterprise': 0
    };

    let stripeClient = null;
    try {
      const Stripe = require('stripe');
      stripeClient = Stripe(process.env.STRIPE_SECRET_KEY);
    } catch(e) {}

    const subscriptions = await Promise.all(users.map(async u => {
      const base = {
        email: u.email, name: u.name, tier: u.tier,
        amount: tierPrice[u.tier] || 0,
        status: 'active', renewalDate: null,
        stripeCustomerId: u.stripe_customer_id
      };

      if (stripeClient && u.stripe_customer_id) {
        try {
          const subs = await stripeClient.subscriptions.list({
            customer: u.stripe_customer_id, status: 'all', limit: 1
          });
          if (subs.data.length) {
            const sub = subs.data[0];
            base.status = sub.status;
            base.renewalDate = new Date(sub.current_period_end * 1000).toISOString();
            base.amount = (sub.items.data[0]?.price?.unit_amount / 100).toFixed(2);
          }
        } catch(e) {}
      }
      return base;
    }));

    const active = subscriptions.filter(s => s.status === 'active').length;
    const mrr = subscriptions
      .filter(s => s.status === 'active' && !s.tier.includes('yearly'))
      .reduce((sum, s) => sum + parseFloat(s.amount || 0), 0).toFixed(2);
    const renewingSoon = subscriptions.filter(s => {
      if (!s.renewalDate) return false;
      const days = (new Date(s.renewalDate) - Date.now()) / 86400000;
      return days >= 0 && days <= 30;
    }).length;
    const issues = subscriptions.filter(s => ['past_due','unpaid','canceled'].includes(s.status)).length;

    res.json({
      ok: true,
      subscriptions,
      summary: { active, mrr, renewingSoon, issues, total: subscriptions.length }
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/recent-activity
router.get('/recent-activity', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.query(
      'SELECT email, name, created_at FROM users ORDER BY created_at DESC LIMIT 8'
    );
    const msgs = await db.query(
      "SELECT name, email, type, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 4"
    ).catch(() => ({ rows: [] }));

    const activity = [];
    users.rows.forEach(u => activity.push({
      type: 'registration', icon: '+', color: 'orange',
      text: u.email + ' registered',
      time: u.created_at
    }));
    msgs.rows.forEach(m => activity.push({
      type: 'message', icon: '✉', color: 'blue',
      text: (m.type || 'Message') + ' from ' + (m.name || m.email),
      time: m.created_at
    }));

    activity.sort((a,b) => new Date(b.time) - new Date(a.time));
    res.json({ ok: true, activity: activity.slice(0, 10) });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/users/:email/remind — send reminder email
router.post('/users/:email/remind', requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.params.email || '').toLowerCase().trim();
    const user  = await db.getUser(email);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
    const { sendMail } = require('../lib/emailTransport');
    await sendMail({
      from: 'Forge <hello@projectcoachai.com>',
      to: email,
      subject: 'Your Forge account — a quick note',
      html: '<div style="font-family:sans-serif;max-width:600px">'
        + '<h2 style="color:#E8652A">Hi ' + (user.name || 'there') + ',</h2>'
        + '<p>We noticed you have not been active on Forge recently.</p>'
        + '<p>Your account is still active — come back and run a synthesis, analyse a document, or sweep your question across 8 AIs.</p>'
        + '<p><a href="https://forge.projectcoachai.com" style="display:inline-block;padding:10px 20px;background:#E8652A;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Back to Forge →</a></p>'
        + '<p style="color:#888;font-size:12px">Questions? Reply to this email.</p>'
        + '</div>'
    });
    res.json({ ok: true });
  } catch(e) {
    console.error('[Admin] remind error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/users/:email/terminate — cancel subscription + downgrade to starter
router.post('/users/:email/terminate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const email = String(req.params.email || '').toLowerCase().trim();
    const user  = await db.getUser(email);
    if (!user) return res.status(404).json({ ok: false, error: 'User not found' });

    // Cancel Stripe subscription if exists
    if (user.stripe_customer_id) {
      try {
        const Stripe = require('stripe');
        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: 'active' });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      } catch(stripeErr) {
        console.warn('[Admin] Stripe cancel failed:', stripeErr.message);
      }
    }

    // Downgrade to starter
    await db.query('UPDATE users SET tier=$1, updated_at=NOW() WHERE email=$2', ['starter', email]);

    // Notify user
    const { sendMail } = require('../lib/emailTransport');
    await sendMail({
      from: 'Forge <hello@projectcoachai.com>',
      to: email,
      subject: 'Your Forge subscription has been cancelled',
      html: '<div style="font-family:sans-serif;max-width:600px">'
        + '<h2 style="color:#E8652A">Hi ' + (user.name || 'there') + ',</h2>'
        + '<p>Your Forge subscription has been cancelled and your account has been moved to the free Explore AI plan.</p>'
        + '<p>You can continue using Forge for free, or resubscribe at any time from your profile.</p>'
        + '<p><a href="https://forge.projectcoachai.com/pricing.html" style="display:inline-block;padding:10px 20px;background:#E8652A;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">View Plans →</a></p>'
        + '<p style="color:#888;font-size:12px">Questions? Contact us at hello@projectcoachai.com</p>'
        + '</div>'
    }).catch(e => console.warn('[Admin] terminate email failed:', e.message));

    res.json({ ok: true });
  } catch(e) {
    console.error('[Admin] terminate error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
