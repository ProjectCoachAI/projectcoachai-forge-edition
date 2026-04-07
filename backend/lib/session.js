'use strict';
/**
 * Session token management
 * Tokens are 32 random bytes (hex), stored in users.json per user.
 * No JWT, no external dependencies — built-in crypto only.
 */
const crypto = require('crypto');

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate a new session token + metadata
 */
function generateToken() {
  return {
    token:     crypto.randomBytes(TOKEN_BYTES).toString('hex'),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  };
}

/**
 * Check whether a stored session entry is still valid
 */
function isTokenValid(session) {
  if (!session || !session.token || !session.expiresAt) return false;
  return Date.now() < new Date(session.expiresAt).getTime();
}

/**
 * Pluck the Bearer token from an Authorization header value
 * Returns null if the header is missing or malformed.
 */
function extractBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1] || null;
}

/**
 * Purge expired sessions from a sessions map (mutates in place).
 * Keeps at most `max` valid sessions to avoid unbounded growth.
 */
function pruneSessionsMap(sessionsMap, max = 5) {
  if (!sessionsMap || typeof sessionsMap !== 'object') return;
  const now = Date.now();
  for (const [tok, meta] of Object.entries(sessionsMap)) {
    if (!meta || !meta.expiresAt || now >= new Date(meta.expiresAt).getTime()) {
      delete sessionsMap[tok];
    }
  }
  // Trim to max most-recent sessions
  const entries = Object.entries(sessionsMap)
    .sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt));
  entries.slice(max).forEach(([tok]) => delete sessionsMap[tok]);
}

module.exports = { generateToken, isTokenValid, extractBearerToken, pruneSessionsMap };
