const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { query } = require('../lib/db');
const https = require('https');

function buildRawEmail(from, to, subject, htmlBody) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ];
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

router.post('/send', requireAuth, async (req, res) => {
  const { to, subject, body } = req.body;
  if (!to || !subject || !body)
    return res.status(400).json({ success: false, error: 'to, subject, and body are required' });

  const r = await query(
    'SELECT email, google_access_token, google_token_expiry FROM users WHERE email = $1',
    [req.userEmail]
  ).catch(() => ({ rows: [] }));

  const user = r.rows[0];

  if (!user?.google_access_token)
    return res.status(401).json({ success: false, error: 'gmail_not_connected' });

  if (user.google_token_expiry && Date.now() > Number(user.google_token_expiry))
    return res.status(401).json({ success: false, error: 'gmail_token_expired' });

  const postData = JSON.stringify({ raw: buildRawEmail(user.email, to, subject, body) });

  const gmailRes = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'gmail.googleapis.com',
      path: '/gmail/v1/users/me/messages/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.google_access_token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (r) => {
      let data = '';
      r.on('data', c => data += c);
      r.on('end', () => resolve({ status: r.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  if (gmailRes.status >= 200 && gmailRes.status < 300) {
    console.log(`[Email] Sent: ${user.email} → ${to}`);
    res.json({ success: true });
  } else {
    console.error(`[Email] Gmail API ${gmailRes.status}:`, gmailRes.body);
    res.status(502).json({ success: false, error: 'gmail_send_failed' });
  }
});

module.exports = router;
