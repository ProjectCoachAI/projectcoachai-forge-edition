'use strict';
/**
 * /api/split — Single-provider query for Forge Split panel.
 *
 * POST /api/split
 * Body: { prompt, provider }
 *   prompt   — the user's question
 *   provider — one of: claude | chatgpt | gemini | mistral | deepseek | perplexity | grok
 *
 * For providers where Forge has an API key, responds directly.
 * For others, returns a clear message so the Split panel can fall back
 * to the tab injection method or show a helpful error.
 *
 * Phase 1: Claude only (uses Forge's ANTHROPIC_API_KEY)
 * Phase 2: Add OpenAI key for ChatGPT, Google key for Gemini etc.
 */
'use strict';
const express = require('express');
const https   = require('https');
const router  = express.Router();
const { optionalAuth } = require('../middleware/auth');

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const API_VER      = '2023-06-01';

// Provider capability map — extend as API keys are added to Railway env vars
const PROVIDER_CAPS = {
  claude:     { available: () => !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY), fn: callClaude },
  chatgpt:    { available: () => !!process.env.OPENAI_API_KEY,                                    fn: callOpenAI },
  gemini:     { available: () => !!(process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY), fn: callGemini },
  mistral:    { available: () => !!(process.env.Mistral_AI_API_Key || process.env.MISTRAL_API_KEY), fn: callMistral },
  deepseek:   { available: () => !!(process.env.DeepSeek_API_Key || process.env.DEEPSEEK_API_KEY),  fn: callDeepSeek },
  perplexity: { available: () => !!(process.env.Perplexity_AI_API_Key || process.env.PERPLEXITY_API_KEY), fn: callPerplexity },
  grok:       { available: () => !!(process.env.Grok_AI_API_Key || process.env.GROK_API_KEY),      fn: callGrok },
};

const VALID_PROVIDERS = Object.keys(PROVIDER_CAPS);

// ── Main route ────────────────────────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  const prompt   = typeof req.body.prompt   === 'string' ? req.body.prompt.trim().slice(0, 4000) : '';
  const provider = typeof req.body.provider === 'string' ? req.body.provider.toLowerCase().trim() : '';

  if (!prompt)   return res.status(400).json({ success: false, error: 'Prompt is required.' });
  if (!provider || !VALID_PROVIDERS.includes(provider))
    return res.status(400).json({ success: false, error: `Invalid provider. Use: ${VALID_PROVIDERS.join(', ')}` });

  const cap = PROVIDER_CAPS[provider];
  if (!cap.available()) {
    return res.status(503).json({
      success:  false,
      error:    `${provider} API key not configured. Ask the second AI from its native tab and the response will appear in the Split panel automatically.`,
      fallback: true
    });
  }

  console.log(`[Split] provider=${provider} | user=${req.userEmail || 'anon'} | prompt="${prompt.slice(0, 60)}"`);

  try {
    const content = await cap.fn(prompt);
    res.json({ success: true, provider, content });
  } catch (err) {
    console.error(`[Split] ${provider} failed:`, err.message);
    res.status(502).json({ success: false, error: `${provider} request failed: ${err.message}` });
  }
});

// ── Provider implementations ──────────────────────────────────────────────────

function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com', port: 443,
      path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VER,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message || 'Claude API error')); return; }
          const text = p.content?.[0]?.text;
          if (!text) { reject(new Error('Empty response from Claude')); return; }
          resolve(text);
        } catch(e) { reject(new Error('Failed to parse Claude response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body); req.end();
  });
}

function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.openai.com', port: 443,
      path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message || 'OpenAI error')); return; }
          resolve(p.choices?.[0]?.message?.content || '');
        } catch(e) { reject(new Error('Failed to parse OpenAI response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('OpenAI timeout')); });
    req.write(body); req.end();
  });
}

function callGemini(prompt) {
  const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    });
    const path = `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com', port: 443,
      path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message || 'Gemini error')); return; }
          resolve(p.candidates?.[0]?.content?.parts?.[0]?.text || '');
        } catch(e) { reject(new Error('Failed to parse Gemini response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Gemini timeout')); });
    req.write(body); req.end();
  });
}

function callMistral(prompt) {
  const apiKey = process.env.Mistral_AI_API_Key || process.env.MISTRAL_API_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'mistral-small-latest',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.mistral.ai', port: 443,
      path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message || 'Mistral error')); return; }
          resolve(p.choices?.[0]?.message?.content || '');
        } catch(e) { reject(new Error('Failed to parse Mistral response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Mistral timeout')); });
    req.write(body); req.end();
  });
}

function callDeepSeek(prompt) {
  const apiKey = process.env.DeepSeek_API_Key || process.env.DEEPSEEK_API_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.deepseek.com', port: 443,
      path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message || 'DeepSeek error')); return; }
          resolve(p.choices?.[0]?.message?.content || '');
        } catch(e) { reject(new Error('Failed to parse DeepSeek response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('DeepSeek timeout')); });
    req.write(body); req.end();
  });
}

function callPerplexity(prompt) {
  const apiKey = process.env.Perplexity_AI_API_Key || process.env.PERPLEXITY_API_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'llama-3.1-sonar-small-128k-online',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.perplexity.ai', port: 443,
      path: '/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message || 'Perplexity error')); return; }
          resolve(p.choices?.[0]?.message?.content || '');
        } catch(e) { reject(new Error('Failed to parse Perplexity response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Perplexity timeout')); });
    req.write(body); req.end();
  });
}

function callGrok(prompt) {
  const apiKey = process.env.Grok_AI_API_Key || process.env.GROK_API_KEY;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'grok-beta',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });
    const req = https.request({
      hostname: 'api.x.ai', port: 443,
      path: '/v1/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message || 'Grok error')); return; }
          resolve(p.choices?.[0]?.message?.content || '');
        } catch(e) { reject(new Error('Failed to parse Grok response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Grok timeout')); });
    req.write(body); req.end();
  });
}

module.exports = router;
