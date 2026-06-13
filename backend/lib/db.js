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
    // Add preferred_language if missing (safe migration)
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5) DEFAULT 'en'").catch(() => {});
  await query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_student BOOLEAN DEFAULT FALSE").catch(() => {});
  console.log('🐘 [DB] PostgreSQL schema ready');
    await migrateFromJson();
  } catch (err) {
    console.error('🐘 [DB] Init failed:', err.message);
  }
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

module.exports = { init, query, getUser, saveUser, createUser, getSession, createSession, deleteSession, checkAndIncrementUsage, getUsage, updateStreak, yearMonth, pool, createChatSession, getChatSession, updateChatSession, listChatSessions };
