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

// ── Semantic search: Voyage AI embeddings ───────────────────────────────────
// NOTE: Anthropic does not offer its own embedding model at all (confirmed
// directly from Anthropic's own documentation) — Voyage AI is Anthropic's
// own explicitly recommended partner for exactly this situation, and the
// natural fit given this whole product is built around the Claude
// ecosystem. Endpoint, request/response shape, and the input_type
// parameter (meaningfully affects retrieval quality, not cosmetic —
// Voyage's own docs explicitly warn not to omit it) all confirmed
// directly against Anthropic's own documentation before writing this.
// Uses the default 1024-dimension output — a reasonable, balanced choice
// for a personal-scale archive that doesn't need the largest available
// dimension for adequate accuracy. Gracefully degrades (returns null,
// never throws) if VOYAGE_API_KEY isn't set, times out, or the API call
// otherwise fails — semantic search is an enhancement on top of the
// existing, fully-functional keyword search, never a hard dependency
// that could break saving or searching if Voyage is unavailable.
async function voyageEmbed(texts, inputType) {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;
  const inputs = Array.isArray(texts) ? texts : [texts];
  if (!inputs.length || inputs.every(t => !t || !t.trim())) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        input: inputs.map(t => (t || '').slice(0, 8000)), // Voyage has its own input length limits; keep well under
        model: 'voyage-4',
        input_type: inputType // 'document' at save time, 'query' at search time
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      console.warn('[Diary] Voyage embedding request failed:', resp.status);
      return null;
    }
    const json = await resp.json();
    const embeddings = (json.data || []).sort((a, b) => a.index - b.index).map(d => d.embedding);
    return Array.isArray(texts) ? embeddings : (embeddings[0] || null);
  } catch(e) {
    console.warn('[Diary] Voyage embedding error:', e.message);
    return null;
  }
}

