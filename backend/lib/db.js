'use strict';
/**
 * lib/db.js — PostgreSQL connection and schema for Forge
 * Replaces users.json entirely. Uses the pg package.
 * DATABASE_URL is set automatically by Railway when Postgres is linked.
 */
const { Pool } = require('pg');

const pool = new Pool({
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
  last_login         TIMESTAMPTZ
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
CREATE TABLE IF NOT EXISTS excel_analyses (
  user_email  TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  year_month  TEXT NOT NULL,
  entries     JSONB DEFAULT '[]',
  PRIMARY KEY (user_email, year_month)
);
`;

async function query(sql, params = []) {
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

async function init() {
  try {
    await query(SCHEMA);
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
  const LIMITS = {starter:30,lite:100,creator:100,pro:300,professional:300,team:null,enterprise:null};
  const user   = await getUser(userEmail);
  const limit  = user ? (LIMITS[user.tier||'starter'] ?? null) : 30;
  const ym     = yearMonth();
  const r      = await query('SELECT used FROM synthesis_usage WHERE user_email=$1 AND year_month=$2', [userEmail,ym]);
  const used   = r.rows[0]?.used || 0;
  if (limit !== null && used >= limit) return { allowed:false, used, limit };
  const ts = new Date().toISOString();
  await query(`INSERT INTO synthesis_usage(user_email,year_month,used,entries) VALUES($1,$2,1,$3::jsonb)
    ON CONFLICT(user_email,year_month) DO UPDATE SET used=synthesis_usage.used+1, entries=synthesis_usage.entries||$3::jsonb`,
    [userEmail, ym, JSON.stringify([ts])]);
  return { allowed:true, used:used+1, limit };
}
async function getUsage(userEmail) {
  const LIMITS = {starter:30,lite:100,creator:100,pro:300,professional:300,team:null,enterprise:null};
  const ym   = yearMonth();
  const r    = await query('SELECT used FROM synthesis_usage WHERE user_email=$1 AND year_month=$2', [userEmail,ym]);
  const user = await getUser(userEmail);
  const tier = user?.tier || 'starter';
  const limit = LIMITS[tier] ?? null;
  const used  = r.rows[0]?.used || 0;
  return { used, limit, remaining: limit!==null ? Math.max(0,limit-used) : null, tier };
}

module.exports = { init, query, getUser, saveUser, createUser, getSession, createSession, deleteSession, checkAndIncrementUsage, getUsage, yearMonth, pool };
