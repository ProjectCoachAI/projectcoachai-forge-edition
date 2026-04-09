const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// emailTransport is optional — password reset emails won't send without it
let sendMail = async () => { console.warn('⚠️  emailTransport not found — email not sent'); };
try { ({ sendMail } = require('../lib/emailTransport')); } catch (_) {}
try { if (!sendMail._loaded) ({ sendMail } = require('../emailTransport')); } catch (_) {}
const { generateToken, pruneSessionsMap } = require('../lib/session');
const { requireAuth } = require('../middleware/auth');

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
  // Direct write — simple and reliable on all platforms including Windows
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  console.log(`💾 [Users] saved (${Object.keys(users).length} users)`);
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
    console.log(`📝 [Register] attempt: ${email}`);

    if (!name || !email || !password) {
      console.log(`📝 [Register] rejected: missing fields`);
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    }

    const users = readUsers();
    if (users[email]) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists' });
    }

    const user = {
      userId: crypto.randomBytes(16).toString('hex'),
      name,
      email,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      twoFactor: {
        enabled: false,
        secret: '',
        backupCodeHashes: [],
        enabledAt: null,
        reminderDismissedAt: null
      },
      stripeCustomerId: null,
      role: 'user',
      isAdmin: false
    };

    // Issue session token immediately on registration
    const session = generateToken();
    user.sessions = { [session.token]: { createdAt: session.createdAt, expiresAt: session.expiresAt } };

    users[email] = user;
    writeUsers(users);
    console.log(`✅ [Register] success: ${email}`);

    return res.json({ success: true, token: session.token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('❌ [Auth API] register failed:', error);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

router.post('/signin', async (req, res) => {
  console.log(`🔑 [Signin] attempt: ${req.body?.email}`);
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const users = readUsers();
    const user = users[email];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    // Automatic migration of legacy hashes to salted scrypt.
    if (!String(user.passwordHash || '').startsWith('scrypt$')) {
      user.passwordHash = hashPassword(password);
    }

    user.lastLogin = new Date().toISOString();
    user.updatedAt = new Date().toISOString();

    // Issue session token
    if (!user.sessions || typeof user.sessions !== 'object') user.sessions = {};
    const session = generateToken();
    user.sessions[session.token] = { createdAt: session.createdAt, expiresAt: session.expiresAt };
    pruneSessionsMap(user.sessions); // keep at most 5 active sessions

    users[email] = user;
    writeUsers(users);

    return res.json({ success: true, token: session.token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('❌ [Auth API] signin failed:', error);
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

// Sign out — invalidate the current session token
router.post('/signout', (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const parts = authHeader.trim().split(/\s+/);
    const token = parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : null;
    if (!token) return res.json({ success: true });

    const users = readUsers();
    for (const [, user] of Object.entries(users)) {
      if (user.sessions && user.sessions[token]) {
        delete user.sessions[token];
        break;
      }
    }
    writeUsers(users);
    return res.json({ success: true });
  } catch (error) {
    console.error('❌ [Auth API] signout failed:', error);
    return res.status(500).json({ success: false, error: 'Sign-out failed' });
  }
});

// Get current user from token (used on page load to restore session)
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const parts = authHeader.trim().split(/\s+/);
    const token = parts.length === 2 && parts[0].toLowerCase() === 'bearer' ? parts[1] : null;
    if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const { extractBearerToken, isTokenValid } = require('../lib/session');
    const users = readUsers();
    const userCount = Object.keys(users).length;
    console.log(`👤 [/me] token lookup — ${userCount} users in DB, token: ${token.slice(0,8)}...`);
    for (const [email, user] of Object.entries(users)) {
      const session = (user.sessions || {})[token];
      if (session && isTokenValid(session)) {
        console.log(`✅ [/me] found valid session for ${email}`);
        return res.json({ success: true, user: sanitizeUser(user) });
      }
    }
    console.log(`❌ [/me] token not found in any user session`);
    return res.status(401).json({ success: false, error: 'Session expired' });
  } catch (error) {
    console.error('❌ [Auth API] /me failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to get current user' });
  }
});

// ── Temporary admin setup endpoint ───────────────────────────────────────────
// Creates/resets the admin account. Remove after first use.
router.post('/setup-admin', async (req, res) => {
  try {
    const { secret, password } = req.body;
    // Simple secret to prevent unauthorized access
    if (secret !== 'forge-setup-2026') {
      return res.status(403).json({ success: false, error: 'Invalid secret' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password too short' });
    }
    const users = readUsers();
    users['daniel.jones@projectcoachai.com'] = {
      userId: 'admin001',
      name: 'Daniel Jones',
      email: 'daniel.jones@projectcoachai.com',
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      twoFactor: { enabled: false, secret: '', backupCodeHashes: [], enabledAt: null, reminderDismissedAt: null },
      stripeCustomerId: null,
      role: 'admin',
      isAdmin: true,
      sessions: {},
      lastLogin: null
    };
    writeUsers(users);
    console.log('✅ Admin account created/reset for daniel.jones@projectcoachai.com');
    return res.json({ success: true, message: 'Admin account ready. Delete this endpoint now.' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/auth/usage ───────────────────────────────────────────────────────
// Returns current month synthesis usage for the authenticated user
router.get('/usage', requireAuth, (req, res) => {
  const users = readUsers();
  const user  = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const TIER_MONTHLY = {
    starter: 30, lite: 100, creator: 100, pro: 300, professional: 300,
    team: null, enterprise: null,
  };

  const tier  = user.tier || 'starter';
  const limit = TIER_MONTHLY[tier] ?? null; // null = unlimited
  const ym    = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();

  const usage   = user.synthesisUsage?.[ym] || { used: 0, entries: [] };
  const used    = usage.used || 0;
  const entries = usage.entries || [];

  // Performance stats from prompt usage
  const totalPrompts = Object.values(user.synthesisUsage || {}).reduce((s, m) => s + (m.used || 0), 0);

  res.json({
    success: true,
    usage: {
      used,
      limit,
      remaining: limit !== null ? Math.max(0, limit - used) : null,
      entries,
      tier,
      totalSyntheses: totalPrompts,
    }
  });
});

module.exports = router;
