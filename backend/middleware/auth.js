'use strict';
/**
 * Auth middleware for Forge web API.
 * Reads the Bearer token from Authorization header,
 * looks up the user in users.json, and attaches req.user.
 */
const fs   = require('fs');
const path = require('path');
const { extractBearerToken, isTokenValid } = require('../lib/session');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

function readUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

/**
 * requireAuth — blocks the request with 401 if no valid session.
 * Attaches req.user (sanitized) and req.userEmail.
 */
function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers['authorization']);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const users = readUsers();
  let foundUser = null;
  let foundEmail = null;

  for (const [email, user] of Object.entries(users)) {
    const sessions = user.sessions || {};
    const session  = sessions[token];
    if (session && isTokenValid(session)) {
      foundUser  = user;
      foundEmail = email;
      break;
    }
  }

  if (!foundUser) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid. Please sign in again.' });
  }

  // Attach minimal user info — never expose passwordHash or sessions
  req.user = {
    userId:           foundUser.userId,
    name:             foundUser.name,
    email:            foundEmail,
    role:             foundUser.role || 'user',
    isAdmin:          Boolean(foundUser.isAdmin),
    stripeCustomerId: foundUser.stripeCustomerId || null,
    tier:             foundUser.tier || 'starter',
  };
  req.userEmail = foundEmail;
  next();
}

/**
 * optionalAuth — attaches req.user if a valid session exists,
 * but does NOT block the request if there is none.
 * Useful for endpoints that behave differently when authenticated.
 */
function optionalAuth(req, res, next) {
  const token = extractBearerToken(req.headers['authorization']);
  if (!token) return next();

  const users = readUsers();
  for (const [email, user] of Object.entries(users)) {
    const session = (user.sessions || {})[token];
    if (session && isTokenValid(session)) {
      req.user = {
        userId:           user.userId,
        name:             user.name,
        email,
        role:             user.role || 'user',
        isAdmin:          Boolean(user.isAdmin),
        stripeCustomerId: user.stripeCustomerId || null,
        tier:             user.tier || 'starter',
      };
      req.userEmail = email;
      break;
    }
  }
  next();
}

/**
 * requireAdmin — blocks non-admin users.
 * Must come after requireAuth in the middleware chain.
 */
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
