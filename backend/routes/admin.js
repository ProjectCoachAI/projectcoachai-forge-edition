'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

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
      stats: {
        totalUsers:   users.length,
        adminUsers:   users.filter(u => u.is_admin).length,
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

module.exports = router;
