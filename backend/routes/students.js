'use strict';
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { sendMail } = require('../lib/emailTransport');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// POST /api/students/verify — submit manual verification request
router.post('/verify', async (req, res) => {
  try {
    const { name, email, institution, country } = req.body;
    if (!name || !email || !institution) return res.status(400).json({ ok: false, error: 'Name, email and institution required' });

    await db.query(
      `INSERT INTO student_verifications(name, email, institution, country)
       VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [name, email, institution, country || '']
    );

    // Email admin
    await sendMail({
      from: 'Forge <hello@projectcoachai.com>',
      to: 'daniel.jones@xencoreglobal.com',
      subject: `New student verification: ${name} — ${institution}`,
      html: `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#E8652A">New Student Verification Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Institution:</strong> ${institution}</p>
        <p><strong>Country:</strong> ${country || 'Not specified'}</p>
        <p><a href="https://forge.projectcoachai.com/command-center">Review in Command Center →</a></p>
      </div>`
    }).catch(e => console.warn('[Students] admin email failed:', e.message));

    // Confirmation to student
    await sendMail({
      from: 'Forge <hello@projectcoachai.com>',
      replyTo: 'students@projectcoachai.com',
      to: email,
      subject: 'We received your student verification — Forge',
      html: `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#E8652A">Got it, ${name}!</h2>
        <p>We've received your student verification request for <strong>${institution}</strong>.</p>
        <p>We'll review it within 24 hours and send your 50% discount code to this email.</p>
        <p>In the meantime, you can start with a free account at <a href="https://forge.projectcoachai.com">forge.projectcoachai.com</a></p>
        <p>The Forge Team</p>
      </div>`
    }).catch(e => console.warn('[Students] confirmation email failed:', e.message));

    res.json({ ok: true });
  } catch(e) {
    console.error('[Students verify]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/students/verifications — admin list
router.get('/verifications', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM student_verifications ORDER BY created_at DESC LIMIT 100');
    res.json({ ok: true, verifications: r.rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /api/students/verifications/:id — approve/reject
router.patch('/verifications/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await db.query(
      'UPDATE student_verifications SET status=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3',
      [status, req.userEmail, req.params.id]
    );
    // If approved — send discount code
    if (status === 'approved') {
      const r = await db.query('SELECT * FROM student_verifications WHERE id=$1', [req.params.id]);
      const student = r.rows[0];
      if (student) {
        await sendMail({
          from: 'Forge <hello@projectcoachai.com>',
          to: student.email,
          subject: 'Your Forge student discount is ready! 🎓',
          html: `<div style="font-family:sans-serif;max-width:600px">
            <h2 style="color:#E8652A">Your 50% student discount is approved!</h2>
            <p>Hi ${student.name},</p>
            <p>Your student status at <strong>${student.institution}</strong> has been verified.</p>
            <p>Use code <strong style="font-size:20px;color:#E8652A">STUDENT50</strong> at checkout for 50% off any Forge plan.</p>
            <p><a href="https://forge.projectcoachai.com/pricing" style="background:#E8652A;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:12px">Claim your discount →</a></p>
          </div>`
        }).catch(e => console.warn('[Students] approval email failed:', e.message));
      }
    }
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
