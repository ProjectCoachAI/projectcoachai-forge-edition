const express = require('express');
const router = express.Router();
const { sendMail } = require('../lib/emailTransport');

const SUPPORT_EMAIL = 'support@projectcoachai.com';

router.post('/password-reset', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const subject = 'ProjectCoachAI Forge Edition password reset request';
    const text = `A password reset was requested for ${email}. Please follow up with the user and issue a secure reset link.`;

    await sendMail({
      from: `"ProjectCoachAI Forge Edition" <no-reply@projectcoachai.com>`,
      to: SUPPORT_EMAIL,
      subject,
      text,
      replyTo: email
    });

    res.json({ success: true, message: 'Support notified. Please check your email.' });
  } catch (error) {
    console.error('❌ [Account] password reset failed:', error);
    res.status(500).json({ success: false, error: 'Unable to send reset request' });
  }
});

router.post('/password-change-request', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body || {};
    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, current password, and new password are required' });
    }

    const subject = `Change password request for ${email}`;
    const text = `
Requested by: ${email}
Current password: ${currentPassword}
New password: ${newPassword}

Please verify the account and update the password manually.
`.trim();

    await sendMail({
      from: `"ProjectCoachAI Forge Edition" <no-reply@projectcoachai.com>`,
      to: SUPPORT_EMAIL,
      subject,
      text,
      replyTo: email
    });

    res.json({ success: true, message: 'Support notified. They will follow up shortly.' });
  } catch (error) {
    console.error('❌ [Account] change password request failed:', error);
    res.status(500).json({ success: false, error: 'Unable to send change request' });
  }
});

module.exports = router;
