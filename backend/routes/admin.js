'use strict';
/**
 * /api/admin — Admin-only endpoints.
 * All routes require valid session + isAdmin === true.
 *
 * GET /api/admin/users          → all users (sanitized)
 * GET /api/admin/stats          → platform stats
 * POST /api/admin/users/:email/tier → update a user's tier
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}'); }
  catch (_) { return {}; }
}
function writeUsers(users) {
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmp, USERS_FILE);
}

function sanitizeForAdmin(email, user) {
  const providerKeys = user.providerKeys || {};
  const connections  = {};
  for (const [provider, val] of Object.entries(providerKeys)) {
    connections[provider] = { connected: Boolean(val), connectedAt: user.providerConnectedAt?.[provider] || null };
  }
  return {
    userId:          user.userId,
    name:            user.name,
    email,
    role:            user.role || 'user',
    isAdmin:         Boolean(user.isAdmin),
    tier:            user.tier || 'starter',
    stripeCustomerId: user.stripeCustomerId || null,
    createdAt:       user.createdAt,
    lastLogin:       user.lastLogin || null,
    updatedAt:       user.updatedAt,
    twoFactorEnabled: Boolean(user.twoFactor?.enabled),
    promptCount:     (user.prompts || []).length,
    sessionCount:    Object.keys(user.sessions || {}).length,
    connections,
    synthesisUsage:  user.synthesisUsage || {},
  };
}

// ── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = readUsers();
  const list  = Object.entries(users).map(([email, user]) => sanitizeForAdmin(email, user));
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, users: list, total: list.length });
});

// ── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const users    = readUsers();
  const list     = Object.values(users);
  const now      = Date.now();
  const day30ago = new Date(now - 30 * 86400000).toISOString();

  const tierCounts = {};
  for (const user of list) {
    const t = user.tier || 'starter';
    tierCounts[t] = (tierCounts[t] || 0) + 1;
  }

  res.json({
    success: true,
    stats: {
      totalUsers:   list.length,
      adminUsers:   list.filter(u => u.isAdmin).length,
      activeMonth:  list.filter(u => u.lastLogin && u.lastLogin >= day30ago).length,
      tierCounts,
      totalPrompts: list.reduce((s, u) => s + (u.prompts || []).length, 0),
    }
  });
});

// ── POST /api/admin/users/:email/tier ───────────────────────────────────────
router.post('/users/:email/tier', requireAuth, requireAdmin, (req, res) => {
  const email = String(req.params.email || '').toLowerCase().trim();
  const tier  = String(req.body?.tier || '').toLowerCase();
  const valid = ['starter','lite','creator','pro','professional','team','enterprise'];
  if (!valid.includes(tier)) {
    return res.status(400).json({ success: false, error: `Invalid tier: ${tier}` });
  }

  const users = readUsers();
  if (!users[email]) return res.status(404).json({ success: false, error: 'User not found' });

  users[email].tier      = tier;
  users[email].updatedAt = new Date().toISOString();
  writeUsers(users);

  res.json({ success: true, email, tier });
});

module.exports = router;
