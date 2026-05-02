'use strict';
/**
 * /api/split — Forge Perspective panel endpoint.
 * No auth required — extension panel cannot send tokens.
 * Protected by Railway rate limiter and Cloudflare WAF.
 */
const express = require('express');
const router  = express.Router();

// ── CORS for extension origin ─────────────────────────────────────────────────
router.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (!origin || origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://') ||
      origin.startsWith('ms-browser-extension://') ||
      origin.startsWith('https://forge-app-1u9.pages.dev') ||
      origin.startsWith('https://projectcoachai.com')) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const VALID_PROVIDERS = ['claude','chatgpt','gemini','mistral','deepseek','perplexity','grok'];

const forgeKeys = () => ({
  claude:     process.env.ANTHROPIC_API_KEY  || process.env.CLAUDE_API_KEY,
  chatgpt:    process.env.OPENAI_API_KEY,
  gemini:     process.env.GOOGLE_AI_API_KEY  || process.env.GOOGLE_API_KEY,
  mistral:    process.env.Mistral_AI_API_Key  || process.env.MISTRAL_API_KEY,
  deepseek:   process.env.DeepSeek_API_Key   || process.env.DEEPSEEK_API_KEY,
  perplexity: process.env.Perplexity_AI_API_Key || process.env.PERPLEXITY_API_KEY,
  grok:       process.env.Grok_AI_API_Key    || process.env.GROK_API_KEY,
});

router.post('/', async (req, res) => {
  const prompt   = typeof req.body.prompt   === 'string' ? req.body.prompt.trim().slice(0, 4000) : '';
  const provider = typeof req.body.provider === 'string' ? req.body.provider.toLowerCase().trim() : '';

  if (!prompt)   return res.status(400).json({ success: false, error: 'Prompt is required.' });
  if (!provider || !VALID_PROVIDERS.includes(provider))
    return res.status(400).json({ success: false, error: `Invalid provider.` });

  const keys = forgeKeys();
  const apiKey = keys[provider];
  if (!apiKey) return res.status(503).json({ success: false, error: `${provider} API key not configured.` });

  console.log(`[Split] provider=${provider} | prompt="${prompt.slice(0, 60)}"`);

  try {
    const content = await callProvider(provider, prompt, apiKey);
    res.json({ success: true, provider, content });
  } catch (err) {
    console.error(`[Split] ${provider} failed:`, err.message);
    res.status(502).json({ success: false, error: err.message });
  }
});

const https = require('https');

function post(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({ hostname, port: 443, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data); req.end();
  });
}

async function callProvider(provider, prompt, apiKey) {
  let data;
  if (provider === 'claude') {
    data = await post('api.anthropic.com', '/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model: 'claude-haiku-4-5-20251001', max_tokens: 2048, messages: [{ role: 'user', content: prompt }] });
    if (data.error) throw new Error(data.error.message);
    return data.content?.[0]?.text || '';
  }
  if (provider === 'gemini') {
    data = await post('generativelanguage.googleapis.com',
      `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {},
      { contents: [{ parts: [{ text: prompt }] }] });
    if (data.error) throw new Error(data.error.message);
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  // OpenAI-compatible: chatgpt, mistral, deepseek, perplexity, grok
  const HOSTS = { chatgpt: 'api.openai.com', mistral: 'api.mistral.ai',
    deepseek: 'api.deepseek.com', perplexity: 'api.perplexity.ai', grok: 'api.x.ai' };
  const PATHS = { chatgpt: '/v1/chat/completions', mistral: '/v1/chat/completions',
    deepseek: '/v1/chat/completions', perplexity: '/chat/completions', grok: '/v1/chat/completions' };
  const MODELS = { chatgpt: 'gpt-4o-mini', mistral: 'mistral-small-latest',
    deepseek: 'deepseek-chat', perplexity: 'sonar', grok: 'grok-3-fast' };
  data = await post(HOSTS[provider], PATHS[provider],
    { 'Authorization': `Bearer ${apiKey}` },
    { model: MODELS[provider], max_tokens: 2048, messages: [{ role: 'user', content: prompt }] });
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content || '';
}

module.exports = router;
