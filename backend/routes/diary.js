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

// ── Ensure rating column exists (self-healing, no manual migration needed) ───
let _ratingColumnEnsured = false;
async function ensureRatingColumn() {
  if (_ratingColumnEnsured) return;
  try {
    await db.query(`ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS rating TEXT`);
    _ratingColumnEnsured = true;
  } catch(_) {}
}

// ── Column migration: add conversation_count if missing ──────────────────────
(async () => {
  try {
    await db.query(`ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS conversation_count INTEGER DEFAULT 0`);
    await db.query(`ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS search_text TEXT`);
    await db.query(`CREATE TABLE IF NOT EXISTS diary_pending_prompts (
      user_email TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE TABLE IF NOT EXISTS diary_search_log (
      id SERIAL PRIMARY KEY,
      user_email TEXT NOT NULL,
      search_date DATE NOT NULL,
      query TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_search_log_user_date ON diary_search_log(user_email, search_date)`);
    console.log('[Diary] Column migration complete');
  } catch(e) { console.warn('[Diary] Migration warning:', e.message); }
})();

// ── GET /api/diary/usage — fetch saves count and limit for current user ──────
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
      // Scoped usage for a specific source (e.g. Sweep's own "this month"
      // counter) — resets each calendar month, unlike Diary's own all-time count.
      countR = await db.query(
        `SELECT COUNT(*) AS count FROM diary_entries
         WHERE user_email=$1 AND source=$2 AND created_at >= date_trunc('month', NOW())`,
        [req.userEmail, source]
      );
    } else {
      // Diary's own all-time count — live, reflects deletions, no reset.
      countR = await db.query('SELECT COUNT(*) AS count FROM diary_entries WHERE user_email=$1', [req.userEmail]);
    }
    const savesCount = parseInt(countR.rows[0]?.count || 0);
    // Monthly count — always all-time for this month regardless of source
    const monthlyR = await db.query(
      `SELECT COUNT(*) AS count FROM diary_entries
       WHERE user_email=$1 AND created_at >= date_trunc('month', NOW())`,
      [req.userEmail]
    );
    const savesThisMonth = parseInt(monthlyR.rows[0]?.count || 0);
    const FREE_LIMIT = 10;
    res.json({
      ok: true,
      tier,
      saves_count: savesCount,
      saves_this_month: savesThisMonth,
      saves_limit: isPaid ? null : FREE_LIMIT,
      is_paid: isPaid,
      remaining: isPaid ? null : Math.max(0, FREE_LIMIT - savesCount)
    });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── GET /api/diary — fetch entries with optional category/source filter ───────
