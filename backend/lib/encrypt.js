'use strict';
/**
 * AES-256-GCM encryption for provider API keys stored in users.json.
 * Requires ENCRYPTION_KEY env var: 64 hex chars (32 bytes).
 *
 * Ciphertext format stored as a string: "enc:<iv_hex>:<tag_hex>:<data_hex>"
 */
const crypto = require('crypto');

const ALGO      = 'aes-256-gcm';
const IV_BYTES  = 12;   // 96-bit IV recommended for GCM
const TAG_BYTES = 16;
const PREFIX    = 'enc:';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw || raw.length < 64) {
    // Fallback: derive from SESSION_SECRET if ENCRYPTION_KEY not set.
    // This is acceptable for dev but should be a dedicated key in production.
    const fallback = process.env.SESSION_SECRET || 'forge-dev-insecure-key-set-encryption-key-in-prod';
    return crypto.createHash('sha256').update(fallback).digest();
  }
  return Buffer.from(raw.slice(0, 64), 'hex');
}

/**
 * Encrypt a plain-text string (e.g. an API key).
 * Returns a prefixed string safe to store in JSON.
 */
function encrypt(plaintext) {
  if (!plaintext) return '';
  const key = getKey();
  const iv  = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  const enc  = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag  = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/**
 * Decrypt a value previously returned by encrypt().
 * Returns the original plaintext, or null on failure.
 */
function decrypt(stored) {
  if (!stored || !String(stored).startsWith(PREFIX)) return stored || null;
  try {
    const parts = String(stored).slice(PREFIX.length).split(':');
    if (parts.length !== 3) return null;
    const [ivHex, tagHex, dataHex] = parts;
    const key    = getKey();
    const iv     = Buffer.from(ivHex,   'hex');
    const tag    = Buffer.from(tagHex,  'hex');
    const data   = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    return decipher.update(data).toString('utf8') + decipher.final('utf8');
  } catch (_) {
    return null;
  }
}

/**
 * Returns true if the value looks like it was encrypted by us.
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
