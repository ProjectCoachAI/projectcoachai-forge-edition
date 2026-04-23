'use strict';
const express   = require('express');
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');
const db        = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

router.post('/setup', requireAuth, async (req, res) => {
  try {
    const user = await db.getUser(req.user.email);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const tf = user.two_factor || {};
    if (tf.enabled) return res.status(400).json({ error: '2FA already enabled. Disable it first.' });
    const secret = speakeasy.generateSecret({ name: `Forge (${user.email})`, issuer: 'Forge' });
    await db.saveUser(user.email, { two_factor: { enabled: false, pending_secret: secret.base32 } });
    const qrUrl = await QRCode.toDataURL(secret.otpauth_url);
    return res.json({ ok: true, secret: secret.base32, qrUrl });
  } catch (err) { console.error('[2FA] setup:', err); return res.status(500).json({ error: 'Setup failed' }); }
});

router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Invalid code format' });
    const user = await db.getUser(req.user.email);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const tf = user.two_factor || {};
    if (!tf.pending_secret) return res.status(400).json({ error: 'No pending setup. Start again.' });
    const valid = speakeasy.totp.verify({ secret: tf.pending_secret, encoding: 'base32', token: code, window: 2 });
    if (!valid) return res.status(400).json({ error: 'Invalid code. Check your app and try again.' });
    await db.saveUser(user.email, { two_factor: { enabled: true, secret: tf.pending_secret, enabled_at: new Date().toISOString() } });
    return res.json({ ok: true });
  } catch (err) { console.error('[2FA] verify:', err); return res.status(500).json({ error: 'Verification failed' }); }
});

router.post('/disable', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Invalid code format' });
    const user = await db.getUser(req.user.email);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const tf = user.two_factor || {};
    if (!tf.enabled) return res.status(400).json({ error: '2FA is not enabled' });
    const valid = speakeasy.totp.verify({ secret: tf.secret, encoding: 'base32', token: code, window: 2 });
    if (!valid) return res.status(400).json({ error: 'Invalid code.' });
    await db.saveUser(user.email, { two_factor: { enabled: false } });
    return res.json({ ok: true });
  } catch (err) { console.error('[2FA] disable:', err); return res.status(500).json({ error: 'Failed to disable' }); }
});

module.exports = router;