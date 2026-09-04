'use strict';
/**
 * lib/db.js — PostgreSQL connection and schema for Forge
 * Replaces users.json entirely. Uses the pg package.
 * DATABASE_URL is set automatically by Railway when Postgres is linked.
 */
const { Pool } = require('pg');

const pool = new Pool({ max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && (process.env.DATABASE_URL.includes('railway') || process.env.NODE_ENV === 'production')
    ? { rejectUnauthorized: false }
    : false,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  email              TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  name               TEXT,
  password_hash      TEXT,
  role               TEXT DEFAULT 'user',
  is_admin           BOOLEAN DEFAULT FALSE,
  tier               TEXT DEFAULT 'starter',
  stripe_customer_id TEXT,
  two_factor         JSONB DEFAULT '{"enabled":false}',
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  last_login         TIMESTAMPTZ,
  last_active_date   DATE,
  streak_count       INTEGER DEFAULT 0,
  avatar             TEXT,
  email_verified     BOOLEAN DEFAULT FALSE,
  verify_token       TEXT,
  verify_token_exp   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_email  TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(user_email);

CREATE TABLE IF NOT EXISTS provider_keys (
  user_email    TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  connected_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_email, provider)
);

CREATE TABLE IF NOT EXISTS prompts (
  id           TEXT PRIMARY KEY,
  user_email   TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  text         TEXT NOT NULL,
  favorite     BOOLEAN DEFAULT FALSE,
  category     TEXT DEFAULT 'Other',
  tags         JSONB DEFAULT '[]',
  used_count   INTEGER DEFAULT 0,
  used_with    JSONB DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prompts_email ON prompts(user_email);

CREATE TABLE IF NOT EXISTS synthesis_usage (
  user_email  TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  year_month  TEXT NOT NULL,
  used        INTEGER DEFAULT 0,
  entries     JSONB DEFAULT '[]',
  PRIMARY KEY (user_email, year_month)
);

-- Continue-in-Forge usage (Diary Priority 9) — see
-- checkAndIncrementChatContinueUsage's own comment for the full,
-- two-axis design (entries/month, generous and user-facing; messages/
-- entry, a guardrail against a single conversation's cost growth,
-- enforced directly against chat_sessions.messages, needing no table
-- of its own). One row per distinct Diary entry a user has forked in a
-- given month — a later continuation of the same entry never inserts
-- again (ON CONFLICT DO NOTHING), which is exactly what makes counting
-- rows equivalent to counting distinct entries forked.
CREATE TABLE IF NOT EXISTS chat_continue_entries_usage (
  user_email       TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  year_month       TEXT NOT NULL,
  diary_entry_id   INTEGER NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_email, year_month, diary_entry_id)
);

CREATE TABLE IF NOT EXISTS invites (
  code          TEXT PRIMARY KEY,
  inviter_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  inviter_name  TEXT NOT NULL DEFAULT '',
  used_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS synthesis_logs (
  id                SERIAL PRIMARY KEY,
  user_email        VARCHAR(200),
  question_length   INTEGER,
  response_tokens   INTEGER,
  primary_provider  VARCHAR(20) DEFAULT 'claude',
  fallback_used     BOOLEAN DEFAULT false,
  fallback_provider VARCHAR(20),
  estimated_cost_usd DECIMAL(10,6),
  mode              VARCHAR(50),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_synth_logs_user ON synthesis_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_synth_logs_date ON synthesis_logs(created_at);

CREATE TABLE IF NOT EXISTS student_verifications (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(200) NOT NULL,
  institution   VARCHAR(200) NOT NULL,
  country       VARCHAR(100),
  status        VARCHAR(20) DEFAULT 'pending',
  reviewed_by   VARCHAR(100),
  reviewed_at   TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forge_recordings (
  id            SERIAL PRIMARY KEY,
  user_email    VARCHAR(200) NOT NULL,
  title         VARCHAR(200),
  events_json   TEXT NOT NULL,
  is_public     BOOLEAN DEFAULT FALSE,
  share_token   VARCHAR(50) UNIQUE,
  duration_ms   INTEGER,
  event_count   INTEGER,
  feature       VARCHAR(50),
  size_mb       NUMERIC(6,2),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recordings_token ON forge_recordings(share_token);
CREATE INDEX IF NOT EXISTS idx_recordings_user ON forge_recordings(user_email);

CREATE TABLE IF NOT EXISTS knowledge_modules (
  id                    SERIAL PRIMARY KEY,
  module_id             VARCHAR(20) NOT NULL UNIQUE,
  name                  VARCHAR(200) NOT NULL,
  version               VARCHAR(10) NOT NULL DEFAULT '1.0',
  source                VARCHAR(20) NOT NULL DEFAULT 'manual',
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  confidence            VARCHAR(10) NOT NULL DEFAULT 'medium',
  summary               TEXT NOT NULL DEFAULT '',
  content_markdown      TEXT NOT NULL DEFAULT '',
  system_prompt_snippet TEXT NOT NULL DEFAULT '',
  forge_consensus       INTEGER,
  approved_by           VARCHAR(100),
  review_due_at         TIMESTAMP,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_keywords (
  id          SERIAL PRIMARY KEY,
  module_id   INTEGER NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  keyword     VARCHAR(100) NOT NULL,
  weight      FLOAT NOT NULL DEFAULT 1.0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_injections (
  id            SERIAL PRIMARY KEY,
  synthesis_id  VARCHAR(100),
  user_email    VARCHAR(200),
  module_ids    INTEGER[],
  query_snippet TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_candidates (
  id               SERIAL PRIMARY KEY,
  synthesis_id     VARCHAR(100),
  user_email       VARCHAR(200),
  proposed_title   VARCHAR(200),
  proposed_content TEXT,
  proposed_keywords TEXT[],
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by      VARCHAR(100),
  reviewed_at      TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  email TEXT,
  type TEXT,
  comment TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS synthesis_logs (
  id                SERIAL PRIMARY KEY,
  user_email        VARCHAR(200),
  question_length   INTEGER,
  response_tokens   INTEGER,
  primary_provider  VARCHAR(20) DEFAULT 'claude',
  fallback_used     BOOLEAN DEFAULT false,
  fallback_provider VARCHAR(20),
  estimated_cost_usd DECIMAL(10,6),
  mode              VARCHAR(50),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_synth_logs_user ON synthesis_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_synth_logs_date ON synthesis_logs(created_at);

CREATE TABLE IF NOT EXISTS student_verifications (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(200) NOT NULL,
  institution   VARCHAR(200) NOT NULL,
  country       VARCHAR(100),
  status        VARCHAR(20) DEFAULT 'pending',
  reviewed_by   VARCHAR(100),
  reviewed_at   TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forge_recordings (
  id            SERIAL PRIMARY KEY,
  user_email    VARCHAR(200) NOT NULL,
  title         VARCHAR(200),
  events_json   TEXT NOT NULL,
  is_public     BOOLEAN DEFAULT FALSE,
  share_token   VARCHAR(50) UNIQUE,
  duration_ms   INTEGER,
  event_count   INTEGER,
  feature       VARCHAR(50),
  size_mb       NUMERIC(6,2),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recordings_token ON forge_recordings(share_token);
CREATE INDEX IF NOT EXISTS idx_recordings_user ON forge_recordings(user_email);

CREATE TABLE IF NOT EXISTS knowledge_modules (
  id                    SERIAL PRIMARY KEY,
  module_id             VARCHAR(20) NOT NULL UNIQUE,
  name                  VARCHAR(200) NOT NULL,
  version               VARCHAR(10) NOT NULL DEFAULT '1.0',
  source                VARCHAR(20) NOT NULL DEFAULT 'manual',
  status                VARCHAR(20) NOT NULL DEFAULT 'draft',
  confidence            VARCHAR(10) NOT NULL DEFAULT 'medium',
  summary               TEXT NOT NULL DEFAULT '',
  content_markdown      TEXT NOT NULL DEFAULT '',
  system_prompt_snippet TEXT NOT NULL DEFAULT '',
  forge_consensus       INTEGER,
  approved_by           VARCHAR(100),
  review_due_at         TIMESTAMP,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_keywords (
  id          SERIAL PRIMARY KEY,
  module_id   INTEGER NOT NULL REFERENCES knowledge_modules(id) ON DELETE CASCADE,
  keyword     VARCHAR(100) NOT NULL,
  weight      FLOAT NOT NULL DEFAULT 1.0,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_injections (
  id            SERIAL PRIMARY KEY,
  synthesis_id  VARCHAR(100),
  user_email    VARCHAR(200),
  module_ids    INTEGER[],
  query_snippet TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_candidates (
  id               SERIAL PRIMARY KEY,
  synthesis_id     VARCHAR(100),
  user_email       VARCHAR(200),
  proposed_title   VARCHAR(200),
  proposed_content TEXT,
  proposed_keywords TEXT[],
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by      VARCHAR(100),
  reviewed_at      TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT,
  email TEXT,
  type TEXT,
  comment TEXT,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS excel_analyses (
  user_email  TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  year_month  TEXT NOT NULL,
  entries     JSONB DEFAULT '[]',
  PRIMARY KEY (user_email, year_month)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id  TEXT PRIMARY KEY,
  user_email  TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  model       TEXT NOT NULL,
  title       TEXT,
  messages    JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_email, updated_at DESC);

CREATE TABLE IF NOT EXISTS diary_entries (
  id             SERIAL PRIMARY KEY,
  user_email     TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  source         TEXT NOT NULL,
  title          TEXT,
  prompt         TEXT,
  content        TEXT,
  document_text  TEXT,
  conversation   JSONB,
  decision_note  TEXT,
  category       TEXT DEFAULT 'General',
  tags           TEXT[],
  search_text    TEXT,
  metadata       JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diary_user ON diary_entries(user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_category ON diary_entries(user_email, category);
CREATE INDEX IF NOT EXISTS idx_diary_source ON diary_entries(user_email, source);

-- Priority 4 (revised): "pending captures" — when a real, user-
-- initiated download fires for a conversation that hasn't been saved to
-- Diary YET, there's no existing entry to attach the captured file to.
-- Rather than silently dropping it (Option A) or silently creating a
-- Diary entry the user never asked for (Option B/C, explicitly rejected
-- — saving must stay a deliberate, explicit choice), the file is
-- uploaded to R2 immediately (the signed download URL is often time-
-- limited, so this can't wait for the user to decide whether to save)
-- and held here as a temporary, unclaimed record. If the user saves
-- that same conversation within the window below, the new entry
-- automatically adopts this already-hosted file — no second download
-- needed. If they never save, this row (and its R2 object) is simply
-- left to expire and get cleaned up; nothing about it was ever visible
-- anywhere in the product.
CREATE TABLE IF NOT EXISTS pending_attachment_captures (
  id               SERIAL PRIMARY KEY,
  user_email       TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  conversation_url TEXT NOT NULL,
  filename         TEXT NOT NULL,
  type             TEXT NOT NULL,
  url              TEXT NOT NULL,
  r2_key           TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_capture_lookup ON pending_attachment_captures(user_email, conversation_url);

CREATE TABLE IF NOT EXISTS forge_library (
  file_id     TEXT PRIMARY KEY,
  user_email  TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  file_type   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  file_data   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forge_library_user ON forge_library(user_email, created_at DESC);
`;

async function query(sql, params = []) {
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function init() {
  // Add email verification columns if missing
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE").catch(()=>{});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token TEXT").catch(()=>{});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS verify_token_exp TIMESTAMPTZ").catch(()=>{});
  try {
    await query(SCHEMA);
  } catch (err) {
    console.error('🐘 [DB] Init failed:', err.message);
  }
  // Safe migrations — each runs independently, never blocks startup
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en'").catch(() => {});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_student BOOLEAN DEFAULT FALSE").catch(() => {});
  await migrateDiary().catch(e => console.warn('[Diary migration error]', e.message));
  console.log('🐘 [DB] PostgreSQL schema ready');
  await migrateFromJson().catch(() => {});
}

async function migrateFromJson() {
  const fs = require('fs'), path = require('path');
  const file = path.join(__dirname, '..', 'data', 'users.json');
  if (!fs.existsSync(file)) return;
  let users;
  try { users = JSON.parse(fs.readFileSync(file, 'utf8') || '{}'); } catch (_) { return; }

  for (const [email, u] of Object.entries(users)) {
    const exists = await query('SELECT email FROM users WHERE email=$1', [email]);
    if (exists.rows.length) continue;
    await query(`INSERT INTO users (email,user_id,name,password_hash,role,is_admin,tier,stripe_customer_id,two_factor,created_at,updated_at,last_login)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
      email, u.userId||email, u.name||'', u.passwordHash||'',
      u.role||'user', Boolean(u.isAdmin), u.tier||'starter',
      u.stripeCustomerId||null, JSON.stringify(u.twoFactor||{enabled:false}),
      u.createdAt||new Date().toISOString(), u.updatedAt||new Date().toISOString(), u.lastLogin||null
    ]);
    for (const [tok, s] of Object.entries(u.sessions||{})) {
      if (!s?.expiresAt || new Date(s.expiresAt)<new Date()) continue;
      await query('INSERT INTO sessions(token,user_email,created_at,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [tok, email, s.createdAt||new Date().toISOString(), s.expiresAt]);
    }
    for (const [prov, encKey] of Object.entries(u.providerKeys||{})) {
      if (!encKey) continue;
      await query('INSERT INTO provider_keys(user_email,provider,encrypted_key,connected_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [email, prov, encKey, u.providerConnectedAt?.[prov]||new Date().toISOString()]);
    }
    for (const p of (u.prompts||[])) {
      await query(`INSERT INTO prompts(id,user_email,text,favorite,category,tags,used_count,used_with,last_used_at,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
        [p.id,email,p.text,Boolean(p.favorite),p.category||'Other',JSON.stringify(p.tags||[]),
         p.usedCount||0,JSON.stringify(p.usedWith||{}),p.lastUsedAt||null,p.createdAt,p.updatedAt]);
    }
    for (const [ym, d] of Object.entries(u.synthesisUsage||{})) {
      // Migrate existing users table — add streak columns if missing
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_date DATE").catch(()=>{});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT").catch(()=>{});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0").catch(()=>{});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_access_token TEXT").catch(() => {});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) UNIQUE").catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS referral_clicks (
      id           SERIAL PRIMARY KEY,
      referral_code VARCHAR(12) NOT NULL,
      clicked_at   TIMESTAMPTZ DEFAULT NOW(),
      ip           TEXT,
      signed_up    BOOLEAN DEFAULT FALSE,
      converted    BOOLEAN DEFAULT FALSE,
      signup_email TEXT
    )
  `.replace("\n    ", " ")).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS referral_rewards (
      id           SERIAL PRIMARY KEY,
      user_email   TEXT NOT NULL,
      reward_type  TEXT NOT NULL,
      months       INTEGER DEFAULT 0,
      applied_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `.replace("\n    ", " ")).catch(() => {});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_token_expiry BIGINT").catch(() => {});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS diary_saves_count INTEGER DEFAULT 0").catch(() => {});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS diary_enabled BOOLEAN DEFAULT TRUE").catch(() => {});

  await query('INSERT INTO synthesis_usage(user_email,year_month,used,entries) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [email, ym, d.used||0, JSON.stringify(d.entries||[])]);
    }
    console.log(`🐘 [DB] Migrated: ${email}`);
  }
}

async function getUser(email) {
  const r = await query('SELECT * FROM users WHERE email=$1', [email]);
  return r.rows[0] || null;
}
async function saveUser(email, fields) {
  const keys = Object.keys(fields);
  const vals = Object.values(fields).map(v => 
    (v !== null && typeof v === 'object') ? JSON.stringify(v) : v
  );
  const set = keys.map((k,i) => `${k}=$${i+2}`).join(', ');
  await query(`UPDATE users SET ${set}, updated_at=NOW() WHERE email=$1`, [email,...vals]);
}
async function createUser(email, fields) {
  const cols = ['email',...Object.keys(fields)], vals = [email,...Object.values(fields)];
  const ph   = vals.map((_,i)=>`$${i+1}`).join(',');
  await query(`INSERT INTO users (${cols.join(',')}) VALUES (${ph})`, vals);
}

async function getSession(token) {
  const r = await query('SELECT * FROM sessions WHERE token=$1 AND expires_at>NOW()', [token]);
  return r.rows[0] || null;
}
async function createSession(token, userEmail, createdAt, expiresAt) {
  await query(`DELETE FROM sessions WHERE user_email=$1 AND token NOT IN (
    SELECT token FROM sessions WHERE user_email=$1 ORDER BY created_at DESC LIMIT 4)`, [userEmail]);
  await query('INSERT INTO sessions(token,user_email,created_at,expires_at) VALUES($1,$2,$3,$4)', [token,userEmail,createdAt,expiresAt]);
}
async function deleteSession(token) {
  await query('DELETE FROM sessions WHERE token=$1', [token]);
}

function yearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
async function checkAndIncrementUsage(userEmail) {
  const LIMITS = {
    starter:30, lite:150, creator:-1, pro:-1,
    professional:-1, 'work-like-a-pro':-1, team:-1, enterprise:-1
  };
  const user  = await getUser(userEmail);
  // Students get 100 free syntheses instead of 30
  const baseLimit = user ? (LIMITS[user.tier||'starter'] ?? 30) : 30;
  const limit = (baseLimit === 30 && user?.is_student) ? 100 : baseLimit;
  const ym     = yearMonth();
  const r      = await query('SELECT used FROM synthesis_usage WHERE user_email=$1 AND year_month=$2', [userEmail,ym]);
  const used   = r.rows[0]?.used || 0;
  if (limit !== null && limit !== -1 && used >= limit) return { allowed:false, used, limit };
  const ts = new Date().toISOString();
  await query(`INSERT INTO synthesis_usage(user_email,year_month,used,entries) VALUES($1,$2,1,$3::jsonb)
    ON CONFLICT(user_email,year_month) DO UPDATE SET used=synthesis_usage.used+1, entries=synthesis_usage.entries||$3::jsonb`,
    [userEmail, ym, JSON.stringify([ts])]);
  return { allowed:true, used:used+1, limit };
}
async function getUsage(userEmail) {
  const LIMITS = {starter:30,lite:150,creator:-1,pro:-1,professional:-1,'work-like-a-pro':-1,team:-1,enterprise:-1};
  const ym   = yearMonth();
  const r    = await query('SELECT used FROM synthesis_usage WHERE user_email=$1 AND year_month=$2', [userEmail,ym]);
  const user = await getUser(userEmail);
  const tier = user?.tier || 'starter';
  const limit = LIMITS[tier] ?? null;
  const used  = r.rows[0]?.used || 0;
  return { used, limit, remaining: limit!==null ? Math.max(0,limit-used) : null, tier };
}

// ── Continue-in-Forge usage (Diary Priority 9) ──────────────────────────────
// Deliberately a SEPARATE table/counter from synthesis_usage — confirmed
// explicit product decision: a continue is its own cost class (a real
// model call, same as a synthesis) but its own PURPOSE (the free→paid
// upsell moment). Two separate axes, per explicit decision, replacing
// an earlier, simpler per-message counter that had a real UX mismatch:
// counting raw messages meant "3 free continues" actually meant "3
// messages, ever, across every entry combined" — confusing against what
// the number sounds like it promises.
//
// - ENTRIES/month (generous, user-facing, marketed): the number a user
//   actually perceives — "how many conversations can I continue," not
//   "how many messages." Only charged once per distinct Diary entry per
//   month, on that entry's FIRST message of the month — a later
//   continuation of an already-counted entry never charges again, even
//   across many messages or many separate visits.
// - MESSAGES/entry (guardrail, not marketed, same for every tier): caps
//   a single forked conversation's own growth, since the cost data
//   showed this — not how many entries someone forks — is the actual
//   cost driver (stateless replay means a long-running conversation's
//   input tokens grow with every turn). Set comfortably above any
//   normal back-and-forth, so it's invisible in real use but bounds the
//   worst case.
// starter raised from 10 to 20 — confirmed live as a real correction:
// an earlier claim that this already matched the agreed 20/month
// figure was mistaken; the code still had the original, pre-decision
// value. 20 is the deliberately generous, visible number from today's
// final structure (paired with the tightened, invisible 8-message/
// entry guardrail above) — the number free users actually perceive
// and compare, not the cost-control lever.
const CHAT_CONTINUE_ENTRY_LIMITS = {
  starter:20, lite:-1, creator:-1, pro:-1,
  professional:-1, 'work-like-a-pro':-1, team:-1, enterprise:-1,
  'diary-pro':-1, 'diary-pro-monthly':-1, 'diary-pro-yearly':-1
};
// Lowered from 15 to 8 — confirmed via full cost modeling (including
// prompt-caching-adjusted projections across a range of engagement
// assumptions, from a conservative 15% up to market-typical 60-85%)
// that this "invisible" guardrail axis is the one that can absorb a
// meaningful cost reduction without touching the visible, user-facing
// entries/month number at all. 8 sits comfortably above the ~3-5
// messages a realistic, ordinary conversation actually needs — stays
// genuinely invisible in normal use, per R&D's own original framing
// ("a guardrail, not user-facing marketing") — while still bounding
// the small minority of long-tail conversations that drive
// disproportionate cost (input tokens grow ~500/message due to
// stateless history replay, so cost compounds specifically with
// conversation length, not with how many separate entries someone
// continues).
//
// Raised for paid tiers specifically — confirmed as a real, direct
// product decision, not a bug fix: hitting this same, universal-8 cap
// on a genuine Diary Pro account produced an instinctive "this must be
// a bug" reaction from a paying user, which is itself real evidence
// the flat-universal design didn't match what "Pro" implied to someone
// experiencing it firsthand. Free tier keeps the original, tightly-
// bounded 8. Paid tiers get 50 — high enough that an ordinary, real
// conversation essentially never reaches it (matching the original 8's
// own "3-5 messages is normal use" analysis, just scaled up with real
// headroom for paid users specifically), while still bounding the
// same long-tail, runaway-cost conversations the original 8 was
// designed to catch — deliberately NOT unlimited, since the original
// cost-control reasoning for having a cap at all remains legitimate.
const CHAT_CONTINUE_MESSAGES_PER_ENTRY_CAP_FREE = 8;
const CHAT_CONTINUE_MESSAGES_PER_ENTRY_CAP_PAID = 50;
function getMessagesPerEntryCap(tier) {
  // Same "unlimited entries" tiers get the higher, paid cap — reuses
  // CHAT_CONTINUE_ENTRY_LIMITS' own, already-correct tier classification
  // (entryLimit === -1) rather than maintaining a second, separate list
  // of which tiers count as "paid" that could quietly drift out of sync
  // with the first one over time.
  return (CHAT_CONTINUE_ENTRY_LIMITS[tier] === -1) ? CHAT_CONTINUE_MESSAGES_PER_ENTRY_CAP_PAID : CHAT_CONTINUE_MESSAGES_PER_ENTRY_CAP_FREE;
}

// Diary's own, dedicated subscription check — reads the per-product
// subscriptions table (see routes/stripe.js's own comment for why it
// exists at all: "a single users.tier column can't represent
// 'subscribed to Sweep AND Forge at once' — the most recent purchase
// just overwrites whatever was there before" — since Continue-in-Forge
// is specifically a Diary entitlement, checking Diary's own, dedicated
// row here is immune to that risk entirely, rather than trusting
// whichever product happened to be purchased most recently). Falls
// back to the shared tier column only if no dedicated Diary
// subscription row exists at all (e.g. a user who predates this
// per-product table). Confirmed live, directly reported: a genuine
// Diary Pro subscriber was still capped at the free-tier limit here —
// confirmed the immediate cause was CHAT_CONTINUE_ENTRY_LIMITS itself
// not recognizing 'diary-pro-monthly'/'diary-pro-yearly' as keys at
// all (now added above), but reading from the per-product table here
// too closes the same, deeper gap for good, not just this one symptom.
async function getDiaryTier(userEmail) {
  try {
    const subR = await query(
      "SELECT tier FROM subscriptions WHERE user_email=$1 AND product='diary' AND status='active'",
      [userEmail]
    );
    if (subR.rows.length) return subR.rows[0].tier;
  } catch(_) {}
  const user = await getUser(userEmail);
  return user?.tier || 'starter';
}

async function checkAndIncrementChatContinueUsage(userEmail, diaryEntryId, existingSessionId) {
  // Tier lookup moved ahead of the guardrail check below — the
  // per-entry message cap is now tier-aware (see
  // getMessagesPerEntryCap's own comment), so the tier itself needs to
  // be known before that check can run at all, not just before the
  // entries/month check further down.
  const tier = await getDiaryTier(userEmail);
  const messagesPerEntryCap = getMessagesPerEntryCap(tier);

  // Guardrail axis first: cap growth within a single, already-existing
  // forked conversation, regardless of tier or the entries/month count
  // below — this applies even to unlimited-entries paid tiers, since
  // it's bounding an individual conversation's own cost growth, not
  // free-vs-paid access to the feature at all.
  //
  // NOTE: fixed a genuine, confirmed bug — this previously counted
  // EVERY user-role message in chat_sessions.messages, including the
  // ones seeded directly from the original native conversation at fork
  // time. For any entry whose native history already had more user
  // turns than the cap itself (confirmed live: a 44-message-deep
  // native seed hit "23/15" before a single new Forge message could
  // even be sent), this made Continue-in-Forge entirely unusable
  // immediately, not a growth guardrail at all. The cap is meant to
  // bound NEW, Forge-side growth specifically — using
  // metadata.nativeSeedMessageCount (the exact index where seeded
  // content ends and Forge-side content begins, set once at fork time)
  // to slice those seeded messages off before counting fixes this
  // precisely, without needing to infer how many of the seed's own
  // messages happened to be user-role.
  if (existingSessionId) {
    const sessionR = await query('SELECT messages FROM chat_sessions WHERE session_id=$1 AND user_email=$2', [existingSessionId, userEmail]);
    const messages = (sessionR.rows[0] && sessionR.rows[0].messages) || [];
    let seedCount = 0;
    if (diaryEntryId) {
      const entryR = await query('SELECT metadata FROM diary_entries WHERE id=$1 AND user_email=$2', [diaryEntryId, userEmail]);
      const entryMeta = (entryR.rows[0] && entryR.rows[0].metadata) || {};
      if (typeof entryMeta.nativeSeedMessageCount === 'number') seedCount = entryMeta.nativeSeedMessageCount;
    }
    const newMessagesOnly = messages.slice(seedCount);
    const userMessageCount = newMessagesOnly.filter(function(m) { return m.role === 'user'; }).length;
    if (userMessageCount >= messagesPerEntryCap) {
      return { allowed:false, reason:'message_cap', messageCount:userMessageCount, messageCap:messagesPerEntryCap, isPaidTier: CHAT_CONTINUE_ENTRY_LIMITS[tier] === -1, paidTierMessageCap: CHAT_CONTINUE_MESSAGES_PER_ENTRY_CAP_PAID };
    }
  }

  // Fallback (for any tier string not found in the map above) kept
  // consistent with starter's own value — 20, not the earlier 10 —
  // since an unrecognized tier defaulting to a DIFFERENT number than
  // the actual free tier would itself be a confusing inconsistency.
  const entryLimit = CHAT_CONTINUE_ENTRY_LIMITS[tier] ?? 20;
  const ym    = yearMonth();

  const alreadyForkedR = await query(
    'SELECT 1 FROM chat_continue_entries_usage WHERE user_email=$1 AND year_month=$2 AND diary_entry_id=$3',
    [userEmail, ym, diaryEntryId]
  );
  const isNewEntryThisMonth = alreadyForkedR.rows.length === 0;

  if (isNewEntryThisMonth && entryLimit !== null && entryLimit !== -1) {
    const countR = await query(
      'SELECT COUNT(*) AS total FROM chat_continue_entries_usage WHERE user_email=$1 AND year_month=$2',
      [userEmail, ym]
    );
    const entriesUsed = parseInt((countR.rows[0] && countR.rows[0].total) || 0, 10);
    if (entriesUsed >= entryLimit) {
      return { allowed:false, reason:'entry_limit', entriesUsed, entryLimit };
    }
  }

  if (isNewEntryThisMonth) {
    await query(
      'INSERT INTO chat_continue_entries_usage (user_email, year_month, diary_entry_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [userEmail, ym, diaryEntryId]
    );
  }

  return { allowed:true };
}

async function getChatContinueUsage(userEmail) {
  const ym    = yearMonth();
  const countR = await query(
    'SELECT COUNT(*) AS total FROM chat_continue_entries_usage WHERE user_email=$1 AND year_month=$2',
    [userEmail, ym]
  );
  const entriesUsed = parseInt((countR.rows[0] && countR.rows[0].total) || 0, 10);
  const tier  = await getDiaryTier(userEmail);
  const entryLimit = CHAT_CONTINUE_ENTRY_LIMITS[tier] ?? null;
  return {
    entriesUsed,
    entryLimit,
    entriesRemaining: entryLimit!==null && entryLimit!==-1 ? Math.max(0, entryLimit-entriesUsed) : null,
    messageCapPerEntry: getMessagesPerEntryCap(tier),
    tier
  };
}

async function updateStreak(userEmail) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const r = await query('SELECT last_active_date, streak_count FROM users WHERE email=$1', [userEmail]);
    const user = r.rows[0];
    if (!user) return;
    const last = user.last_active_date ? user.last_active_date.toISOString().slice(0, 10) : null;
    if (last === today) return; // already updated today
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const newStreak = last === yesterday ? (user.streak_count || 0) + 1 : 1;
    await query('UPDATE users SET last_active_date=$1, streak_count=$2, updated_at=NOW() WHERE email=$3',
      [today, newStreak, userEmail]);
  } catch(e) { console.error('[Streak] update failed:', e.message); }
}

// ── Chat sessions (Forge Chat — continue conversation with one model) ──────
async function createChatSession(sessionId, userEmail, model, messages, title) {
  await query(
    `INSERT INTO chat_sessions (session_id, user_email, model, messages, title, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
    [sessionId, userEmail, model, JSON.stringify(messages || []), title || null]
  );
}

async function getChatSession(sessionId, userEmail) {
  const r = await query('SELECT * FROM chat_sessions WHERE session_id=$1 AND user_email=$2', [sessionId, userEmail]);
  return r.rows[0] || null;
}

async function updateChatSession(sessionId, userEmail, messages) {
  await query(
    'UPDATE chat_sessions SET messages=$1, updated_at=NOW() WHERE session_id=$2 AND user_email=$3',
    [JSON.stringify(messages), sessionId, userEmail]
  );
}

async function listChatSessions(userEmail, limit = 20) {
  const r = await query(
    'SELECT session_id, model, title, created_at, updated_at FROM chat_sessions WHERE user_email=$1 ORDER BY updated_at DESC LIMIT $2',
    [userEmail, limit]
  );
  return r.rows;
}

// ── Forge Library (file storage) ────────────────────────────────────────────
async function libraryUpload(userEmail, fileId, filename, fileType, fileSize, fileData) {
  await query(
    'INSERT INTO forge_library (file_id, user_email, filename, file_type, file_size, file_data, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
    [fileId, userEmail, filename, fileType, fileSize, fileData]
  );
}

async function libraryList(userEmail) {
  const r = await query(
    'SELECT file_id, filename, file_type, file_size, created_at FROM forge_library WHERE user_email=$1 ORDER BY created_at DESC',
    [userEmail]
  );
  return r.rows;
}

async function libraryGet(fileId, userEmail) {
  const r = await query(
    'SELECT * FROM forge_library WHERE file_id=$1 AND user_email=$2',
    [fileId, userEmail]
  );
  return r.rows[0] || null;
}

async function libraryDelete(fileId, userEmail) {
  await query('DELETE FROM forge_library WHERE file_id=$1 AND user_email=$2', [fileId, userEmail]);
}

module.exports = { init, query, getUser, saveUser, createUser, getSession, createSession, deleteSession, checkAndIncrementUsage, getUsage, checkAndIncrementChatContinueUsage, getChatContinueUsage, updateStreak, yearMonth, pool, createChatSession, getChatSession, updateChatSession, listChatSessions, libraryUpload, libraryList, libraryGet, libraryDelete };

// ── Diary migration: add missing columns if they don't exist ─────────────────
async function migrateDiary() {
  const migrations = [
    "ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General'",
    "ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'",
    "ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS search_text TEXT",
    "ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false",
    "CREATE INDEX IF NOT EXISTS idx_diary_category ON diary_entries(user_email, category)",
    "CREATE INDEX IF NOT EXISTS idx_diary_source ON diary_entries(user_email, source)",
    "CREATE INDEX IF NOT EXISTS idx_diary_favorite ON diary_entries(user_email, is_favorite)",
  ];
  for (const sql of migrations) {
    try { await query(sql); } catch(e) { console.warn('[Diary migration]', e.message); }
  }
  console.log('✅ [Diary] Column migration complete');
}
