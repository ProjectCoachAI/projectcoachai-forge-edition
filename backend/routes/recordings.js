'use strict';
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

// POST /api/recordings — save a recording
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, events, isPublic, duration, eventCount, feature } = req.body;
    if (!events || !events.length) return res.status(400).json({ ok: false, error: 'No events provided' });
    const shareToken = crypto.randomBytes(12).toString('hex');
    const eventsJson = JSON.stringify(events);
    const sizeMb = (Buffer.byteLength(eventsJson, 'utf8') / 1024 / 1024).toFixed(2);
    await db.query(
      `INSERT INTO forge_recordings(user_email, title, events_json, is_public, share_token, duration_ms, event_count, feature, size_mb)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.userEmail, title || 'Forge Session', eventsJson, isPublic || false,
       shareToken, duration || 0, eventCount || events.length, feature || 'general', sizeMb]
    );
    res.json({ ok: true, shareToken, shareUrl: isPublic ? `https://forge.projectcoachai.com/replay/${shareToken}` : null });
  } catch(e) {
    console.error('[Recordings]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/recordings — list user's recordings
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, title, share_token, is_public, duration_ms, event_count, feature, size_mb, created_at
       FROM forge_recordings WHERE user_email=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.userEmail]
    );
    res.json({ ok: true, recordings: r.rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/recordings/:token — get recording by share token (public)
router.get('/:token', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT title, events_json, duration_ms, event_count, feature, created_at, is_public
       FROM forge_recordings WHERE share_token=$1`,
      [req.params.token]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Recording not found' });
    const rec = r.rows[0];
    if (!rec.is_public) return res.status(403).json({ ok: false, error: 'This recording is private' });
    res.json({ ok: true, title: rec.title, events: JSON.parse(rec.events_json),
      duration: rec.duration_ms, feature: rec.feature, createdAt: rec.created_at });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /api/recordings/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM forge_recordings WHERE id=$1 AND user_email=$2', [req.params.id, req.userEmail]);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
