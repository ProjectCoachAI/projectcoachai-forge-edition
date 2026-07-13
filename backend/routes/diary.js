'use strict';
const express = require('express');
const router  = express.Router();
const https   = require('https');
const { requireAuth } = require('../middleware/auth');
const db = require('../lib/db');

// ── Auto-categorization via Claude Haiku ─────────────────────────────────────
const CATEGORIES = [
  'Strategic Planning', 'Market Research', 'Competitor Analysis',
  'Financial Analysis', 'Legal & Compliance', 'Product Development',
  'Marketing & Sales', 'Operations', 'Technology & AI',
  'Personal Development', 'Creative Work', 'Research & Learning',
  'Decision Making', 'Project Management', 'General'
];

async function autoCategorizeDiary(prompt, content, source) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return { category: 'General', tags: [], title: null };
  
  const text = [prompt, content].filter(Boolean).join('\n').slice(0, 1000);
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `Analyze this AI conversation and respond with ONLY a JSON object (no markdown):
{"category": "<one of: ${CATEGORIES.join(', ')}>", "tags": ["<tag1>", "<tag2>", "<tag3>"], "title": "<concise 6-word title>"}

Source: ${source}
Content: ${text}`
    }]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com', port: 443,
      path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text || '{}';
          const clean = text.replace(/```json|```/g, '').trim();
          const result = JSON.parse(clean);
          resolve({
            category: CATEGORIES.includes(result.category) ? result.category : 'General',
            tags: Array.isArray(result.tags) ? result.tags.slice(0, 5) : [],
            title: result.title || null
          });
        } catch(_) { resolve({ category: 'General', tags: [], title: null }); }
      });
    });
    req.on('error', () => resolve({ category: 'General', tags: [], title: null }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ category: 'General', tags: [], title: null }); });
    req.write(body);
    req.end();
  });
}

