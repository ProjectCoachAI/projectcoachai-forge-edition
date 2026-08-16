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
    // NOTE: found_results added — confirmed live and agreed as a real
    // product decision: a search that returns nothing hasn't delivered
    // what the person is actually paying for (a typo or a genuinely
    // empty result shouldn't cost the same as a real find), so the
    // user-facing daily count now only increments for searches that
    // found at least one entry. Existing rows default to true, since
    // historically every logged search DID count toward the limit
    // regardless of outcome — this preserves that behavior for anything
    // logged before this column existed, rather than retroactively
    // (and inaccurately) assuming they all failed.
    await db.query(`ALTER TABLE diary_search_log ADD COLUMN IF NOT EXISTS found_results BOOLEAN DEFAULT true`);
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
    // NOTE: saves_limit and remaining are now unconditionally null —
    // matching the same explicit product decision as the POST /api/diary
    // save-time check above: saves are unlimited for every user, not just
    // paid ones. Previously returned FREE_LIMIT = 10 for free-tier users
    // here specifically, creating a real, user-visible mismatch — the
    // *displayed* limit said 10 while the actual *enforced* limit (before
    // today's fix) was already 9999. is_paid itself is left untouched, as
    // it's still meaningful for other features like search limits.
    res.json({
      ok: true,
      tier,
      saves_count: savesCount,
      saves_this_month: savesThisMonth,
      saves_limit: null,
      is_paid: isPaid,
      remaining: null
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
    const { q, tz } = req.query;
    if (!q) return res.json({ success: true, entries: [] });

    // Split query into individual terms (by comma, space, or common separators)
    const terms = q.split(/[,;\s]+/).map(t => t.trim().toLowerCase()).filter(t => t.length > 1);

    // ── Search rate limits: TWO separate ones, deliberately different ──────
    // NOTE: previously a single, unified check — restructured following a
    // real product decision: a search returning zero results hasn't
    // delivered what the person is actually paying for, so it shouldn't
    // cost the same as a real find. Confirmed via direct simulation
    // (25 no-result searches in a row never hitting the 20-limit; a 21st
    // successful search correctly blocked at exactly 20; a high-volume
    // safety ceiling correctly blocking even all-failed attempts; a paid
    // user never blocked regardless of volume) before implementing here.
    //
    // 1. SEARCH_FREE_LIMIT (20/day) — the real, user-facing limit shown in
    //    the UI and what triggers the upgrade prompt. Only counts
    //    searches that actually found at least one result.
    // 2. SAFETY_CEILING (75/day) — a much higher, purely technical
    //    backend safeguard, invisible in normal use, counting EVERY
    //    attempt regardless of outcome. Exists only to prevent the
    //    endpoint being hit indefinitely for free by only ever sending
    //    queries designed to return nothing — without this, a
    //    "results-only" limit would have no ceiling at all.
    //
    // "today" is computed in the USER'S OWN local timezone (passed from
    // the frontend as `tz`), not the server's UTC clock — see the
    // earlier, separate fix for the full rationale on why this matters.
    const SEARCH_FREE_LIMIT = 20;
    const SAFETY_CEILING = 75;
    let isPaid = false;
    let searchCount = 0;
    let today = null;
    try {
      const userR = await db.query('SELECT tier FROM users WHERE email=$1', [req.userEmail]);
      const tier = (userR.rows[0] || {}).tier || 'starter';
      const PAID_TIERS = ['creator', 'professional', 'team', 'pro', 'diary-pro', 'forge'];
      isPaid = PAID_TIERS.some(t => tier.includes(t));
      if (!isPaid) {
        try {
          today = new Date().toLocaleDateString('en-CA', { timeZone: tz || 'UTC' });
        } catch(_tzErr) {
          today = new Date().toISOString().slice(0, 10); // invalid tz string, fall back safely
        }
        const countR = await db.query(
          `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE found_results) AS successful
           FROM diary_search_log WHERE user_email=$1 AND search_date=$2`,
          [req.userEmail, today]
        );
        const row = countR.rows[0] || {};
        const allAttemptsToday = parseInt(row.total || 0);
        searchCount = parseInt(row.successful || 0);
        if (searchCount >= SEARCH_FREE_LIMIT) {
          return res.status(402).json({
            success: false,
            error: 'search_limit_reached',
            searches_today: searchCount,
            searches_limit: SEARCH_FREE_LIMIT,
            message: `You've used all ${SEARCH_FREE_LIMIT} free searches today. Upgrade to Pro for unlimited searches.`
          });
        }
        if (allAttemptsToday >= SAFETY_CEILING) {
          // Deliberately generic — this should never be visible in
          // normal use, so it doesn't need the same detailed messaging
          // as the real, user-facing limit above.
          return res.status(429).json({ success: false, error: 'rate_limited', message: 'Too many search attempts. Please try again later.' });
        }
      }
    } catch(limitErr) {
      console.warn('[Diary] Search limit check failed:', limitErr.message);
    }

    if (!terms.length) return res.json({ success: true, entries: [], searches_today: searchCount, searches_limit: isPaid ? null : SEARCH_FREE_LIMIT });

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

    const foundResults = r.rows.length > 0;
    if (!isPaid && today) {
      // Log this attempt AFTER knowing the real outcome, so found_results
      // accurately reflects whether it actually found anything — this is
      // what both the safety ceiling (counts every row) and the real,
      // user-facing limit (counts only found_results=true rows) read
      // from on the next request.
      await db.query(
        `INSERT INTO diary_search_log (user_email, search_date, query, found_results) VALUES ($1, $2, $3, $4)`,
        [req.userEmail, today, q.slice(0, 200), foundResults]
      ).catch(() => {}); // non-blocking
      if (foundResults) searchCount += 1; // reflect this search immediately in the response below
    }

    res.json({ success: true, entries: r.rows, searches_today: searchCount, searches_limit: isPaid ? null : SEARCH_FREE_LIMIT });
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

    // ── Saves are unconditionally unlimited ─────────────────────────────────
    // Confirmed as an explicit product decision: monetization happens via
    // search limits and synthesis credits, not by restricting saves. The
    // previous check here used an artificial FREE_LIMIT = 9999 threshold
    // as a stand-in for "unlimited" (with stale "10 saves" wording left
    // over from an earlier, genuinely-limited version) — removed entirely
    // so the code says what it means, rather than "unlimited via a very
    // large number that could theoretically still be hit."

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

// ── GET /api/diary/by-url — find entry by conversation URL ──────────────────
router.get('/by-url', requireAuth, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.json({ success: true, entry: null });
    const r = await db.query(
      `SELECT id, prompt, content, metadata FROM diary_entries
       WHERE user_email=$1 AND (metadata::jsonb)->>'url' = $2 LIMIT 1`,
      [req.userEmail, url]
    );
    res.json({ success: true, entry: r.rows[0] || null });
  } catch(e) {
    console.error('[Diary] by-url error:', e.message);
    res.json({ success: true, entry: null });
  }
});

