'use strict';
/**
 * /api/prompts — Prompt Library CRUD per authenticated user.
 *
 * GET    /api/prompts              → list all prompts
 * POST   /api/prompts              → create a prompt
 * PATCH  /api/prompts/:id          → update (text, favorite, tags, category)
 * DELETE /api/prompts/:id          → delete a prompt
 * POST   /api/prompts/:id/use      → record a usage (increments count + sets lastUsedAt + tracks AI)
 * DELETE /api/prompts/expired      → purge non-favorite prompts older than AUTO_DELETE_DAYS
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const router  = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');

const USERS_FILE      = path.join(__dirname, '..', 'data', 'users.json');
const AUTO_DELETE_DAYS = 60;

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}'); }
  catch (_) { return {}; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}
function getUserPrompts(user) {
  return Array.isArray(user.prompts) ? user.prompts : [];
}

// ── GET /api/prompts ─────────────────────────────────────────────────────────
router.get('/', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ success: true, prompts: [] });
  const users  = readUsers();
  const user   = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const prompts = getUserPrompts(user);
  const now     = Date.now();

  // Auto-purge expired non-favorites (don't write unless something was removed)
  const cutoff  = now - AUTO_DELETE_DAYS * 86400000;
  const active  = prompts.filter(p => p.favorite || new Date(p.createdAt).getTime() >= cutoff);
  if (active.length < prompts.length) {
    user.prompts = active;
    users[req.userEmail] = user;
    writeUsers(users);
  }

  // Optional filters via query params: ?favorite=true  ?category=coding  ?q=search
  let result = active;
  if (req.query.favorite === 'true')  result = result.filter(p => p.favorite);
  if (req.query.category)             result = result.filter(p => p.category === req.query.category);
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    result = result.filter(p => p.text.toLowerCase().includes(q) || (p.tags || []).some(t => t.toLowerCase().includes(q)));
  }

  res.json({ success: true, prompts: result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

// ── POST /api/prompts ────────────────────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Prompt text is required' });

  const users = readUsers();
  const user  = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const prompt = {
    id:          crypto.randomBytes(12).toString('hex'),
    text,
    favorite:    Boolean(req.body?.favorite),
    category:    String(req.body?.category || 'Other'),
    tags:        Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
    usedCount:   0,
    usedWith:    {},   // { chatgpt: 3, claude: 1, ... }
    lastUsedAt:  null,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  if (!user.prompts) user.prompts = [];
  user.prompts.push(prompt);
  users[req.userEmail] = user;
  writeUsers(users);

  res.status(201).json({ success: true, prompt });
});

// ── PATCH /api/prompts/:id ───────────────────────────────────────────────────
router.patch('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const users   = readUsers();
  const user    = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const prompts = getUserPrompts(user);
  const idx     = prompts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Prompt not found' });

  const p    = prompts[idx];
  const body = req.body || {};

  if (body.text     !== undefined) p.text     = String(body.text).trim();
  if (body.favorite !== undefined) p.favorite = Boolean(body.favorite);
  if (body.category !== undefined) p.category = String(body.category);
  if (Array.isArray(body.tags))    p.tags     = body.tags.map(String);
  p.updatedAt = new Date().toISOString();

  prompts[idx] = p;
  user.prompts = prompts;
  users[req.userEmail] = user;
  writeUsers(users);

  res.json({ success: true, prompt: p });
});

// ── DELETE /api/prompts/:id ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const users   = readUsers();
  const user    = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const before = getUserPrompts(user).length;
  user.prompts = getUserPrompts(user).filter(p => p.id !== id);

  if (user.prompts.length === before) {
    return res.status(404).json({ success: false, error: 'Prompt not found' });
  }
  users[req.userEmail] = user;
  writeUsers(users);
  res.json({ success: true });
});

// ── POST /api/prompts/:id/use ────────────────────────────────────────────────
// Called after a prompt is run in Compare or Quick Chat.
// Body: { provider: 'chatgpt' }  (optional)
router.post('/:id/use', requireAuth, (req, res) => {
  const { id } = req.params;
  const users   = readUsers();
  const user    = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const prompts = getUserPrompts(user);
  const idx     = prompts.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Prompt not found' });

  const p = prompts[idx];
  p.usedCount  = (p.usedCount || 0) + 1;
  p.lastUsedAt = new Date().toISOString();

  const provider = String(req.body?.provider || '').toLowerCase();
  if (provider) {
    if (!p.usedWith) p.usedWith = {};
    p.usedWith[provider] = (p.usedWith[provider] || 0) + 1;
  }

  prompts[idx] = p;
  user.prompts = prompts;
  users[req.userEmail] = user;
  writeUsers(users);

  res.json({ success: true, prompt: p });
});

// ── DELETE /api/prompts/expired ──────────────────────────────────────────────
// Admin/manual trigger to purge non-favorites older than AUTO_DELETE_DAYS.
router.delete('/expired', requireAuth, (req, res) => {
  const users  = readUsers();
  const user   = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const cutoff  = Date.now() - AUTO_DELETE_DAYS * 86400000;
  const before  = getUserPrompts(user).length;
  user.prompts  = getUserPrompts(user).filter(p => p.favorite || new Date(p.createdAt).getTime() >= cutoff);
  const removed = before - user.prompts.length;

  users[req.userEmail] = user;
  writeUsers(users);
  res.json({ success: true, removed });
});

module.exports = router;
