'use strict';
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { sendMail } = require('../lib/emailTransport');

const SUBMISSIONS_PATH = path.join(__dirname, '../data/blog-submissions.json');

function loadSubmissions() {
  try {
    const dir = require('path').dirname(SUBMISSIONS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(SUBMISSIONS_PATH)) fs.writeFileSync(SUBMISSIONS_PATH, '[]');
    return JSON.parse(fs.readFileSync(SUBMISSIONS_PATH, 'utf-8'));
  } catch(_) { return []; }
}
function saveSubmissions(subs) {
  try {
    const dir = require('path').dirname(SUBMISSIONS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SUBMISSIONS_PATH, JSON.stringify(subs, null, 2));
  } catch(e) { console.warn('[Blog] saveSubmissions failed:', e.message); }
}

// POST /api/blog/submit
router.post('/submit', requireAuth, async (req, res) => {
  try {
    const { title, category, content, note, prompt } = req.body;
    if (!title || !content) return res.status(400).json({ ok: false, error: 'Title and content required' });

    const user = req.user;
    const submission = {
      id: Date.now(),
      title, category, content, note, prompt,
      author: user.name || user.email,
      email: user.email,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    const subs = loadSubmissions();
    subs.unshift(submission);
    saveSubmissions(subs);

    // Notify admin
    await sendMail({
      from: 'Forge <hello@projectcoachai.com>',
      to: 'daniel.jones@xencoreglobal.com',
      subject: `New blog submission: "${title}"`,
      html: `<div style="font-family:sans-serif;max-width:600px">
        <h2 style="color:#E8652A">New Blog Submission</h2>
        <p><strong>Author:</strong> ${user.name || user.email}</p>
        <p><strong>Title:</strong> ${title}</p>
        <p><strong>Category:</strong> ${category}</p>
        ${note ? `<p><strong>Note:</strong> ${note}</p>` : ''}
        <hr/>
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.6">${content.slice(0,500)}...</div>
        <hr/>
        <p><a href="https://forge.projectcoachai.com/command-center">Review in Command Center →</a></p>
      </div>`
    }).catch(e => console.warn('Blog notification email failed:', e.message));

    res.json({ ok: true, id: submission.id });
  } catch(e) {
    console.error('[Blog submit]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/blog/submissions — admin only
const { requireAdmin } = require('../middleware/auth');
router.get('/submissions', requireAuth, requireAdmin, (req, res) => {
  res.json({ ok: true, submissions: loadSubmissions() });
});

// PATCH /api/blog/submissions/:id/status
router.patch('/submissions/:id/status', requireAuth, requireAdmin, (req, res) => {
  const subs = loadSubmissions();
  const sub = subs.find(s => String(s.id) === String(req.params.id));
  if (sub) { sub.status = req.body.status || 'approved'; saveSubmissions(subs); }
  res.json({ ok: true });
});

module.exports = router;