// ── Follow-up via Claude ──────────────────────────────────────────────────────
async function callClaudeFollowup(conversation, newMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('No API key');

  // Build messages array from conversation blocks (compatibility with old {role,text} format)
  const messages = conversation.map(turn => {
    if (turn.blocks) {
      // New format — extract text blocks only for Claude API
      const textContent = turn.blocks
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      return { role: turn.role, content: textContent };
    }
    // Old format
    return { role: turn.role, content: turn.text || '' };
  });

  // Add new user message
  messages.push({ role: 'user', content: newMessage });

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', port: 443,
      path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.content?.[0]?.text || '';
          resolve(text);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Compatibility shim: normalise conversation to blocks format ───────────────
function normaliseConversation(entry) {
  // If conversation already has blocks format, return as-is
  if (entry.conversation && Array.isArray(entry.conversation) && entry.conversation[0]?.blocks) {
    return entry.conversation;
  }
  // Build from prompt + content if no conversation stored
  const turns = [];
  if (entry.prompt) {
    turns.push({ role: 'user', blocks: [{ type: 'text', text: entry.prompt }] });
  }
  if (entry.content) {
    turns.push({ role: 'assistant', blocks: [{ type: 'text', text: entry.content }] });
  }
  // Also handle old {role, text} format
  if (entry.conversation && Array.isArray(entry.conversation)) {
    return entry.conversation.map(t => ({
      role: t.role,
      blocks: [{ type: 'text', text: t.text || '' }]
    }));
  }
  return turns;
}

// ── Ensure columns exist (self-healing) ──────────────────────────────────────
let _columnsEnsured = false;
async function ensureColumns() {
  if (_columnsEnsured) return;
  try {
    await db.query(`ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS rating TEXT`);
    await db.query(`ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
    _columnsEnsured = true;
  } catch(_) {}
}

// ── GET /api/diary/usage ──────────────────────────────────────────────────────
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const { source } = req.query;
    const r = await db.query('SELECT tier FROM users WHERE email=$1', [req.userEmail]);
    const user = r.rows[0] || {};
    const tier = user.tier || 'starter';
    const PAID_TIERS = ['creator', 'professional', 'team', 'pro', 'diary-pro', 'forge'];
    const isPaid = PAID_TIERS.some(t => tier.includes(t));

    let countR;
    if (source) {
      countR = await db.query(
        `SELECT COUNT(*) AS count FROM diary_entries
         WHERE user_email=$1 AND source=$2 AND created_at >= date_trunc('month', NOW())`,
        [req.userEmail, source]
      );
    } else {
      countR = await db.query('SELECT COUNT(*) AS count FROM diary_entries WHERE user_email=$1', [req.userEmail]);
    }
    const savesCount = parseInt(countR.rows[0]?.count || 0);
    const monthlyR = await db.query(
      `SELECT COUNT(*) AS count FROM diary_entries
       WHERE user_email=$1 AND created_at >= date_trunc('month', NOW())`,
      [req.userEmail]
    );
    const savesThisMonth = parseInt(monthlyR.rows[0]?.count || 0);
    const FREE_LIMIT = 10;
    res.json({
      ok: true, tier, saves_count: savesCount, saves_this_month: savesThisMonth,
      saves_limit: isPaid ? null : FREE_LIMIT, is_paid: isPaid,
      remaining: isPaid ? null : Math.max(0, FREE_LIMIT - savesCount)
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ── GET /api/diary — fetch entries list ──────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureColumns();
    const { category, source, limit = 25, offset = 0 } = req.query;
    const pageLimit = Math.min(parseInt(limit) || 25, 100);
    const pageOffset = Math.max(parseInt(offset) || 0, 0);

    let whereSql = ` WHERE user_email = $1`;
    const params = [req.userEmail];
    if (category && category !== 'all') { params.push(category); whereSql += ` AND category = $${params.length}`; }
    if (source && source !== 'all')     { params.push(source);   whereSql += ` AND source = $${params.length}`; }

    const countR = await db.query(`SELECT COUNT(*) AS total FROM diary_entries${whereSql}`, params);
    const total = parseInt(countR.rows[0]?.total || 0);

    const dataParams = [...params, pageLimit, pageOffset];
    const sql = `SELECT id, source, title, prompt, content, document_text,
                        conversation, decision_note, category, tags, metadata, rating, created_at, updated_at
                 FROM diary_entries${whereSql}
                 ORDER BY created_at DESC
                 LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
    const rows = await db.query(sql, dataParams);

    res.json({
      success: true,
      entries: rows.rows,
      pagination: {
        total, limit: pageLimit, offset: pageOffset,
        page: Math.floor(pageOffset / pageLimit) + 1,
        totalPages: Math.max(Math.ceil(total / pageLimit), 1)
      }
    });
  } catch(e) {
    console.error('[Diary] GET error:', e.message);
    res.status(500).json({ success: false, error: 'Could not load diary' });
  }
});

// ── GET /api/diary/search ─────────────────────────────────────────────────────
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, entries: [] });
    const r = await db.query(
      `SELECT id, source, title, prompt, content, category, tags, created_at
       FROM diary_entries
       WHERE user_email = $1
         AND (search_text ILIKE $2 OR title ILIKE $2 OR prompt ILIKE $2
              OR content ILIKE $2 OR category ILIKE $2 OR $3 = ANY(tags))
       ORDER BY created_at DESC LIMIT 50`,
      [req.userEmail, `%${q}%`, q.toLowerCase()]
    );
    res.json({ success: true, entries: r.rows });
  } catch(e) {
    console.error('[Diary] SEARCH error:', e.message);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ── GET /api/diary/categories ─────────────────────────────────────────────────
router.get('/categories', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT category, COUNT(*) as count FROM diary_entries
       WHERE user_email = $1 GROUP BY category ORDER BY count DESC`,
      [req.userEmail]
    );
    res.json({ success: true, categories: r.rows });
  } catch(e) {
    res.status(500).json({ success: false, error: 'Could not load categories' });
  }
});


// ── GET /api/diary/:id — single entry as full conversation ────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    await ensureColumns();
    const r = await db.query(
      `SELECT id, source, title, prompt, content, document_text,
              conversation, decision_note, category, tags, metadata,
              rating, created_at, updated_at
       FROM diary_entries WHERE id=$1 AND user_email=$2`,
      [req.params.id, req.userEmail]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const entry = r.rows[0];
    const conversation = normaliseConversation(entry);
    res.json({ success: true, entry: { ...entry, conversation } });
  } catch(e) {
    console.error('[Diary] GET /:id error:', e.message);
    res.status(500).json({ success: false, error: 'Could not load entry' });
  }
});


// ── POST /api/diary/:id/followup — append new turn ───────────────────────────
router.post('/:id/followup', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Message required' });
    }

    // Load existing entry
    const r = await db.query(
      `SELECT id, source, prompt, content, conversation FROM diary_entries
       WHERE id=$1 AND user_email=$2`,
      [req.params.id, req.userEmail]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, error: 'Not found' });
    const entry = r.rows[0];

    // Get current conversation
    let conversation = normaliseConversation(entry);

    // Call Claude for follow-up
    const aiResponse = await callClaudeFollowup(conversation, message.trim());

    // Append new turns
    conversation = [
      ...conversation,
      { role: 'user', blocks: [{ type: 'text', text: message.trim() }] },
      { role: 'assistant', blocks: [{ type: 'text', text: aiResponse }] }
    ];

    // Persist updated conversation
    await db.query(
      `UPDATE diary_entries
       SET conversation = $1, updated_at = NOW()
       WHERE id = $2 AND user_email = $3`,
      [JSON.stringify(conversation), req.params.id, req.userEmail]
    );

    res.json({ success: true, conversation, aiResponse });
  } catch(e) {
    console.error('[Diary] FOLLOWUP error:', e.message);
    res.status(500).json({ success: false, error: 'Follow-up failed: ' + e.message });
  }
});

// ── POST /api/diary — save entry ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { source, title, prompt, content, document_text, conversation, metadata } = req.body;
    if (!source) return res.status(400).json({ success: false, error: 'Source required' });

    // Free tier limit
    try {
      const userRow = await db.query('SELECT tier FROM users WHERE email=$1', [req.userEmail]);
      const user = userRow.rows[0] || {};
      const tier = user.tier || 'starter';
      const PAID_TIERS = ['creator', 'professional', 'team', 'pro', 'diary-pro', 'forge'];
      const isPaid = PAID_TIERS.some(t => tier.includes(t));
      const countR = await db.query('SELECT COUNT(*) AS count FROM diary_entries WHERE user_email=$1', [req.userEmail]);
      const savesCount = parseInt(countR.rows[0]?.count || 0);
      const FREE_LIMIT = 10;
      if (!isPaid && savesCount >= FREE_LIMIT) {
        return res.status(402).json({
          success: false, error: 'free_limit_reached',
          saves_count: savesCount, saves_limit: FREE_LIMIT,
          message: "You've used all 10 free saves. Upgrade to Pro to save without limits."
        });
      }
    } catch(limitErr) {
      console.warn('[Diary] Free limit check failed:', limitErr.message);
    }

    // Build structured conversation if not provided
    // Normalise to blocks format for new saves
    let structuredConversation = conversation || null;
    if (!structuredConversation && (prompt || content)) {
      structuredConversation = [];
      if (prompt) structuredConversation.push({ role: 'user', blocks: [{ type: 'text', text: prompt }] });
      if (content) structuredConversation.push({ role: 'assistant', blocks: [{ type: 'text', text: content }] });
    } else if (structuredConversation && !structuredConversation[0]?.blocks) {
      // Convert old format to blocks
      structuredConversation = structuredConversation.map(t => ({
        role: t.role,
        blocks: [{ type: 'text', text: t.text || '' }]
      }));
    }

    // Auto-categorize
    let category = 'General', tags = [], autoTitle = title || null;
    try {
      const cat = await autoCategorizeDiary(prompt, content, source);
      category = cat.category;
      tags = cat.tags;
      if (!autoTitle) autoTitle = cat.title;
    } catch(_) {}

    const searchText = [prompt, content, autoTitle, tags.join(' ')].filter(Boolean).join(' ').slice(0, 5000);

    const r = await db.query(
      `INSERT INTO diary_entries
         (user_email, source, title, prompt, content, document_text,
          conversation, category, tags, search_text, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, created_at`,
      [
        req.userEmail, source, autoTitle, prompt || null, content || null,
        document_text || null,
        structuredConversation ? JSON.stringify(structuredConversation) : null,
        category, tags, searchText,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    await db.query('UPDATE users SET diary_saves_count = diary_saves_count + 1 WHERE email=$1', [req.userEmail]).catch(()=>{});
    console.log(`[Diary] Saved: ${source} → ${category} for ${req.userEmail}`);
    res.json({ success: true, id: r.rows[0].id, created_at: r.rows[0].created_at, category, tags });
  } catch(e) {
    console.error('[Diary] POST error:', e.message);
    res.status(500).json({ success: false, error: 'Could not save entry' });
  }
});

// ── PATCH /api/diary/:id ──────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    await ensureColumns();
    const { decision_note, category } = req.body;
    const hasRating = Object.prototype.hasOwnProperty.call(req.body, 'rating');
    const rating = hasRating ? req.body.rating : undefined;
    if (hasRating && rating !== null && rating !== 'up' && rating !== 'down') {
      return res.status(400).json({ success: false, error: 'rating must be "up", "down", or null' });
    }

    if (hasRating) {
      await db.query(
        `UPDATE diary_entries
         SET decision_note = COALESCE($1, decision_note),
             category = COALESCE($2, category),
             rating = $3, updated_at = NOW()
         WHERE id = $4 AND user_email = $5`,
        [decision_note ?? null, category ?? null, rating, req.params.id, req.userEmail]
      );
    } else {
      await db.query(
        `UPDATE diary_entries
         SET decision_note = COALESCE($1, decision_note),
             category = COALESCE($2, category),
             updated_at = NOW()
         WHERE id = $3 AND user_email = $4`,
        [decision_note ?? null, category ?? null, req.params.id, req.userEmail]
      );
    }
    res.json({ success: true });
  } catch(e) {
    console.error('[Diary] PATCH error:', e.message);
    res.status(500).json({ success: false, error: 'Could not update entry' });
  }
});

// ── DELETE /api/diary/:id ─────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM diary_entries WHERE id = $1 AND user_email = $2',
      [req.params.id, req.userEmail]);
    res.json({ success: true });
  } catch(e) {
    console.error('[Diary] DELETE error:', e.message);
    res.status(500).json({ success: false, error: 'Could not delete entry' });
  }
});

module.exports = router;