router.get('/', requireAuth, async (req, res) => {
  try {
    await ensureRatingColumn();
    const { category, source, limit = 25, offset = 0 } = req.query;
    const pageLimit = Math.min(parseInt(limit) || 25, 100);
    const pageOffset = Math.max(parseInt(offset) || 0, 0);

    let whereSql = ` WHERE user_email = $1`;
    const params = [req.userEmail];
    if (category && category !== 'all') { params.push(category); whereSql += ` AND category = $${params.length}`; }
    if (source && source !== 'all')     { params.push(source);   whereSql += ` AND source = $${params.length}`; }

    // Total count for pagination controls
    const countR = await db.query(`SELECT COUNT(*) AS total FROM diary_entries${whereSql}`, params);
    const total = parseInt(countR.rows[0]?.total || 0);

    const dataParams = [...params, pageLimit, pageOffset];
    const sql = `SELECT id, source, title, prompt, content, document_text,
                        conversation, decision_note, category, tags, metadata, rating, conversation_count, created_at, updated_at
                 FROM diary_entries${whereSql}
                 ORDER BY created_at DESC
                 LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
    const r = await db.query(sql, dataParams);

    res.json({
      success: true,
      entries: r.rows,
      pagination: {
        total,
        limit: pageLimit,
        offset: pageOffset,
        page: Math.floor(pageOffset / pageLimit) + 1,
        totalPages: Math.max(Math.ceil(total / pageLimit), 1)
      }
    });
  } catch(e) {
    console.error('[Diary] GET error:', e.message);
    res.status(500).json({ success: false, error: 'Could not load diary' });
  }
});

// ── GET /api/diary/search — multi-term intent-based search ──────────────────
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, entries: [] });

    // ── Search rate limit: 20/day for free users ──────────────────────────
    const SEARCH_FREE_LIMIT = 20;
    try {
      const userR = await db.query('SELECT tier FROM users WHERE email=$1', [req.userEmail]);
      const tier = (userR.rows[0] || {}).tier || 'starter';
      const PAID_TIERS = ['creator', 'professional', 'team', 'pro', 'diary-pro', 'forge'];
      const isPaid = PAID_TIERS.some(t => tier.includes(t));
      if (!isPaid) {
        const today = new Date().toISOString().slice(0, 10);
        const countR = await db.query(
          `SELECT COUNT(*) FROM diary_search_log WHERE user_email=$1 AND search_date=$2`,
          [req.userEmail, today]
        );
        const searchCount = parseInt(countR.rows[0]?.count || 0);
        if (searchCount >= SEARCH_FREE_LIMIT) {
          return res.status(402).json({
            success: false,
            error: 'search_limit_reached',
            searches_today: searchCount,
            searches_limit: SEARCH_FREE_LIMIT,
            message: `You've used all ${SEARCH_FREE_LIMIT} free searches today. Upgrade to Pro for unlimited searches.`
          });
        }
        // Log this search
        await db.query(
          `INSERT INTO diary_search_log (user_email, search_date, query) VALUES ($1, $2, $3)`,
          [req.userEmail, today, q.slice(0, 200)]
        ).catch(() => {}); // non-blocking
      }
    } catch(limitErr) {
      console.warn('[Diary] Search limit check failed:', limitErr.message);
    }

    // Split query into individual terms (by comma, space, or common separators)
    const terms = q.split(/[,;\s]+/).map(t => t.trim().toLowerCase()).filter(t => t.length > 1);
    if (!terms.length) return res.json({ success: true, entries: [] });

    // Build a query that scores entries by how many terms they match
    const conditions = terms.map((_, i) => `(
      search_text ILIKE $${i+2} OR
      title ILIKE $${i+2} OR
      prompt ILIKE $${i+2} OR
      content ILIKE $${i+2} OR
      category ILIKE $${i+2}
    )`);

    const params = [req.userEmail, ...terms.map(t => `%${t}%`)];

    // Score = number of matching terms; return entries matching at least one term
    const scoreExpr = conditions.map(c => `CASE WHEN ${c} THEN 1 ELSE 0 END`).join(' + ');

    const r = await db.query(
      `SELECT id, source, title, prompt, content, category, tags, conversation_count, created_at,
              (${scoreExpr}) AS match_score
       FROM diary_entries
       WHERE user_email = $1
         AND (${conditions.join(' OR ')})
       ORDER BY match_score DESC, created_at DESC
       LIMIT 50`,
      params
    );
    res.json({ success: true, entries: r.rows });
  } catch(e) {
    console.error('[Diary] SEARCH error:', e.message);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ── GET /api/diary/categories — get category counts for sidebar ───────────────
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

// ── POST /api/diary — save entry with auto-categorization ────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { source, title, prompt, content, document_text, conversation, metadata } = req.body;
    if (!source) return res.status(400).json({ success: false, error: 'Source required' });

    // ── Free tier limit: 10 saves ──────────────────────────────────────────
    // Uses a live count of actual entries (not the old diary_saves_count
    // column) so the enforced limit always matches what /usage displays —
    // deleting entries correctly frees up room again, instead of a counter
    // that only ever went up.
    try {
      const userRow = await db.query('SELECT tier FROM users WHERE email=$1', [req.userEmail]);
      const user = userRow.rows[0] || {};
      const tier = user.tier || 'starter';
      const PAID_TIERS = ['creator', 'professional', 'team', 'pro', 'diary-pro', 'forge'];
      const isPaid = PAID_TIERS.some(t => tier.includes(t));
      const countR = await db.query('SELECT COUNT(*) AS count FROM diary_entries WHERE user_email=$1', [req.userEmail]);
      const savesCount = parseInt(countR.rows[0]?.count || 0);
      const FREE_LIMIT = 9999; // effectively unlimited — monetisation via synthesis credits
      if (!isPaid && savesCount >= FREE_LIMIT) {
        return res.status(402).json({
          success: false,
          error: 'free_limit_reached',
          saves_count: savesCount,
          saves_limit: FREE_LIMIT,
          message: "You've used all 10 free saves. Upgrade to Pro to save without limits."
        });
      }
    } catch(limitErr) {
      console.warn('[Diary] Free limit check failed (column may not exist yet):', limitErr.message);
      // Continue with save — don't block users if limit check fails
    }

    // Auto-categorize (non-blocking — use provided title if given)
    let category = 'General', tags = [], autoTitle = title || null;
    try {
      const cat = await autoCategorizeDiary(prompt, content, source);
      category = cat.category;
      tags = cat.tags;
      if (!autoTitle) autoTitle = cat.title;
    } catch(_) {}

    // Build search text for fast retrieval
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
        conversation ? JSON.stringify(conversation) : null,
        category, tags, searchText,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    // Increment saves count
    await db.query('UPDATE users SET diary_saves_count = diary_saves_count + 1 WHERE email=$1', [req.userEmail]).catch(()=>{});
    console.log(`[Diary] Saved: ${source} → ${category} for ${req.userEmail}`);
    res.json({ success: true, id: r.rows[0].id, created_at: r.rows[0].created_at, category, tags });
  } catch(e) {
    console.error('[Diary] POST error:', e.message);
    res.status(500).json({ success: false, error: 'Could not save entry' });
  }
});

