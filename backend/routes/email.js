const express = require('express');
const router = express.Router();
const { sendMail } = require('../lib/emailTransport');
const { getSession } = require('../lib/db');

router.post('/send', async (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ success: false, error: 'Not authenticated' });
  const session = await getSession(token).catch(() => null);
  if (!session) return res.status(401).json({ success: false, error: 'Session expired' });

  const { to, subject, body } = req.body;
  if (!to || !subject || !body)
    return res.status(400).json({ success: false, error: 'to, subject, and body are required' });

  try {
    await sendMail({
      from: 'Forge <noreply@projectcoachai.com>',
      to,
      subject,
      html: body,
    });
    console.log(`[Email] Sent: ${session.user_email} → ${to} | "${subject}"`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    res.status(500).json({ success: false, error: 'Email send failed' });
  }
});

module.exports = router;
