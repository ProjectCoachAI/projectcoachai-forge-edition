const express = require('express');
const db = require('../lib/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendMail } = require('../lib/emailTransport');

const router = express.Router();

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const RESET_WINDOW_MS = 15 * 60 * 1000;

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password = '') {
  const normalized = String(password || '');
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(normalized, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password = '', storedHash = '') {
  const normalized = String(password || '');
  const value = String(storedHash || '');
  if (!value) return false;

  // Preferred format: scrypt$<salt>$<derivedHex>
  if (value.startsWith('scrypt$')) {
    const parts = value.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHex = parts[2];
    try {
      const derived = crypto.scryptSync(normalized, salt, 64).toString('hex');
      const expected = Buffer.from(expectedHex, 'hex');
      const actual = Buffer.from(derived, 'hex');
      return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    } catch (_) {
      return false;
    }
  }

  // Legacy compatibility: unsalted sha256 hex
  const legacy = crypto.createHash('sha256').update(normalized).digest('hex');
  const expected = Buffer.from(value, 'utf8');
  const actual = Buffer.from(legacy, 'utf8');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function ensureUsersFile() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({}, null, 2), 'utf8');
  }
}

function readUsers() {
  ensureUsersFile();
  const raw = fs.readFileSync(USERS_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function writeUsers(users) {
  ensureUsersFile();
  const tmpPath = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(users, null, 2), 'utf8');
  fs.renameSync(tmpPath, USERS_FILE);
}

function sanitizeUser(user) {
  if (!user) return null;
  const isAdmin = Boolean(user.isAdmin === true || String(user.role || '').toLowerCase() === 'admin');
  const role = isAdmin ? 'admin' : String(user.role || 'user').toLowerCase();
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    stripeCustomerId: user.stripeCustomerId || null,
    role,
    isAdmin
  };
}

router.post('/register', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists in PostgreSQL
    const existing = await db.getUser(email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    // Create user in PostgreSQL
    const userId = 'u_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    await db.createUser(email, {
      user_id: userId, name,
      password_hash: hashPassword(password),
      role: 'user', is_admin: false, tier: 'starter',
      two_factor: JSON.stringify({ enabled: false }),
      created_at: now, updated_at: now
    });

    // Create session token
    const { generateToken } = require('../lib/session');
    const { token, createdAt, expiresAt } = generateToken();
    await db.createSession(token, email, createdAt, expiresAt);

    // Send verification email (non-blocking)
    try {
      const vToken = require('crypto').randomBytes(32).toString('hex');
      const vExp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await db.saveUser(email, { verify_token: vToken, verify_token_exp: vExp });
      const verifyUrl = 'https://forge.projectcoachai.com/verify-email.html?token=' + vToken + '&email=' + encodeURIComponent(email);
      await sendMail({
        from: 'Forge <noreply@projectcoachai.com>',
        to: email,
        subject: 'Welcome to Forge — verify your email',
        html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto">' +
          '<h2 style="color:#ff6b35">Welcome to Forge, ' + name + '!</h2>' +
          '<p>Please verify your email to fully activate your account.</p>' +
          '<a href="' + verifyUrl + '" style="display:inline-block;padding:12px 24px;background:#ff6b35;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a>' +
          '<p style="color:#888;font-size:12px;margin-top:24px">Link expires in 24 hours.</p>' +
          '</div>'
      });
    } catch(mailErr) { console.warn('[Auth] Verification email failed:', mailErr.message); }

    return res.json({
      success: true,
      token,
      user: { userId, email, name, tier: 'starter', role: 'user', isAdmin: false, twoFactorEnabled: false, createdAt: now }
    });
  } catch (error) {
    console.error('[Auth API] register failed:', error.message);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

router.post('/signin', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Load from PostgreSQL
    const user = await db.getUser(email);
    if (!user || !verifyPassword(password, user.passwordHash || user.password_hash)) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Create a real session token in PostgreSQL
    const { generateToken } = require('../lib/session');
    const { token, createdAt, expiresAt } = generateToken();
    await db.createSession(token, email, createdAt, expiresAt);

    // Update last login
    await db.saveUser(email, { last_login: new Date().toISOString() });

    return res.json({
      success: true,
      token,
      user: {
        userId: user.user_id,
        email: user.email,
        name: user.name,
        tier: user.tier || 'starter',
        role: user.role,
        isAdmin: user.is_admin,
        twoFactorEnabled: user.two_factor?.enabled || false
      }
    });
  } catch (error) {
    console.error('[Auth API] signin failed:', error.message);
    return res.status(500).json({ success: false, error: 'Sign-in failed' });
  }
});