// Formats a JS number array as a pgvector literal string, e.g. '[0.1,0.2,...]'
function toVectorLiteral(embedding) {
  if (!Array.isArray(embedding)) return null;
  return '[' + embedding.join(',') + ']';
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

  // NOTE: pgvector setup kept in its OWN, separate try/catch — deliberately
  // isolated from the migration above, since CREATE EXTENSION is a
  // genuinely riskier operation than the existing table/column statements
  // (it can fail due to permissions on some managed PostgreSQL hosts). A
  // failure here should degrade to keyword-only search, never break the
  // rest of the app's startup migration, which is critical unlike this
  // optional enhancement. 1024 dimensions matches voyage-4's default
  // output size (confirmed against Voyage's own documentation).
  try {
    await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.query(`ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS embedding vector(1024)`);
    console.log('[Diary] pgvector ready');
  } catch(e) { console.warn('[Diary] pgvector setup failed — semantic search will be unavailable, keyword search unaffected:', e.message); }
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
    const { category, source, date_from, date_to, tz, favorite, limit = 25, offset = 0 } = req.query;
    const pageLimit = Math.min(parseInt(limit) || 25, 100);
    const pageOffset = Math.max(parseInt(offset) || 0, 0);

    // NOTE: same validated-timezone pattern as the search endpoint —
    // see the matching comment there for the full rationale (a genuine,
    // confirmed-live bug where a date filter compared against raw UTC
    // timestamps could silently include/exclude entries saved just
    // after the user's own local midnight).
    let safeTz = 'UTC';
    try { new Date().toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }); safeTz = tz || 'UTC'; } catch(_e) {}

    let whereSql = ` WHERE user_email = $1`;
    const params = [req.userEmail];
    if (category && category !== 'all') { params.push(category); whereSql += ` AND category = $${params.length}`; }
    if (source && source !== 'all')     { params.push(source);   whereSql += ` AND source = $${params.length}`; }
    if (favorite === 'true') { whereSql += ` AND is_favorite = true`; }
    // NOTE: date range added — the plain browse endpoint (this one, used
    // by loadDiary()) previously had no date filtering at all, even
    // though the search endpoint does — meaning the date-range sidebar
    // filter would have silently done nothing outside of an active text
    // search. Same inclusive end-date pattern as the search endpoint
    // (created_at < date_to + 1 day, so the end date's own entries are
    // correctly included, not excluded at midnight) — now also
    // timezone-aware, using the function form timezone(tz, created_at)
    // rather than the AT TIME ZONE operator directly against a
    // parameter placeholder, since the latter has documented syntax
    // issues in some parameterized-query drivers.
    if (date_from) { params.push(safeTz, date_from); whereSql += ` AND timezone($${params.length - 1}, created_at) >= $${params.length}::date`; }
    if (date_to)   { params.push(safeTz, date_to);   whereSql += ` AND timezone($${params.length - 1}, created_at) < ($${params.length}::date + INTERVAL '1 day')`; }

    // Total count for pagination controls
    const countR = await db.query(`SELECT COUNT(*) AS total FROM diary_entries${whereSql}`, params);
    const total = parseInt(countR.rows[0]?.total || 0);

    const dataParams = [...params, pageLimit, pageOffset];
    // NOTE: sort changed from created_at DESC to COALESCE(updated_at,
    // created_at) DESC — a real, requested feature: when an existing
    // entry is updated (e.g. re-saving an ongoing conversation with new
    // messages), created_at deliberately stays untouched, since
    // manipulating the original save date isn't wanted. But that also
    // meant a just-updated conversation could stay buried under its own
    // old creation date, with search as the only way to find it again.
    // COALESCE falls back to created_at for any entry that's never been
    // updated (where updated_at is still NULL), so this doesn't change
    // sort order at all for the vast majority of entries — only
    // recently-updated ones now correctly float to the top, without
    // touching the displayed original date anywhere.
    const sql = `SELECT id, source, title, prompt, content, document_text,
                        conversation, decision_note, category, tags, metadata, rating, is_favorite, conversation_count, created_at, updated_at
                 FROM diary_entries${whereSql}
                 ORDER BY COALESCE(updated_at, created_at) DESC
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
    const { q, tz, source, category, date_from, date_to } = req.query;
    // NOTE: no longer requires q to be non-empty — filters (source,
    // category, date range) can now be used alone as a genuine "browse by
    // filter" query, matching how Google/LinkedIn-style search lets a
    // person filter without necessarily typing a text query at all.
    if (!q && !source && !category && !date_from && !date_to) return res.json({ success: true, entries: [] });

    // NOTE: validated once, shared by both the daily search-limit reset
    // below AND the date-range filter — confirmed live as a genuine,
    // separate timezone bug from the one already fixed for the daily
    // reset: a date-range filter set to "Aug 15" was silently including
    // entries actually saved just after midnight in the user's own local
    // time (Europe/Oslo, UTC+2), since 23:21 UTC on Aug 15 is already
    // Aug 16 locally — confirmed directly via test before writing this
    // fix. Falls back safely to UTC if tz is missing or not a real IANA
    // timezone name (toLocaleDateString throws on invalid input).
    let safeTz = 'UTC';
    try { new Date().toLocaleDateString('en-CA', { timeZone: tz || 'UTC' }); safeTz = tz || 'UTC'; } catch(_e) {}

    // ── Parse the query: exact phrases (quoted) + individual words ─────────
    // NOTE: phrase search added — a query like `"fractured knee"` is now
    // treated as one exact phrase, not just "fractured" and "knee"
    // matching anywhere independently. Verified via direct test across
    // several cases (a phrase plus an extra word, phrase-only queries, no
    // quotes at all — unaffected, multiple phrases, and malformed/empty
    // quotes) before implementing here.
    //
    // NOTE: stop words + punctuation stripping + deduplication added —
    // confirmed live as a real, concrete cause of diluted, irrelevant
    // results: a genuinely-typed query like "what is investment banking?"
    // was previously producing individual search terms for "what" and
    // "is" (both filtered here, since neither carries real search
    // intent on its own — "is" in particular is common enough to match
    // nearly any entry regardless of topic), and "banking?" — with the
    // question mark still literally attached — as an entirely separate,
    // near-useless term from "banking" (fixed by stripping leading and
    // trailing punctuation from each word — not punctuation anywhere
    // within a word, which stays intact, since it can be genuinely
    // meaningful, e.g. the hyphen in "SK-Hynix" or the apostrophe in
    // "company's" — confirmed via direct test before implementing). Deliberately only
    // applied to BARE, un-phrased words — a stop word appearing INSIDE a
    // quoted phrase (e.g. "investment in banking") correctly survives,
    // since a phrase's exact wording is meant to matter, confirmed via
    // direct test before implementing here. Deduplication (Set) avoids
    // redundant, identical SQL conditions when the same word appears
    // more than once in one query, as it did here ("banking" 3 times).
    const STOP_WORDS = new Set(['a','an','the','is','are','was','were','what','who','when','where','why','how','of','in','on','at','to','for','and','or','but','with','do','does','did']);
    const phrases = [];
    const withoutPhrases = (q || '').replace(/"([^"]+)"/g, (full, phrase) => {
      const trimmed = phrase.trim();
      if (trimmed.length > 1) phrases.push(trimmed.toLowerCase());
      return ' ';
    });
    const words = [...new Set(
      withoutPhrases.replace(/"/g, ' ')
        .split(/[,;\s]+/)
        .map(t => t.trim().toLowerCase().replace(/^[^\w]+|[^\w]+$/g, '')) // leading/trailing punctuation only — mid-word punctuation (hyphens, apostrophes) is meaningful and must survive, e.g. "SK-Hynix"
        .filter(t => t.length > 1 && !STOP_WORDS.has(t))
    )];

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
        // NOTE: now reuses the shared, already-validated safeTz computed
        // above, rather than re-validating separately here.
        today = new Date().toLocaleDateString('en-CA', { timeZone: safeTz });
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

    // ── Build the combined query: scored text match (OR) + hard filters (AND) ──
    // NOTE: field-weighted relevance added — a match in the title now
    // scores meaningfully higher than the same match buried in body
    // content, and a phrase match scores higher than an individual word
    // match at every field level. Filters (source, category, date range)
    // are hard AND constraints, entirely separate from the scored OR-based
    // text matching — narrowing the result set rather than affecting rank.
    // Verified via direct test of the full combined SQL construction
    // (parameter indexing across variable phrase/word/filter counts is the
    // most error-prone part of this) across three cases — text query with
    // a phrase and no filters, filters alone with no text query at all,
    // and text plus every filter combined — before implementing here.
    const params = [req.userEmail];
    let idx = 2;
    const scoreTerms = [];
    const textWhereTerms = [];
    function addTextTerm(term, weight) {
      const p = `$${idx}`;
      params.push(`%${term}%`);
      scoreTerms.push(`(CASE WHEN title ILIKE ${p} THEN ${weight*3} WHEN prompt ILIKE ${p} THEN ${weight*2} WHEN content ILIKE ${p} OR search_text ILIKE ${p} OR category ILIKE ${p} THEN ${weight} ELSE 0 END)`);
      textWhereTerms.push(`(title ILIKE ${p} OR prompt ILIKE ${p} OR content ILIKE ${p} OR search_text ILIKE ${p} OR category ILIKE ${p})`);
      idx++;
    }
    phrases.forEach(p => addTextTerm(p, 3));
    words.forEach(w => addTextTerm(w, 1));
    const hasTextQuery = textWhereTerms.length > 0;

    // ── Semantic search: hybrid with the existing keyword scoring ──────────
    // NOTE: a query embedding is generated ONLY when there's real query
    // text (semantic similarity to an empty/filter-only query is
    // meaningless). Genuinely optional and additive — if Voyage is
    // unavailable, unconfigured, or times out, voyageEmbed() returns
    // null and the query below degrades to EXACTLY the original,
    // pre-semantic-search keyword-only behavior (confirmed via direct
    // test: with no embedding, param count and structure are identical
    // to before this feature existed). GREATEST(0, ...) floors the score
    // contribution at zero rather than letting a dissimilar match
    // subtract from an entry's overall score.
    //
    // NOTE: threshold raised 0.5 -> 0.68 — confirmed live and worth
    // documenting why: a narrow, specific single-word search ("nile")
    // was pulling in entries about OTHER rivers — genuinely
    // topically-related in a loose, categorical sense, but not what
    // someone searching that specific word actually wants. 0.5 was an
    // explicit, untested starting guess from when this was first built.
    // Cross-referenced against published guidance rather than picking a
    // new number blindly: multiple independent sources converge on
    // 0.60-0.80 cosine similarity as the range for "genuinely the same
    // topic" — 0.5 sat below even the lower bound of that range, which
    // directly explains the over-inclusion observed. Higher thresholds
    // seen in some sources (0.78-0.85) are from semantic caching and
    // near-duplicate detection specifically, which demand much stricter
    // precision than search relevance does — not the right comparison
    // here. Landed on 0.68, solidly within the "same topic" range and
    // deliberately toward the stricter end, since semantic search's job
    // here is catching genuinely related but differently-worded content,
    // not casting a wide net across loosely-related topics — keyword
    // matching already covers direct hits well on its own.
    const SEMANTIC_WEIGHT = 5;
    const SIMILARITY_THRESHOLD = 0.68;
    let semanticScoreExpr = null;
    let semanticWhereExpr = null;
    if (hasTextQuery) {
      const queryEmbedding = await voyageEmbed(q, 'query');
      if (queryEmbedding) {
        const p = `$${idx}`;
        params.push(toVectorLiteral(queryEmbedding));
        idx++;
        semanticScoreExpr = `(CASE WHEN embedding IS NOT NULL THEN GREATEST(0, 1 - (embedding <=> ${p}::vector)) * ${SEMANTIC_WEIGHT} ELSE 0 END)`;
        semanticWhereExpr = `(embedding IS NOT NULL AND (1 - (embedding <=> ${p}::vector)) > ${SIMILARITY_THRESHOLD})`;
      }
    }

    const filterWhereTerms = [];
    if (source) { filterWhereTerms.push(`source = $${idx}`); params.push(source); idx++; }
    if (category) { filterWhereTerms.push(`category ILIKE $${idx}`); params.push(category); idx++; }
    if (date_from) { filterWhereTerms.push(`timezone($${idx}, created_at) >= $${idx+1}::date`); params.push(safeTz, date_from); idx += 2; }
    if (date_to) { filterWhereTerms.push(`timezone($${idx}, created_at) < ($${idx+1}::date + INTERVAL '1 day')`); params.push(safeTz, date_to); idx += 2; }

    const whereClauses = ['user_email = $1'];
    if (filterWhereTerms.length) whereClauses.push(filterWhereTerms.join(' AND '));
    const matchConditions = [];
    if (hasTextQuery) matchConditions.push(`(${textWhereTerms.join(' OR ')})`);
    if (semanticWhereExpr) matchConditions.push(semanticWhereExpr);
    if (matchConditions.length) whereClauses.push(`(${matchConditions.join(' OR ')})`);

    let scoreExpr = hasTextQuery ? scoreTerms.join(' + ') : '0';
    if (semanticScoreExpr) scoreExpr = scoreExpr === '0' ? semanticScoreExpr : `${scoreExpr} + ${semanticScoreExpr}`;
    // NOTE: filter-only branch (no text query) also switched to
    // COALESCE(updated_at, created_at) — same reasoning as the main
    // browse endpoint, so filtering by source/category shows recently-
    // updated conversations at the top there too, not just on the
    // unfiltered view. The active-search branch keeps created_at as
    // its tiebreaker after match_score, since relevance is the primary
    // sort key once someone's actually searching.
    const orderBy = (hasTextQuery || semanticScoreExpr) ? 'match_score DESC, created_at DESC' : 'COALESCE(updated_at, created_at) DESC';

    // NOTE: confirmed live via a direct keyword_score/semantic_score
    // breakdown (removed after use) that cross-topic matches like an
    // Amazon River entry appearing in a "nile" search are genuine
    // keyword matches (every single result had keyword_score > 0, none
    // were pure-semantic) — almost certainly because that entry's own
    // content genuinely mentions the Nile, likely as a comparison point.
    // This is correct, expected keyword-search behavior, not a bug —
    // the 0.68 similarity threshold below was a reasonable, well-
    // grounded value to land on regardless, just not the actual fix for
    // this specific observation.
    // NOTE: metadata added — confirmed live and root-caused: this
    // endpoint's SELECT never included the metadata column at all,
    // meaning every search result's metadata.url was always undefined
    // on the frontend, regardless of whether the entry actually had a
    // real, valid original URL. This made every search result
    // incorrectly show "Continue on [Provider]" (the Quick-Answer-only
    // button) instead of "Open original" for genuine, extension-
    // captured entries — confirmed the plain browse endpoint already
    // correctly included metadata in its own SELECT, which is exactly
    // why this only showed up when using search specifically.
    const r = await db.query(
      `SELECT id, source, title, prompt, content, category, tags, metadata, conversation_count, created_at,
              (${scoreExpr}) AS match_score
       FROM diary_entries
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT 50`,
      params
    );

    const foundResults = r.rows.length > 0;
    if (!isPaid && today) {
      // NOTE: recentDuplicate check added — confirmed as a real, fair
      // refinement following the same principle as the results-only fix:
      // the exact same query repeated within a short window (accidental
      // double-submit, quickly re-checking the same results, a network
      // retry) isn't really a distinct, new search, and shouldn't cost
      // one. Normalized (trimmed, lowercased) so "Fractured Knee" and
      // "fractured knee " are correctly treated as identical. Also now
      // includes the active filters in the dedup key — searching the
      // same words but with a different filter applied (e.g. "Claude
      // only" vs. no filter) is a genuinely different, intentional
      // search, not a repeat, and must not be treated as a duplicate.
      // Verified via direct simulation: the same query 30 seconds apart
      // correctly doesn't count a second time; the same query 10 minutes
      // apart (outside the window) correctly does; two different queries
      // close together both correctly count.
      //
      // IMPORTANT: a row still gets inserted for every attempt, even a
      // duplicate — only whether it counts toward the user-facing limit
      // (found_results) is affected. This matters because the safety
      // ceiling above reads COUNT(*) of ALL rows for its own, separate
      // check — silently skipping the insert for duplicates would make
      // that ceiling undercount real attempts, quietly contradicting its
      // whole purpose (a repeated request still runs a real query and
      // consumes real server resources, regardless of whether it's
      // "fair" to charge the person for it).
      const normQuery = [q || '', source || '', category || '', date_from || '', date_to || ''].join('|').trim().toLowerCase().slice(0, 200);
      const dupR = await db.query(
        `SELECT 1 FROM diary_search_log
         WHERE user_email=$1 AND query=$2 AND created_at > NOW() - INTERVAL '5 minutes'
         LIMIT 1`,
        [req.userEmail, normQuery]
      ).catch(() => ({ rows: [] }));
      const isDuplicate = dupR.rows.length > 0;
      const countsTowardLimit = foundResults && !isDuplicate;

      await db.query(
        `INSERT INTO diary_search_log (user_email, search_date, query, found_results) VALUES ($1, $2, $3, $4)`,
        [req.userEmail, today, normQuery, countsTowardLimit]
      ).catch(() => {}); // non-blocking
      if (countsTowardLimit) searchCount += 1; // reflect this search immediately in the response below
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

// TEMPORARY DIAGNOSTIC — investigating near-duplicate "Nile River..."
// entries spotted during last night's semantic search work. Lists every
// entry whose title contains "nile", with source and creation time, so
// we can see the real shape of this (same provider repeated vs. spread
// across different providers) before deciding whether there's anything
// to actually clean up. To be removed once the investigation is done.
router.get('/diag-nile', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, source, title, created_at FROM diary_entries
       WHERE user_email = $1 AND title ILIKE '%nile%'
       ORDER BY created_at ASC`,
      [req.userEmail]
    );
    res.json({ success: true, count: r.rows.length, entries: r.rows });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/diary/backfill-embeddings — one-time semantic search setup ────
