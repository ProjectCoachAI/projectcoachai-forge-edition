'use strict';
const { authLimiter } = require('../middleware/rateLimiter');
const express  = require('express');
const crypto   = require('crypto');
const router   = express.Router();
const db       = require('../lib/db');
const { generateToken, pruneSessionsMap } = require('../lib/session');
const { requireAuth } = require('../middleware/auth');

let sendMail = null;
try { ({ sendMail } = require('../lib/emailTransport')); } catch (_) {}

function readUsers() { return {}; } // kept for legacy compat — not used

function sanitizeUser(u) {
  return {
    userId: u.user_id, name: u.name, email: u.email,
    role: u.role, isAdmin: u.is_admin, tier: u.tier||'starter',
    stripeCustomerId: u.stripe_customer_id||null,
  };
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ success:false, error:'All fields are required' });
  if (password.length < 8) return res.status(400).json({ success:false, error:'Password must be at least 8 characters' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success:false, error:'Invalid email address' });

  const existing = await db.getUser(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ success:false, error:'An account with this email already exists' });

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const passwordHash = `scrypt$${salt}$${hash}`;

  const userId  = 'u_' + crypto.randomBytes(8).toString('hex');
  const session = generateToken();

  await db.createUser(email.toLowerCase().trim(), {
    user_id: userId, name, password_hash: passwordHash,
    role: 'user', is_admin: false, tier: 'starter',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  await db.createSession(session.token, email.toLowerCase().trim(), session.createdAt, session.expiresAt);

  const user = await db.getUser(email.toLowerCase().trim());
  console.log(`✅ [Register] ${email}`);
  res.status(201).json({ success:true, token:session.token, user:sanitizeUser(user) });
});

// ── POST /api/auth/signin ─────────────────────────────────────────────────────
router.post('/signin', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ success:false, error:'Email and password are required' });

  const user = await db.getUser(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ success:false, error:'Invalid email or password' });

  const [, salt, storedHash] = (user.password_hash||'').split('$');
  if (!salt || !storedHash) return res.status(401).json({ success:false, error:'Invalid email or password' });

  let match = false;
  try { match = crypto.scryptSync(password, salt, 64).toString('hex') === storedHash; } catch (_) {}
  if (!match) return res.status(401).json({ success:false, error:'Invalid email or password' });
  // 2FA check
  const tf = user.two_factor || {};
  if (tf.enabled) {
    const { twofa_code } = req.body;
    if (!twofa_code) return res.json({ success:false, requires2FA:true, error:'2FA code required' });
    const speakeasy = require('speakeasy');
    const valid = speakeasy.totp.verify({ secret: tf.secret, encoding: 'base32', token: twofa_code, window: 2 });
    if (!valid) return res.status(401).json({ success:false, error:'Invalid 2FA code' });
  }

  const session = generateToken();
  await db.createSession(session.token, user.email, session.createdAt, session.expiresAt);
  await db.saveUser(user.email, { last_login: new Date().toISOString() });

  console.log(`🔑 [Signin] attempt: ${email}`);
  res.json({ success:true, token:session.token, user:sanitizeUser(user) });
});

// ── POST /api/auth/signout ────────────────────────────────────────────────────
router.post('/signout', async (req, res) => {
  const token = (req.headers['authorization']||'').replace('Bearer ','').trim();
  if (token) await db.deleteSession(token);
  res.json({ success:true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const token = (req.headers['authorization']||'').replace('Bearer ','').trim();
  if (!token) return res.status(401).json({ success:false, error:'No token' });
  const session = await db.getSession(token);
  if (!session) return res.status(401).json({ success:false, error:'Session expired' });
  const user = await db.getUser(session.user_email);
  if (!user) return res.status(404).json({ success:false, error:'User not found' });
  res.json({ success:true, user:sanitizeUser(user) });
});

// ── GET /api/auth/usage ───────────────────────────────────────────────────────
router.get('/usage', requireAuth, async (req, res) => {
  const usage = await db.getUsage(req.userEmail);
  const resetDate = new Date(new Date().getFullYear(), new Date().getMonth()+1, 0);
  res.json({ success:true, usage: { ...usage, resetDate:resetDate.toISOString() } });
});

// ── POST /api/auth/password-reset/request ────────────────────────────────────
router.post('/password-reset/request', async (req, res) => {
  const email = String(req.body?.email||'').toLowerCase().trim();
  if (!email) return res.status(400).json({ success:false, error:'Email is required' });
  const user = await db.getUser(email);
  // Always return success to prevent user enumeration
  if (!user) return res.json({ success:true, message:'If that email exists, a reset link has been sent.' });

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600000).toISOString();
  await db.saveUser(email, { password_reset_token: token, password_reset_expires: expires });

  if (sendMail) {
    try {
      await sendMail({
        to: email, subject: 'Forge — Reset your password',
        text: `Reset link: ${process.env.FRONTEND_URL||'https://forge-app-1u9.pages.dev'}/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`,
      });
    } catch (_) {}
  }
  res.json({ success:true, message:'If that email exists, a reset link has been sent.' });
});

// ── POST /api/auth/password-reset/confirm ────────────────────────────────────
router.post('/password-reset/confirm', async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) return res.status(400).json({ success:false, error:'Email, token, and new password are required' });
  if (newPassword.length < 8) return res.status(400).json({ success:false, error:'Password must be at least 8 characters' });

  const user = await db.getUser(email.toLowerCase().trim());
  if (!user) return res.status(400).json({ success:false, error:'Invalid reset request' });

  const r = await db.query('SELECT password_reset_token, password_reset_expires FROM users WHERE email=$1', [email.toLowerCase().trim()]);
  const row = r.rows[0];
  if (!row?.password_reset_token || row.password_reset_token !== token) return res.status(400).json({ success:false, error:'Invalid or expired reset token' });
  if (new Date(row.password_reset_expires) < new Date()) return res.status(400).json({ success:false, error:'Reset token has expired' });

  const salt = crypto.randomBytes(32).toString('hex');
  const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');
  await db.saveUser(email.toLowerCase().trim(), { password_hash:`scrypt$${salt}$${hash}`, password_reset_token:null, password_reset_expires:null });
  res.json({ success:true, message:'Password reset successfully. Please sign in.' });
});

// ── POST /api/auth/password-change ───────────────────────────────────────────
router.post('/password-change', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ success:false, error:'Email, current password, and new password are required' });
  if (newPassword.length < 8) return res.status(400).json({ success:false, error:'New password must be at least 8 characters' });

  const user = await db.getUser(req.userEmail);
  const [, salt, storedHash] = (user.password_hash||'').split('$');
  let match = false;
  try { match = crypto.scryptSync(currentPassword, salt, 64).toString('hex') === storedHash; } catch (_) {}
  if (!match) return res.status(401).json({ success:false, error:'Current password is incorrect' });

  const newSalt = crypto.randomBytes(32).toString('hex');
  const newHash = crypto.scryptSync(newPassword, newSalt, 64).toString('hex');
  await db.saveUser(req.userEmail, { password_hash:`scrypt$${newSalt}$${newHash}` });
  res.json({ success:true, message:'Password changed successfully.' });
});



module.exports = router;