router.post('/password-reset/request', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const users = readUsers();
    const user = users[email];
    const genericMessage = 'If an account exists for this email, reset instructions will be sent.';
    if (!user) {
      return res.json({ success: true, message: genericMessage });
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const expiresAt = Date.now() + RESET_WINDOW_MS;
    user.passwordReset = {
      tokenHash,
      expiresAt,
      requestedAt: new Date().toISOString()
    };
    users[email] = user;
    writeUsers(users);

    const resetLinkBase = process.env.AUTH_RESET_LINK_BASE || 'forge://reset-password';
    const resetLink = `${resetLinkBase}?email=${encodeURIComponent(email)}&token=${encodeURIComponent(resetToken)}`;

    let deliveredViaEmail = false;
    try {
      await sendMail({
        from: `"ProjectCoachAI Forge Edition" <no-reply@projectcoachai.com>`,
        to: email,
        subject: 'Reset your ProjectCoachAI password',
        text: [
          `Hi ${user.name || 'there'},`,
          '',
          'We received a request to reset your password.',
          'Use this link to reset it (valid for 15 minutes):',
          resetLink,
          '',
          'If you did not request this, you can ignore this message.'
        ].join('\n')
      });
      deliveredViaEmail = true;
    } catch (mailError) {
      console.warn('⚠️ [Auth API] Password reset email could not be delivered:', mailError?.message || mailError);
    }

    if (!process.env.SMTP_PASS || !deliveredViaEmail) {
      return res.json({
        success: true,
        message: 'Reset token generated for local use. Enter it in the reset form.',
        resetToken,
        deliveryMode: 'local_token'
      });
    }

    return res.json({ success: true, message: genericMessage, deliveryMode: 'email' });
  } catch (error) {
    console.error('❌ [Auth API] password-reset/request failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to process password reset request' });
  }
});

router.post('/password-reset/confirm', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    if (!email || !token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, token, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }

    const users = readUsers();
    const user = users[email];
    if (!user || !user.passwordReset?.tokenHash || !user.passwordReset?.expiresAt) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== user.passwordReset.tokenHash || Date.now() > Number(user.passwordReset.expiresAt)) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();
    delete user.passwordReset;
    users[email] = user;
    writeUsers(users);

    return res.json({ success: true });
  } catch (error) {
    console.error('❌ [Auth API] password-reset/confirm failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

router.post('/password-change', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, current password, and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters long' });
    }

    const users = readUsers();
    const user = users[email];
    if (!user) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }
    if (verifyPassword(newPassword, user.passwordHash)) {
      return res.status(400).json({ success: false, error: 'New password must be different from current password' });
    }

    user.passwordHash = hashPassword(newPassword);
    user.updatedAt = new Date().toISOString();
    users[email] = user;
    writeUsers(users);
    return res.json({ success: true });
  } catch (error) {
    console.error('❌ [Auth API] password-change failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to change password' });
  }
});

// POST /api/auth/signout
router.post('/signout', async (req, res) => {
  try {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    if (token) await db.deleteSession(token);
    res.json({ success: true });
  } catch(err) {
    res.json({ success: true }); // always succeed on signout
  }
});


// GET /api/auth/me — returns current authenticated user profile
router.get('/me', async (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
  const session = await db.getSession(token);
  if (!session) return res.status(401).json({ success: false, error: 'Session expired' });
  req.userEmail = session.user_email;
  try {
    const user = await db.getUser(req.userEmail);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user: {
      email: user.email, name: user.name, tier: user.tier || 'starter',
      role: user.role, isAdmin: user.is_admin, createdAt: user.created_at,
      twoFactorEnabled: user.two_factor?.enabled || false,
      avatar: user.avatar || null
    }});
  } catch(err) {
    console.error('[Auth] me error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load profile' });
  }
});

