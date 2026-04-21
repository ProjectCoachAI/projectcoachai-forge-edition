'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const crypto  = require('crypto');

// Generate invite link
router.post('/generate', requireAuth, async (req, res) => {
  try {
    const code = crypto.randomBytes(6).toString('hex');
    const inviterName = (await db.query('SELECT name FROM users WHERE email=$1', [req.userEmail])).rows[0]?.name || 'A Forge user';
    await db.query(`
      INSERT INTO invites (code, inviter_email, inviter_name, created_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (code) DO NOTHING
    `, [code, req.userEmail, inviterName]);
    res.json({ success: true, code, url: 'https://forge-app-1u9.pages.dev/register.html?invite=' + code });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Validate invite code
router.get('/:code', optionalAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT inviter_name, inviter_email, used_count FROM invites WHERE code=$1', [req.params.code]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Invalid invite code' });
    const invite = result.rows[0];
    res.json({ success: true, inviterName: invite.inviter_name, usedCount: invite.used_count });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Record invite use on registration
router.post('/redeem', async (req, res) => {
  try {
    const { code, newUserEmail } = req.body;
    if (!code || !newUserEmail) return res.json({ success: false });
    const result = await db.query('SELECT inviter_email FROM invites WHERE code=$1', [code]);
    if (!result.rows.length) return res.json({ success: false });
    await db.query('UPDATE invites SET used_count = used_count + 1 WHERE code=$1', [code]);
    await db.query('UPDATE users SET referral_code=$1 WHERE email=$2', [code, newUserEmail]);
    // Bonus: give inviter 10 extra syntheses
    const ym = new Date().toISOString().slice(0,7);
    await db.query(`
      INSERT INTO synthesis_usage (user_email, year_month, used, entries)
      VALUES ($1, $2, -10, '[]')
      ON CONFLICT (user_email, year_month) DO UPDATE
      SET used = GREATEST(0, synthesis_usage.used - 10)
    `, [result.rows[0].inviter_email, ym]);
    res.json({ success: true });
  } catch(e) {
    res.json({ success: false });
  }
});

module.exports = router;
