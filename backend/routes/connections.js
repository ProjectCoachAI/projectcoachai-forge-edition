'use strict';
/**
 * /api/connections — Manage a user's AI provider API keys.
 *
 * GET    /api/connections            → list which providers are connected (no keys returned)
 * POST   /api/connections/:provider  → save (or update) a provider key
 * DELETE /api/connections/:provider  → remove a provider key
 * GET    /api/connections/test/:provider → verify the key works (fires a minimal API call)
 *
 * Keys are stored AES-256-GCM encrypted in users.json.
 * The plaintext key is NEVER returned to the frontend.
 */
const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const https    = require('https');
const router   = express.Router();
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { encrypt, decrypt } = require('../lib/encrypt');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

const PROVIDERS = ['claude', 'chatgpt', 'gemini', 'mistral', 'deepseek', 'perplexity', 'grok'];

function readUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (_) { return {}; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// ── GET /api/connections ─────────────────────────────────────────────────────
// Returns connected status per provider — never the actual key value.
router.get('/', optionalAuth, (req, res) => {
  if (!req.user) return res.json({ success: true, connections: {} });
  const users = readUsers();
  const user  = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const raw = user.providerKeys || {};
  const status = {};
  for (const provider of PROVIDERS) {
    const stored = raw[provider];
    status[provider] = {
      connected:    Boolean(stored),
      connectedAt:  user.providerConnectedAt?.[provider] || null,
    };
  }
  res.json({ success: true, connections: status });
});

// ── POST /api/connections/:provider ──────────────────────────────────────────
// Save or update a provider key. Body: { apiKey: "sk-..." }
router.post('/:provider', requireAuth, (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!PROVIDERS.includes(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }

  const apiKey = String(req.body?.apiKey || '').trim();
  if (!apiKey) {
    return res.status(400).json({ success: false, error: 'apiKey is required' });
  }
  // Basic sanity — keys are usually 20+ chars
  if (apiKey.length < 10) {
    return res.status(400).json({ success: false, error: 'API key appears too short' });
  }

  const users = readUsers();
  const user  = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  if (!user.providerKeys) user.providerKeys = {};
  if (!user.providerConnectedAt) user.providerConnectedAt = {};

  user.providerKeys[provider]        = encrypt(apiKey);
  user.providerConnectedAt[provider] = new Date().toISOString();
  user.updatedAt = new Date().toISOString();

  users[req.userEmail] = user;
  writeUsers(users);

  console.log(`🔗 [Connections] ${req.user.email} connected ${provider}`);
  res.json({ success: true, provider, connected: true, connectedAt: user.providerConnectedAt[provider] });
});

// ── DELETE /api/connections/:provider ────────────────────────────────────────
router.delete('/:provider', requireAuth, (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!PROVIDERS.includes(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }

  const users = readUsers();
  const user  = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  if (user.providerKeys) delete user.providerKeys[provider];
  if (user.providerConnectedAt) delete user.providerConnectedAt[provider];
  user.updatedAt = new Date().toISOString();

  users[req.userEmail] = user;
  writeUsers(users);

  console.log(`🔌 [Connections] ${req.user.email} disconnected ${provider}`);
  res.json({ success: true, provider, connected: false });
});

// ── GET /api/connections/test/:provider ──────────────────────────────────────
// Fires a minimal API call to verify the stored key is valid.
router.get('/test/:provider', requireAuth, async (req, res) => {
  const provider = String(req.params.provider || '').toLowerCase();
  if (!PROVIDERS.includes(provider)) {
    return res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
  }

  const users = readUsers();
  const user  = users[req.userEmail];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const encryptedKey = user.providerKeys?.[provider];
  if (!encryptedKey) {
    return res.json({ success: false, connected: false, error: 'No key stored for this provider' });
  }

  const apiKey = decrypt(encryptedKey);
  if (!apiKey) {
    return res.json({ success: false, connected: false, error: 'Could not decrypt stored key' });
  }

  // Minimal validation call per provider
  try {
    const valid = await testProviderKey(provider, apiKey);
    res.json({ success: true, connected: valid.ok, provider, message: valid.message });
  } catch (err) {
    res.json({ success: false, connected: false, provider, error: err.message });
  }
});

// ── Internal: retrieve decrypted key for a user+provider ─────────────────────
// Used by compare.js — NOT exposed as an HTTP endpoint.
function getUserProviderKey(userEmail, provider) {
  try {
    const users = readUsers();
    const user  = users[userEmail];
    if (!user || !user.providerKeys?.[provider]) return null;
    return decrypt(user.providerKeys[provider]);
  } catch (_) { return null; }
}

// ── Minimal provider key validation ──────────────────────────────────────────
function testProviderKey(provider, apiKey) {
  const tests = {
    chatgpt: () => testOpenAI(apiKey),
    claude:  () => testClaude(apiKey),
    gemini:  () => testGemini(apiKey),
    mistral: () => testMistral(apiKey),
    deepseek:() => testDeepSeek(apiKey),
    perplexity: () => testPerplexity(apiKey),
    grok:    () => testGrok(apiKey),
  };
  return (tests[provider] || (() => Promise.resolve({ ok: false, message: 'No test available' })))();
}

function minimalPost(options, body) {
  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (_) { resolve({ status: res.statusCode, data: {} }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.write(body);
    req.end();
  });
}

async function testOpenAI(apiKey) {
  const body = JSON.stringify({ model:'gpt-4o-mini', max_tokens:1, messages:[{role:'user',content:'hi'}] });
  const r = await minimalPost({ hostname:'api.openai.com', port:443, path:'/v1/chat/completions', method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'Content-Length':Buffer.byteLength(body) } }, body);
  if (r.status === 200 || r.status === 201) return { ok: true,  message: 'ChatGPT key is valid' };
  if (r.status === 401) return { ok: false, message: 'Invalid API key' };
  return { ok: false, message: `Unexpected response (${r.status})` };
}