// ── GET /api/diary/by-prompt — find most recent entry for a prompt ───────────
router.get('/by-prompt', requireAuth, async (req, res) => {
  try {
    const { prompt, source } = req.query;
    if (!prompt) return res.status(400).json({ success: false, error: 'prompt required' });
    const r = await db.query(
      `SELECT id, prompt, content, source, conversation_count, created_at
       FROM diary_entries
       WHERE user_email=$1 AND prompt=$2 ${source ? 'AND source=$3' : ''}
       ORDER BY created_at DESC LIMIT 1`,
      source ? [req.userEmail, prompt, source] : [req.userEmail, prompt]
    );
    if (!r.rows.length) return res.json({ success: true, entry: null });
    res.json({ success: true, entry: r.rows[0] });
  } catch(e) {
    console.error('[Diary] by-prompt error:', e.message);
    res.status(500).json({ success: false, error: 'Could not search entry' });
  }
});

// ── GET /api/diary/:id — fetch single entry ──────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, source, title, prompt, content, conversation, metadata, category, tags, conversation_count, created_at
       FROM diary_entries WHERE id=$1 AND user_email=$2`,
      [req.params.id, req.userEmail]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Entry not found' });
    res.json({ success: true, entry: r.rows[0] });
  } catch(e) {
    console.error('[Diary] GET by ID error:', e.message);
    res.status(500).json({ success: false, error: 'Could not fetch entry' });
  }
});

// ── PATCH /api/diary/:id — update decision note, category, rating, or append conversation ─────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    await ensureRatingColumn();
    const { decision_note, category, append_conversation, metadata, search_text, conversation_count, conversation } = req.body;
    const hasRating = Object.prototype.hasOwnProperty.call(req.body, 'rating');
    const rating = hasRating ? req.body.rating : undefined;
    if (hasRating && rating !== null && rating !== 'up' && rating !== 'down') {
      return res.status(400).json({ success: false, error: 'rating must be "up", "down", or null' });
    }

    // Append follow-up conversation to existing entry
    if (metadata || search_text !== undefined || conversation_count !== undefined || conversation !== undefined) {
      const updates = [];
      const vals = [];
      let idx = 1;
      if (metadata) { updates.push(`metadata=$${idx++}`); vals.push(JSON.stringify(metadata)); }
      if (search_text !== undefined) { updates.push(`search_text=$${idx++}`); vals.push(search_text); }
      if (conversation_count !== undefined) { updates.push(`conversation_count=$${idx++}`); vals.push(conversation_count); }
      if (conversation !== undefined) { updates.push(`conversation=$${idx++}`); vals.push(JSON.stringify(conversation)); }
      if (updates.length) {
        updates.push(`updated_at=NOW()`);
        vals.push(req.params.id, req.userEmail);
        await db.query(
          `UPDATE diary_entries SET ${updates.join(', ')} WHERE id=$${idx} AND user_email=$${idx+1}`,
          vals
        );
      }
      if (!append_conversation && !decision_note && !category) return res.json({ success: true });
    }

    if (append_conversation) {
      const existing = await db.query(
        'SELECT content FROM diary_entries WHERE id=$1 AND user_email=$2',
        [req.params.id, req.userEmail]
      );
      if (!existing.rows.length) return res.status(404).json({ success: false, error: 'Entry not found' });
      const existingContent = existing.rows[0].content || '';
      const separator = '\n\n---\n\n**Follow-up conversation:**\n\n';
      // Replace follow-up section (not append) to prevent duplicates on each auto-save
      const baseContent = existingContent.split(separator)[0];
      const newContent = baseContent + separator + append_conversation;
      await db.query(
        `UPDATE diary_entries SET content=$1, updated_at=NOW() WHERE id=$2 AND user_email=$3`,
        [newContent, req.params.id, req.userEmail]
      );
      return res.json({ success: true });
    }

    if (hasRating) {
      await db.query(
        `UPDATE diary_entries
         SET decision_note = COALESCE($1, decision_note),
             category = COALESCE($2, category),
             rating = $3,
             updated_at = NOW()
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

// ── POST /api/diary/pending-prompt — store prompt for provider restore ────────
router.post('/pending-prompt', requireAuth, async (req, res) => {
  try {
    const { prompt, source } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'prompt required' });
    await db.query(
      `INSERT INTO diary_pending_prompts (user_email, prompt, source, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_email) DO UPDATE SET prompt=$2, source=$3, created_at=NOW()`,
      [req.userEmail, prompt.slice(0, 2000), source || '']
    );
    res.json({ success: true });
  } catch(e) {
    console.error('[Diary] pending-prompt POST error:', e.message);
    res.status(500).json({ success: false, error: 'Could not store pending prompt' });
  }
});

// ── GET /api/diary/pending-prompt — retrieve and clear pending prompt ─────────
router.get('/pending-prompt', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT prompt, source, created_at FROM diary_pending_prompts
       WHERE user_email=$1 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [req.userEmail]
    );
    if (!r.rows.length) return res.json({ success: true, pending: null });
    const row = r.rows[0];
    // Clear after retrieval
    await db.query('DELETE FROM diary_pending_prompts WHERE user_email=$1', [req.userEmail]);
    res.json({ success: true, pending: { prompt: row.prompt, source: row.source } });
  } catch(e) {
    console.error('[Diary] pending-prompt GET error:', e.message);
    res.status(500).json({ success: false, error: 'Could not retrieve pending prompt' });
  }
});

module.exports = router;
