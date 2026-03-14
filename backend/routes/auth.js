const express = require('express');
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
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    stripeCustomerId: user.stripeCustomerId || null
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
      stripeCustomerId: null
    };

    users[email] = user;
    writeUsers(users);

    return res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    console.error('❌ [Auth API] register failed:', error);
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
    users[email] = user;
    writeUsers(users);

    return res.json({ success: true, user: sanitizeUser(user) });
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

module.exports = router;
