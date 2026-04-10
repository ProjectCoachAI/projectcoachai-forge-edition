'use strict';
/**
 * Auth middleware — uses PostgreSQL sessions via lib/db.js
 */
const db = require('../lib/db');
const { extractBearerToken } = require('../lib/session');

async function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers['authorization']);
  if (!token) return res.status(401).json({ success:false, error:'Authentication required' });

  const session = await db.getSession(token);
  if (!session) return res.status(401).json({ success:false, error:'Session expired or invalid. Please sign in again.' });

  const user = await db.getUser(session.user_email);
  if (!user) return res.status(401).json({ success:false, error:'User not found' });

  req.user = {
    userId: user.user_id, name: user.name, email: user.email,
    role: user.role, isAdmin: user.is_admin, tier: user.tier||'starter',
    stripeCustomerId: user.stripe_customer_id||null,
  };
  req.userEmail = user.email;
  next();
}

async function optionalAuth(req, res, next) {
  const token = extractBearerToken(req.headers['authorization']);
  if (!token) return next();

  try {
    const session = await db.getSession(token);
    if (session) {
      const user = await db.getUser(session.user_email);
      if (user) {
        req.user = {
          userId: user.user_id, name: user.name, email: user.email,
          role: user.role, isAdmin: user.is_admin, tier: user.tier||'starter',
          stripeCustomerId: user.stripe_customer_id||null,
        };
        req.userEmail = user.email;
      }
    }
  } catch(_) {}
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ success:false, error:'Admin access required' });
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