// ── PATCH /api/diary/:id — update content of existing entry ──────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { content, metadata } = req.body;
    const id = parseInt(req.params.id);
    if (!content || !id) return res.status(400).json({ success: false });
    
    // Merge metadata
    const existing = await db.query('SELECT metadata FROM diary_entries WHERE id=$1 AND user_email=$2', [id, req.userEmail]);
    if (!existing.rows.length) return res.status(404).json({ success: false });
    
    const existingMeta = existing.rows[0].metadata || {};
    const newMeta = Object.assign({}, existingMeta, metadata || {});
    
    const prompt = req.body.prompt;
    if (prompt) {
      await db.query(
        `UPDATE diary_entries SET content=$1, metadata=$2, search_text=$3, prompt=$4, updated_at=NOW() WHERE id=$5 AND user_email=$6`,
        [content, JSON.stringify(newMeta), content.slice(0, 500).toLowerCase(), prompt, id, req.userEmail]
      );
    } else {
      await db.query(
        `UPDATE diary_entries SET content=$1, metadata=$2, search_text=$3, updated_at=NOW() WHERE id=$4 AND user_email=$5`,
        [content, JSON.stringify(newMeta), content.slice(0, 500).toLowerCase(), id, req.userEmail]
      );
    }
    res.json({ success: true });
  } catch(e) {
    console.error('[Diary] PATCH error:', e.message);
    res.status(500).json({ success: false, error: e.message });
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


// ── POST /api/diary/upload-image — upload image to R2 ────────────────────────
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

router.post('/upload-image', requireAuth, async (req, res) => {
  try {
    const { data: base64Data, contentType = 'image/jpeg' } = req.body;
    if (!base64Data) return res.status(400).json({ success: false, error: 'No image data' });
    
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Image too large' });
    
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg';
    const key = `diary/${req.userEmail.replace(/[^a-z0-9]/gi, '_')}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    res.json({ success: true, url });
  } catch(e) {
    console.error('[Diary] R2 upload error:', e.message);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

module.exports = router;