// NOTE: entries saved before semantic search existed have no embedding at
// all, and would otherwise only ever be found via keyword matching, never
// via semantic similarity — this brings them up to the same footing as
// new entries. Runs in the BACKGROUND, not awaited by the response,
// since a larger archive could take real time to process — the person
// shouldn't have to keep the request open and wait. Batches of 50
// (conservative, well under Voyage's own 1000-per-request limit) to
// keep individual request/response sizes reasonable and avoid timeout
// risk on any single batch. Safe to call repeatedly — only ever
// operates on rows that still have no embedding, so re-running after a
// partial failure or a fresh batch of saves just picks up where it left
// off, never re-processing or re-charging for entries already done.
router.post('/backfill-embeddings', requireAuth, async (req, res) => {
  try {
    const countR = await db.query(
      `SELECT COUNT(*) AS total FROM diary_entries WHERE user_email = $1 AND embedding IS NULL`,
      [req.userEmail]
    );
    const total = parseInt(countR.rows[0]?.total || 0);
    if (total === 0) {
      return res.json({ success: true, message: 'Nothing to backfill — every entry already has an embedding.', queued: 0 });
    }
    res.json({ success: true, message: `Backfill started for ${total} entries. This runs in the background.`, queued: total });

    (async () => {
      const BATCH_SIZE = 50;
      // Hard safety cap — prevents a true infinite loop if a specific
      // row's embedding generation consistently fails for some reason
      // (e.g. Voyage returning fewer results than requested for one
      // batch), which would otherwise leave that row permanently stuck
      // at embedding IS NULL and re-fetched on every iteration forever.
      // 400 iterations * 50/batch = up to 20,000 entries, comfortably
      // beyond any realistic personal archive size.
      const MAX_ITERATIONS = 400;
      let processed = 0;
      let iterations = 0;
      try {
        while (iterations < MAX_ITERATIONS) {
          iterations++;
          const batchR = await db.query(
            `SELECT id, search_text FROM diary_entries WHERE user_email = $1 AND embedding IS NULL ORDER BY id LIMIT $2`,
            [req.userEmail, BATCH_SIZE]
          );
          if (!batchR.rows.length) break;
          const texts = batchR.rows.map(r => r.search_text || '');
          const embeddings = await voyageEmbed(texts, 'document');
          if (!embeddings) {
            console.warn('[Diary] Backfill: Voyage unavailable, stopping. Processed so far:', processed);
            break;
          }
          for (let i = 0; i < batchR.rows.length; i++) {
            if (embeddings[i]) {
              await db.query(
                `UPDATE diary_entries SET embedding = $1::vector WHERE id = $2`,
                [toVectorLiteral(embeddings[i]), batchR.rows[i].id]
              ).catch(() => {});
            }
          }
          processed += batchR.rows.length;
        }
        if (iterations >= MAX_ITERATIONS) {
          console.warn('[Diary] Backfill hit the safety iteration cap — some entries may remain unembedded. Re-run to continue.');
        }
        console.log(`[Diary] Backfill complete for ${req.userEmail}: ${processed} entries embedded`);
      } catch(e) {
        console.warn('[Diary] Backfill error:', e.message, '| processed before failure:', processed);
      }
    })();
  } catch(e) {
    console.error('[Diary] Backfill trigger error:', e.message);
    res.status(500).json({ success: false, error: 'Could not start backfill' });
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

    // NOTE: embedding generation happens AFTER responding, deliberately
    // not awaited — semantic search is an enhancement for FUTURE
    // searches, not something this save operation itself needs to wait
    // on, and saving should stay fast (matching the core "one click
    // saves" value prop) regardless of whether Voyage is slow, rate-
    // limited, or unavailable. Uses input_type: "document", per Voyage's
    // own guidance for content being indexed (as opposed to "query" for
    // search-time embeddings). Failure here is silently logged only —
    // never surfaced to the user, since the save itself already
    // succeeded and semantic search gracefully falls back to keyword-
    // only for any entry that ends up without an embedding.
    (async () => {
      try {
        const embedding = await voyageEmbed(searchText, 'document');
        if (embedding) {
          await db.query(
            `UPDATE diary_entries SET embedding = $1::vector WHERE id = $2`,
            [toVectorLiteral(embedding), r.rows[0].id]
          );
        }
      } catch(e) {
        console.warn('[Diary] Background embedding generation failed:', e.message);
      }
    })();
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
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ success: false });

    // NOTE: rebuilt to support PARTIAL updates — confirmed live as a
    // real, pre-existing bug (not a regression from recent CSS work):
    // this endpoint unconditionally required `content` to be present,
    // returning 400 otherwise. But it's shared by multiple different
    // features that only ever send ONE small field each — moveEntry()
    // sends only { category }, saveNote() sends only { decision_note } —
    // neither ever includes content at all, so both were silently
    // broken by that requirement. A dangling comment left in this file
    // ("update decision note, category, rating, or append conversation")
    // suggests a dedicated, lightweight endpoint for exactly this used
    // to exist separately before being consolidated here. Now builds the
    // SET clause dynamically from whichever fields were actually
    // provided, so a category-only or decision_note-only request updates
    // just that column — confirmed via direct simulation of all four
    // real scenarios (category-only, decision_note-only, a full content
    // re-save, and an empty body correctly signaling 400) before
    // implementing here.
    const { content, metadata, prompt, category, decision_note, rating, is_favorite } = req.body;

    const sets = [];
    const params = [];
    let i = 1;

    if (content !== undefined) {
      sets.push(`content=$${i++}`); params.push(content);
      sets.push(`search_text=$${i++}`); params.push(content.slice(0, 500).toLowerCase());
    }

    if (metadata !== undefined) {
      // Merge metadata (attachments accumulate specially — see below)
      const existing = await db.query('SELECT metadata FROM diary_entries WHERE id=$1 AND user_email=$2', [id, req.userEmail]);
      if (!existing.rows.length) return res.status(404).json({ success: false });

      const existingMeta = existing.rows[0].metadata || {};
      const newMetaRaw = metadata || {};
      // NOTE: attachments merged specially, not just shallow-assigned like
      // the rest of metadata — confirmed live as a real, meaningful gap: a
      // file attachment only detectable while its card is still visible in
      // the DOM (per the "lightweight index" design) was getting silently
      // wiped out the next time the conversation was re-saved after
      // scrolling past it, since Object.assign() treats the whole
      // attachments array as just another key to overwrite wholesale, not
      // something to combine element by element. Now an attachment only
      // ever needs to be visible ONCE, at any point across however many
      // times a conversation gets saved — not on every single save going
      // forward.
      //
      // Dedup key is filename+type together, NOT filename alone — fixed
      // after confirming live that filename-only dedup silently dropped
      // two of three real, distinct attachments in the same conversation,
      // since Claude commonly offers the same artifact for download in
      // multiple formats sharing one title (e.g. "Diary launch brief" as
      // MD, PDF, and DOCX all at once) — filename alone isn't a unique
      // identifier for an attachment at all in that case, even though it
      // usually is when only one format exists.
      const existingAttachments = existingMeta.attachments || [];
      const newAttachments = newMetaRaw.attachments || [];
      const mergedAttachments = existingAttachments.slice();
      newAttachments.forEach(att => {
        const alreadyHave = mergedAttachments.some(e => e.filename === att.filename && e.type === att.type);
        if (!alreadyHave) mergedAttachments.push(att);
      });
      const newMeta = Object.assign({}, existingMeta, newMetaRaw, { attachments: mergedAttachments });
      sets.push(`metadata=$${i++}`); params.push(JSON.stringify(newMeta));
    }

    if (prompt !== undefined) { sets.push(`prompt=$${i++}`); params.push(prompt); }
    if (category !== undefined) { sets.push(`category=$${i++}`); params.push(category); }
    if (decision_note !== undefined) { sets.push(`decision_note=$${i++}`); params.push(decision_note); }
    if (rating !== undefined) { sets.push(`rating=$${i++}`); params.push(rating); }
    if (is_favorite !== undefined) { sets.push(`is_favorite=$${i++}`); params.push(is_favorite); }

    if (!sets.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    sets.push('updated_at=NOW()');

    const idParam = i++;
    const emailParam = i++;
    params.push(id, req.userEmail);

    await db.query(
      `UPDATE diary_entries SET ${sets.join(', ')} WHERE id=$${idParam} AND user_email=$${emailParam}`,
      params
    );

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


// ── POST /api/diary/upload-attachment — store an attachment via the ────────
// shared storage interface (backend/lib/attachmentStorage.js, R2 for v1)
//
// NOTE: replaces the old, image-only /upload-image route — nothing
// calls that route yet (confirmed: the extension has never actually
// wired it up), so there's no backward-compatibility concern in
// replacing it outright with a single, generic endpoint that covers
// every attachment type Priority 4 actually needs to host (images,
// PDFs, plain text/code), rather than a separate, near-duplicate route
// per type. DOCX/XLSX are deliberately NOT in this whitelist yet —
// v1.1, per the corrected brief, converts them to PDF/HTML at capture
// time rather than hosting the original format directly, so they'll
// flow through this same endpoint as a PDF/HTML contentType once that
// conversion step exists, not as their own, separate case here.
const attachmentStorage = require('../lib/attachmentStorage');

const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'text/plain', 'text/markdown', 'text/csv', 'application/json',
]);
// A generous set of extensions treated as "plain text/code" for the
// purpose of this whitelist even when the browser/extension reports a
// generic or missing contentType for them (common for code files).
const TEXT_LIKE_EXTENSIONS = /\.(txt|md|csv|json|js|jsx|ts|tsx|py|rb|go|java|c|cpp|h|hpp|cs|php|sh|yml|yaml|xml|html|css|sql)$/i;

