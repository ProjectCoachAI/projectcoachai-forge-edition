'use strict';
const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../lib/db');
const { requireAuth, optionalAuth } = require('../middleware/auth');


// Safe async wrapper
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res, next); }
  catch(e) { console.error('[Prompts]', e.message); res.status(500).json({ success:false, error:'Server error' }); }
};

const AUTO_DELETE_DAYS = 60;

router.get('/', optionalAuth, async (req, res) => {
  if (!req.user) return res.json({ success:true, prompts:[] });

  // Auto-purge expired non-favorites
  const cutoff = new Date(Date.now() - AUTO_DELETE_DAYS * 86400000).toISOString();
  await db.query(`DELETE FROM prompts WHERE user_email=$1 AND favorite=FALSE AND created_at < $2`, [req.user.email, cutoff]);

  let sql = 'SELECT * FROM prompts WHERE user_email=$1';
  const params = [req.user.email];
  if (req.query.favorite === 'true') { sql += ` AND favorite=TRUE`; }
  if (req.query.category) { sql += ` AND category=$${params.length+1}`; params.push(req.query.category); }
  if (req.query.q) { sql += ` AND LOWER(text) LIKE $${params.length+1}`; params.push(`%${req.query.q.toLowerCase()}%`); }
  sql += ' ORDER BY created_at DESC';

  const r = await db.query(sql, params);
  res.json({ success:true, prompts: r.rows.map(dbToPrompt) });
});

router.post('/', requireAuth, async (req, res) => {
  const text = String(req.body?.text||'').trim();
  if (!text) return res.status(400).json({ success:false, error:'Prompt text is required' });

  const id = crypto.randomBytes(12).toString('hex');
  const now = new Date().toISOString();
  await db.query(`INSERT INTO prompts(id,user_email,text,favorite,category,tags,used_count,used_with,created_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,0,'{}', $7,$8)`,
    [id, req.user.email, text, Boolean(req.body?.favorite), req.body?.category||'Other',
     JSON.stringify(Array.isArray(req.body?.tags) ? req.body.tags : []), now, now]);

  const r = await db.query('SELECT * FROM prompts WHERE id=$1', [id]);
  res.status(201).json({ success:true, prompt: dbToPrompt(r.rows[0]) });
});

router.patch('/:id', requireAuth, async (req, res) => {
  const r = await db.query('SELECT * FROM prompts WHERE id=$1 AND user_email=$2', [req.params.id, req.user.email]);
  if (!r.rows[0]) return res.status(404).json({ success:false, error:'Prompt not found' });

  const body = req.body || {};
  const sets = [], vals = [req.params.id, req.user.email];
  let i = 3;
  if (body.text     !== undefined) { sets.push(`text=$${i++}`);     vals.push(String(body.text).trim()); }
  if (body.favorite !== undefined) { sets.push(`favorite=$${i++}`); vals.push(Boolean(body.favorite)); }
  if (body.category !== undefined) { sets.push(`category=$${i++}`); vals.push(String(body.category)); }
  if (Array.isArray(body.tags))    { sets.push(`tags=$${i++}`);     vals.push(JSON.stringify(body.tags)); }
  sets.push('updated_at=NOW()');

  await db.query(`UPDATE prompts SET ${sets.join(',')} WHERE id=$1 AND user_email=$2`, vals);
  const updated = await db.query('SELECT * FROM prompts WHERE id=$1', [req.params.id]);
  res.json({ success:true, prompt: dbToPrompt(updated.rows[0]) });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const r = await db.query('DELETE FROM prompts WHERE id=$1 AND user_email=$2 RETURNING id', [req.params.id, req.user.email]);
  if (!r.rows[0]) return res.status(404).json({ success:false, error:'Prompt not found' });
  res.json({ success:true });
});

router.post('/:id/use', requireAuth, wrap(async (req, res) => {
  const r = await db.query('SELECT * FROM prompts WHERE id=$1 AND user_email=$2', [req.params.id, req.user.email]);
  if (!r.rows[0]) return res.status(404).json({ success:false, error:'Prompt not found' });

  const provider = String(req.body?.provider||'').toLowerCase();
  const p = r.rows[0];
  const usedWith = typeof p.used_with === 'object' ? p.used_with : {};
  if (provider) usedWith[provider] = (usedWith[provider]||0) + 1;

  await db.query(`UPDATE prompts SET used_count=used_count+1, last_used_at=NOW(), used_with=$1, updated_at=NOW() WHERE id=$2`,
    [JSON.stringify(usedWith), req.params.id]);
  const updated = await db.query('SELECT * FROM prompts WHERE id=$1', [req.params.id]);
  res.json({ success:true, prompt: dbToPrompt(updated.rows[0]) });
});

function dbToPrompt(row) {
  if (!row) return null;
  return {
    id: row.id, text: row.text, favorite: row.favorite,
    category: row.category, tags: row.tags || [],
    usedCount: row.used_count, usedWith: row.used_with || {},
    lastUsedAt: row.last_used_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

module.exports = router;

