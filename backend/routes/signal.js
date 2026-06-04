'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');

// ── Create signals table ──────────────────────────────────────────────────────
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS forge_signals (
      id           SERIAL PRIMARY KEY,
      title        TEXT NOT NULL,
      summary      TEXT NOT NULL,
      source_url   TEXT,
      source_name  TEXT,
      author       TEXT,
      category     TEXT DEFAULT 'general',
      ai_perspectives JSONB,
      ai_synthesis TEXT,
      status       TEXT DEFAULT 'draft',
      tags         TEXT[],
      views        INTEGER DEFAULT 0,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      published_at TIMESTAMPTZ,
      updated_at   TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_signals_status    ON forge_signals(status);
    CREATE INDEX IF NOT EXISTS idx_signals_category  ON forge_signals(category);
    CREATE INDEX IF NOT EXISTS idx_signals_created   ON forge_signals(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_signals_search    ON forge_signals USING gin(to_tsvector('english', title || ' ' || summary));
  `);
}
ensureTable().catch(e => console.error('[Signal] Table init error:', e.message));

// ── GET /api/signal — list published signals ──────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, search, limit = 20, offset = 0 } = req.query;
    let query = `SELECT id, title, summary, source_url, source_name, author, category,
                   ai_synthesis, tags, views, published_at, created_at
                 FROM forge_signals WHERE status = 'published'`;
    const params = [];
    if (category && category !== 'all') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (search) {
      params.push(search);
      query += ` AND to_tsvector('english', title || ' ' || summary) @@ plainto_tsquery($${params.length})`;
    }
    query += ` ORDER BY published_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(parseInt(limit), parseInt(offset));
    const result = await db.query(query, params);
    res.json({ success: true, signals: result.rows });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/signal/:id — get single signal ───────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM forge_signals WHERE id = $1 AND status = 'published'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    // Increment view count
    await db.query(`UPDATE forge_signals SET views = views + 1 WHERE id = $1`, [req.params.id]);
    res.json({ success: true, signal: result.rows[0] });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/signal — create signal (admin only) ─────────────────────────────
router.post('/', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const userResult = await db.query(
      `SELECT id, role FROM users WHERE token = $1`, [token]
    );
    const user = userResult.rows[0];
    if (!user || !['admin','super_admin','editor'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { title, summary, source_url, source_name, author, category, tags, status } = req.body;
    if (!title || !summary) return res.status(400).json({ success: false, error: 'Title and summary required' });
    const result = await db.query(
      `INSERT INTO forge_signals (title, summary, source_url, source_name, author, category, tags, status, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, summary, source_url, source_name, author || 'The Forge Signal',
       category || 'general', tags || [], status || 'draft',
       status === 'published' ? new Date() : null]
    );
    res.json({ success: true, signal: result.rows[0] });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── PATCH /api/signal/:id — update signal (admin only) ───────────────────────
router.patch('/:id', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const userResult = await db.query(`SELECT role FROM users WHERE token = $1`, [token]);
    const user = userResult.rows[0];
    if (!user || !['admin','super_admin','editor'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const { title, summary, source_url, source_name, author, category, tags, status, ai_perspectives, ai_synthesis } = req.body;
    const result = await db.query(
      `UPDATE forge_signals SET
        title = COALESCE($1, title),
        summary = COALESCE($2, summary),
        source_url = COALESCE($3, source_url),
        source_name = COALESCE($4, source_name),
        author = COALESCE($5, author),
        category = COALESCE($6, category),
        tags = COALESCE($7, tags),
        status = COALESCE($8, status),
        ai_perspectives = COALESCE($9, ai_perspectives),
        ai_synthesis = COALESCE($10, ai_synthesis),
        published_at = CASE WHEN $8 = 'published' AND published_at IS NULL THEN NOW() ELSE published_at END,
        updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [title, summary, source_url, source_name, author, category, tags, status,
       ai_perspectives ? JSON.stringify(ai_perspectives) : null, ai_synthesis, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, signal: result.rows[0] });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/signal/:id/analyze — run Forge AI on signal ────────────────────
router.post('/:id/analyze', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const userResult = await db.query(`SELECT role FROM users WHERE token = $1`, [token]);
    const user = userResult.rows[0];
    if (!user || !['admin','super_admin','editor'].includes(user.role)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    const signalResult = await db.query(`SELECT * FROM forge_signals WHERE id = $1`, [req.params.id]);
    const signal = signalResult.rows[0];
    if (!signal) return res.status(404).json({ success: false, error: 'Not found' });

    // Call Anthropic API for analysis
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = `You are an expert analyst for The Forge Signal — an AI intelligence briefing for decision-makers.

Analyse this news signal and provide THREE distinct perspectives from different angles (e.g. business, technology, society/policy), then a synthesis of what this means for decision-makers.

Signal: "${signal.title}"
Summary: "${signal.summary}"
${signal.source_url ? 'Source: ' + signal.source_url : ''}

Respond in JSON format:
{
  "perspectives": [
    { "angle": "Business Impact", "content": "..." },
    { "angle": "Technology Implications", "content": "..." },
    { "angle": "Society & Policy", "content": "..." }
  ],
  "synthesis": "What this means for your decisions: ...",
  "key_takeaway": "One sentence decision-maker takeaway"
}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });

    let analysis;
    try {
      const text = message.content[0].text;
      const json = text.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(json);
    } catch(e) {
      return res.status(500).json({ success: false, error: 'Failed to parse AI analysis' });
    }

    // Save analysis to database
    await db.query(
      `UPDATE forge_signals SET ai_perspectives = $1, ai_synthesis = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(analysis.perspectives), analysis.synthesis + '\n\n' + analysis.key_takeaway, req.params.id]
    );

    res.json({ success: true, analysis });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