router.post('/upload-attachment', requireAuth, async (req, res) => {
  try {
    const { data: base64Data, contentType, filename } = req.body;
    if (!base64Data) return res.status(400).json({ success: false, error: 'No file data provided' });

    const normalizedType = (contentType || '').split(';')[0].trim().toLowerCase();
    const looksTextLike = TEXT_LIKE_EXTENSIONS.test(filename || '');
    if (!ALLOWED_ATTACHMENT_TYPES.has(normalizedType) && !(looksTextLike && (normalizedType === '' || normalizedType === 'application/octet-stream'))) {
      return res.status(400).json({ success: false, error: 'Unsupported attachment type for v1: ' + (contentType || 'unknown') });
    }
    // Text-like files with an ambiguous/missing contentType are stored
    // as text/plain — good enough for v1's "render inline as text"
    // requirement, which doesn't need language-specific MIME accuracy.
    const effectiveType = ALLOWED_ATTACHMENT_TYPES.has(normalizedType) ? normalizedType : 'text/plain';

    const buffer = Buffer.from(base64Data, 'base64');
    const result = await attachmentStorage.store({
      buffer,
      contentType: effectiveType,
      userEmail: req.userEmail,
      filenameHint: filename,
    });

    res.json({ success: true, id: result.id, url: result.url, contentType: result.contentType, size: result.size });
  } catch (e) {
    console.error('[Diary] Attachment upload error:', e.message);
    const status = /exceeds maximum size/.test(e.message) ? 400 : 500;
    res.status(status).json({ success: false, error: e.message || 'Upload failed' });
  }
});

module.exports = router;