// GET /api/auth/usage — returns current synthesis usage
router.get('/usage', async (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
  const session = await db.getSession(token);
  if (!session) return res.status(401).json({ success: false, error: 'Session expired' });
  req.userEmail = session.user_email;
  try {
    const usage = await db.getUsage(req.userEmail);
    const user = await db.getUser(req.userEmail);
    const now = new Date();
    const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysUntilReset = Math.ceil((resetDate - now) / (1000 * 60 * 60 * 24));
    res.json({ success: true, usage: {
      used: usage.used, limit: usage.limit, remaining: usage.remaining,
      tier: usage.tier, resetDate: resetDate.toISOString(), daysUntilReset,
      streakCount: user?.streak_count || 0,
      lastActiveDate: user?.last_active_date || null
    }});
  } catch(err) {
    console.error('[Auth] usage error:', err.message);
    res.status(500).json({ success: false, error: 'Could not load usage data' });
  }
});


// PATCH /api/auth/profile — update name and avatar
router.patch('/profile', async (req, res) => {
  try {
    const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required' });
    const session = await db.getSession(token);
    if (!session) return res.status(401).json({ success: false, error: 'Session expired' });
    const { name, avatar } = req.body;
    const fields = {};
    if (name) fields.name = String(name).trim().slice(0, 100);
    if (avatar) fields.avatar = String(avatar).slice(0, 500000); // base64 image
    if (Object.keys(fields).length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });
    await db.saveUser(session.user_email, fields);
    res.json({ success: true });
  } catch(err) {
    console.error('[Auth] profile update error:', err.message);
    res.status(500).json({ success: false, error: 'Could not update profile' });
  }
});

module.exports = router;


// ── Email Verification ────────────────────────────────────────
router.post('/send-verification', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const user = await db.getUser(email);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.email_verified) return res.json({ success: true, message: 'Already verified' });

    const token = require('crypto').randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.saveUser(email, { verify_token: token, verify_token_exp: exp });

    const verifyUrl = 'https://forge.projectcoachai.com/verify-email.html?token=' + token + '&email=' + encodeURIComponent(email);
    await sendMail({
      from: 'Forge <noreply@projectcoachai.com>',
      to: email,
      subject: 'Verify your Forge email',
      html: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto">' +
        '<h2 style="color:#ff6b35">Verify your Forge email</h2>' +
        '<p>Click the button below to verify your email address.</p>' +
        '<a href="' + verifyUrl + '" style="display:inline-block;padding:12px 24px;background:#ff6b35;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a>' +
        '<p style="color:#888;font-size:12px;margin-top:24px">Link expires in 24 hours. If you did not create a Forge account, ignore this email.</p>' +
        '</div>'
    });
    res.json({ success: true, message: 'Verification email sent' });
  } catch (err) {
    console.error('[Auth API] send-verification failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send verification email' });
  }
});

router.get('/verify-email', async (req, res) => {
  try {
    const { token, email } = req.query;
    if (!token || !email) return res.status(400).json({ success: false, error: 'Missing token or email' });

    const user = await db.getUser(decodeURIComponent(email));
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.verify_token !== token) return res.status(400).json({ success: false, error: 'Invalid token' });
    if (new Date(user.verify_token_exp) < new Date()) return res.status(400).json({ success: false, error: 'Token expired' });

    await db.saveUser(decodeURIComponent(email), { email_verified: true, verify_token: null, verify_token_exp: null });
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('[Auth API] verify-email failed:', err.message);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// ── Google OAuth ──────────────────────────────────────────────
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, error: 'No credential provided' });

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Find or create user
    let user = await db.getUser(email);
    if (!user) {
      // Create new user from Google profile
      const userId = require('crypto').randomUUID();
      await db.createUser(email, {
        user_id: userId,
        name,
        avatar: picture,
        tier: 'starter',
        role: 'user',
      });
      user = await db.getUser(email);
    } else if (!user.avatar && picture) {
      // Update avatar if missing
      await db.saveUser(email, { avatar: picture });
      user = await db.getUser(email);
    }

    const { generateToken } = require('../lib/session');
    const { token, createdAt, expiresAt } = generateToken();
    await db.createSession(token, email, createdAt, expiresAt);
    await db.saveUser(email, { last_login: new Date().toISOString() });

    res.json({ success: true, token, user: {
      userId: user.user_id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      tier: user.tier || 'starter',
      role: user.role || 'user',
      isAdmin: user.is_admin || false,
    }});
  } catch (err) {
    console.error('[Auth API] google failed:', err.message);
    res.status(500).json({ success: false, error: 'Google sign-in failed' });
  }
});
