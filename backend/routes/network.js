'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const { sendMail } = require('../lib/emailTransport');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// POST /api/network/apply — submit network application
router.post('/apply', async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ ok: false, error: 'Name and email required' });

    // Save to DB
    await db.query(
      `INSERT INTO network_applications (name, email, status, created_at)
       VALUES ($1, $2, 'pending', NOW())
       ON CONFLICT (email) DO UPDATE SET name=$1, updated_at=NOW()`,
      [name, email]
    );

    // Email admin
    await sendMail({
      from: 'Forge Network <hello@projectcoachai.com>',
      to: 'daniel.jones@xencoreglobal.com',
      subject: 'New Forge Network Application: ' + name,
      html: `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#f97316">New Forge Network Application</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><a href="https://forge.projectcoachai.com/command-center.html" style="background:#f97316;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px">Review in Command Center →</a></p>
      </div>`
    }).catch(e => console.warn('[Network] admin email failed:', e.message));

    // Confirmation to applicant
    await sendMail({
      from: 'Forge Network <hello@projectcoachai.com>',
      to: email,
      subject: 'Welcome to The Forge Network 🔥',
      html: `<div style="font-family:sans-serif;max-width:600px;background:#0f0f1a;color:#f0f0f8;padding:32px;border-radius:12px">
        <h2 style="color:#f97316">You're in, ${name}!</h2>
        <p style="color:#8888a8">Your application to The Forge Network has been received.</p>
        <p style="color:#8888a8">We'll review it and send your unique referral link within 24 hours.</p>
        <p style="color:#8888a8">In the meantime, start using Forge at <a href="https://forge.projectcoachai.com" style="color:#f97316">forge.projectcoachai.com</a></p>
        <p style="color:#8888a8;margin-top:24px">The Forge Team<br>Xencore Global GmbH · Zurich, Switzerland</p>
      </div>`
    }).catch(e => console.warn('[Network] confirmation email failed:', e.message));

    res.json({ ok: true });
  } catch(e) {
    console.error('[Network] apply error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/network/applications — admin list
router.get('/applications', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT * FROM network_applications ORDER BY created_at DESC LIMIT 200'
    );
    res.json({ ok: true, applications: r.rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /api/network/applications/:id — approve/reject
router.patch('/applications/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, referral_code } = req.body;
    await db.query(
      'UPDATE network_applications SET status=$1, referral_code=$2, reviewed_at=NOW() WHERE id=$3',
      [status, referral_code || null, req.params.id]
    );
    // Send referral link to approved applicant
    if (status === 'approved' && referral_code) {
      const r = await db.query('SELECT * FROM network_applications WHERE id=$1', [req.params.id]);
      const app = r.rows[0];
      if (app) {
        await sendMail({
          from: 'Forge Network <hello@projectcoachai.com>',
          to: app.email,
          subject: 'Your Forge Network referral link is ready 🔥',
          html: `<div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#f97316">Welcome to The Forge Network, ${app.name}!</h2>
            <p>Your unique referral link:</p>
            <p style="font-size:18px;font-weight:700;color:#f97316">
              https://forge.projectcoachai.com/register.html?invite=${referral_code}
            </p>
            <p>Share this link. Every paid referral moves you up the tiers.</p>
            <p>Track your progress at <a href="https://forge.projectcoachai.com/referral.html" style="color:#f97316">forge.projectcoachai.com/referral.html</a></p>
          </div>`
        }).catch(e => console.warn('[Network] approval email failed:', e.message));
      }
    }
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
