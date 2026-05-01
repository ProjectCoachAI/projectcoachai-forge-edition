'use strict';
/**
 * /api/split — Single-provider query for Forge Perspective panel.
 * Thin wrapper: delegates to /api/compare with a single model.
 * Inherits all API key resolution, rate limiting, and SSE streaming from compare.js.
 */
const express = require('express');
const router  = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');

// ── CORS for extension origin ─────────────────────────────────────────────────
router.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (origin.startsWith('chrome-extension://') ||
      origin.startsWith('moz-extension://') ||
      origin.startsWith('ms-browser-extension://')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Main route — translate split request to compare format ────────────────────
router.post('/', optionalAuth, (req, res, next) => {
  const prompt   = typeof req.body.prompt   === 'string' ? req.body.prompt.trim().slice(0, 4000) : '';
  const provider = typeof req.body.provider === 'string' ? req.body.provider.toLowerCase().trim() : '';

  if (!prompt)   return res.status(400).json({ success: false, error: 'Prompt is required.' });
  if (!provider) return res.status(400).json({ success: false, error: 'Provider is required.' });

  // Rewrite to compare format with single model and quickchat flag
  req.body = { prompt, models: [provider], quickchat: true };

  // Forward to compare router
  const compareRouter = require('./compare');
  compareRouter(req, res, next);
});

module.exports = router;