async function testClaude(apiKey) {
  const body = JSON.stringify({ model:'claude-haiku-4-5-20251001', max_tokens:1, messages:[{role:'user',content:'hi'}] });
  const r = await minimalPost({ hostname:'api.anthropic.com', port:443, path:'/v1/messages', method:'POST', headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(body) } }, body);
  if (r.status === 200 || r.status === 201) return { ok: true,  message: 'Claude key is valid' };
  if (r.status === 401) return { ok: false, message: 'Invalid API key' };
  return { ok: false, message: `Unexpected response (${r.status})` };
}

async function testGemini(apiKey) {
  const body = JSON.stringify({ contents:[{parts:[{text:'hi'}]}], generationConfig:{maxOutputTokens:1} });
  const r = await minimalPost({ hostname:'generativelanguage.googleapis.com', port:443, path:`/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, method:'POST', headers:{ 'Content-Type':'application/json','Content-Length':Buffer.byteLength(body) } }, body);
  if (r.status === 200) return { ok: true,  message: 'Gemini key is valid' };
  if (r.status === 400 && r.data?.error?.message?.includes('API key')) return { ok: false, message: 'Invalid API key' };
  return { ok: false, message: `Unexpected response (${r.status})` };
}

async function testMistral(apiKey) {
  const body = JSON.stringify({ model:'mistral-small-latest', max_tokens:1, messages:[{role:'user',content:'hi'}] });
  const r = await minimalPost({ hostname:'api.mistral.ai', port:443, path:'/v1/chat/completions', method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'Content-Length':Buffer.byteLength(body) } }, body);
  if (r.status === 200) return { ok: true,  message: 'Mistral key is valid' };
  if (r.status === 401) return { ok: false, message: 'Invalid API key' };
  return { ok: false, message: `Unexpected response (${r.status})` };
}

async function testDeepSeek(apiKey) {
  const body = JSON.stringify({ model:'deepseek-chat', max_tokens:1, messages:[{role:'user',content:'hi'}] });
  const r = await minimalPost({ hostname:'api.deepseek.com', port:443, path:'/v1/chat/completions', method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'Content-Length':Buffer.byteLength(body) } }, body);
  if (r.status === 200) return { ok: true,  message: 'DeepSeek key is valid' };
  if (r.status === 401) return { ok: false, message: 'Invalid API key' };
  return { ok: false, message: `Unexpected response (${r.status})` };
}

async function testPerplexity(apiKey) {
  const body = JSON.stringify({ model:'llama-3.1-sonar-small-128k-online', max_tokens:1, messages:[{role:'user',content:'hi'}] });
  const r = await minimalPost({ hostname:'api.perplexity.ai', port:443, path:'/chat/completions', method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'Content-Length':Buffer.byteLength(body) } }, body);
  if (r.status === 200) return { ok: true,  message: 'Perplexity key is valid' };
  if (r.status === 401) return { ok: false, message: 'Invalid API key' };
  return { ok: false, message: `Unexpected response (${r.status})` };
}

async function testGrok(apiKey) {
  const body = JSON.stringify({ model:'grok-beta', max_tokens:1, messages:[{role:'user',content:'hi'}] });
  const r = await minimalPost({ hostname:'api.x.ai', port:443, path:'/v1/chat/completions', method:'POST', headers:{ 'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`,'Content-Length':Buffer.byteLength(body) } }, body);
  if (r.status === 200) return { ok: true,  message: 'Grok key is valid' };
  if (r.status === 401) return { ok: false, message: 'Invalid API key' };
  return { ok: false, message: `Unexpected response (${r.status})` };
}

module.exports = router;
module.exports.getUserProviderKey = getUserProviderKey;
module.exports.PROVIDERS = PROVIDERS;
