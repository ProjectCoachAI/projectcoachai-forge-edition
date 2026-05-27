const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../lib/db');

// GET /api/diary — fetch all diary entries for user
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, source, title, prompt, content, document_text,
              conversation, decision_note, metadata, created_at, updated_at
       FROM diary_entries
       WHERE user_email = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.userEmail]
    );
    res.json({ success: true, entries: r.rows });
  } catch(e) {
    console.error('[Diary] GET error:', e.message);
    res.status(500).json({ success: false, error: 'Could not load diary' });
  }
});

// POST /api/diary — save a new entry
router.post('/', requireAuth, async (req, res) => {
  try {
    const { source, title, prompt, content, document_text, conversation, metadata } = req.body;
    if (!source) return res.status(400).json({ success: false, error: 'Source required' });

    const r = await db.query(
      `INSERT INTO diary_entries
         (user_email, source, title, prompt, content, document_text, conversation, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, created_at`,
      [
        req.userEmail,
        source,
        title   || null,
        prompt  || null,
        content || null,
        document_text || null,
        conversation ? JSON.stringify(conversation) : null,
        metadata     ? JSON.stringify(metadata)     : null
      ]
    );
    res.json({ success: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
  } catch(e) {
    console.error('[Diary] POST error:', e.message);
    res.status(500).json({ success: false, error: 'Could not save entry' });
  }
});

// PATCH /api/diary/:id — update decision note
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { decision_note } = req.body;
    await db.query(
      `UPDATE diary_entries
       SET decision_note = $1, updated_at = NOW()
       WHERE id = $2 AND user_email = $3`,
      [decision_note || '', req.params.id, req.userEmail]
    );
    res.json({ success: true });
  } catch(e) {
    console.error('[Diary] PATCH error:', e.message);
    res.status(500).json({ success: false, error: 'Could not update note' });
  }
});

// DELETE /api/diary/:id — delete an entry
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM diary_entries WHERE id = $1 AND user_email = $2',
      [req.params.id, req.userEmail]
    );
    res.json({ success: true });
  } catch(e) {
    console.error('[Diary] DELETE error:', e.message);
    res.status(500).json({ success: false, error: 'Could not delete entry' });
  }
});

module.exports = router;
