'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../lib/db');

// Provider cost per 1K tokens (approximate, update as pricing changes)
const PROVIDER_COSTS = {
  claude:      { input: 0.003,  output: 0.015,  name: 'Claude (Anthropic)' },
  chatgpt:     { input: 0.005,  output: 0.015,  name: 'ChatGPT (OpenAI)' },
  gemini:      { input: 0.00025,output: 0.0005, name: 'Gemini (Google)' },
  mistral:     { input: 0.002,  output: 0.006,  name: 'Mistral AI' },
  deepseek:    { input: 0.00014,output: 0.00028,name: 'DeepSeek' },
  perplexity:  { input: 0.001,  output: 0.001,  name: 'Perplexity AI' },
  grok:        { input: 0.005,  output: 0.015,  name: 'Grok (xAI)' },
  meta:        { input: 0.00018,output: 0.00018,name: 'Meta AI' },
};

// Avg tokens per synthesis (estimated)
const AVG_INPUT_TOKENS  = 500;
const AVG_OUTPUT_TOKENS = 800;

// GET /api/costs/summary
router.get('/summary', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Get synthesis counts per provider from usage data
    const period = req.query.period || 'month';
    const now = new Date();
    let since;
    switch(period) {
      case 'day':   since = new Date(now - 24*60*60*1000); break;
      case 'week':  since = new Date(now - 7*24*60*60*1000); break;
      case 'year':  since = new Date(now.getFullYear(), 0, 1); break;
      default:      since = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get total syntheses from synthesis_usage table
    const r = await db.query(
      `SELECT SUM(used) as total FROM synthesis_usage WHERE year_month >= $1`,
      [since.toISOString().slice(0,7)]
    );
    const totalSynths = parseInt(r.rows[0]?.total || 0);

    // Calculate costs per provider
    const providerCosts = Object.entries(PROVIDER_COSTS).map(([id, p]) => {
      const inputCost  = (AVG_INPUT_TOKENS  / 1000) * p.input  * totalSynths;
      const outputCost = (AVG_OUTPUT_TOKENS / 1000) * p.output * totalSynths;
      const total = inputCost + outputCost;
      return { id, name: p.name, cost: parseFloat(total.toFixed(4)) };
    });

    const totalApiCost = providerCosts.reduce((s, p) => s + p.cost, 0);
    const infraCost = period === 'month' ? 15.00 : period === 'year' ? 180.00 : period === 'week' ? 3.46 : 0.49;
    const costPerSynth = totalSynths > 0 ? totalApiCost / totalSynths : 0;

    res.json({
      ok: true,
      period,
      totalSynths,
      totalApiCost: parseFloat(totalApiCost.toFixed(2)),
      infraCost,
      totalCost: parseFloat((totalApiCost + infraCost).toFixed(2)),
      costPerSynth: parseFloat(costPerSynth.toFixed(4)),
      providers: providerCosts.sort((a,b) => b.cost - a.cost)
    });
  } catch(e) {
    console.error('[Costs]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
