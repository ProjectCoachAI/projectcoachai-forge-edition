'use strict';
const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../lib/db');

// Provider cost per 1K tokens (approximate, update as pricing changes)
// Verified 2026-09-06 against current pricing trackers, matched against
// the EXACT model strings actually used in compare.js — not just
// whatever a provider's newest-generation model costs today, since
// several providers (Grok, DeepSeek, Gemini) have already moved on to
// newer model families this codebase doesn't use yet.
const PROVIDER_COSTS = {
  // claude-sonnet-5 (compare.js's callClaudeAPI) — standard rate as of
  // Sep 1, 2026, confirmed directly against Anthropic's own pricing.
  claude:      { input: 0.003,  output: 0.015,  name: 'Claude (Anthropic)' },
  // Mixed model in practice — gpt-4o-mini (no attachments, the common
  // case) at $0.15/$0.60, gpt-4o (with attachments) at $2.50/$10.00.
  // Genuinely can't be one accurate blended number without also
  // tracking which specific model served each call (this table has no
  // per-model granularity, only per-provider) — using gpt-4o-mini's
  // rate here since it's the common case, likely undercounting actual
  // cost on attachment-heavy days. Worth revisiting if attachment
  // volume ever becomes significant.
  chatgpt:     { input: 0.00015, output: 0.0006, name: 'ChatGPT (OpenAI)' },
  // gemini-2.5-flash — third-party tracker data, not fetched directly
  // from Google's own pricing page; flagged as the least-certain figure
  // in this table.
  gemini:      { input: 0.00015,output: 0.00125,name: 'Gemini (Google)' },
  // mistral-small-latest (an alias — resolves to whatever Mistral
  // currently calls their "small" tier), reasonably consistent across
  // multiple current sources.
  mistral:     { input: 0.00015,output: 0.0006, name: 'Mistral AI' },
  // deepseek-chat — this one already closely matched current tracker
  // data, left effectively unchanged.
  deepseek:    { input: 0.00014,output: 0.00028,name: 'DeepSeek' },
  // sonar (Perplexity) — could not find a verified, current, model-
  // specific rate distinct from Perplexity's newer Sonar Pro tier;
  // left at its prior value, flagged as unverified rather than
  // silently kept without comment.
  perplexity:  { input: 0.001,  output: 0.001,  name: 'Perplexity AI (unverified)' },
  // grok-3-fast — pricing trackers found only cover newer Grok 4.x
  // models this codebase doesn't use; left at its prior value rather
  // than substituting a different model generation's real rate under
  // this one's name.
  grok:        { input: 0.005,  output: 0.015,  name: 'Grok (xAI) (unverified)' },
  // llama-3.3-70b-versatile via Groq — left at its prior value,
  // plausible for Groq's known aggressive Llama-hosting pricing but
  // not independently re-verified this pass.
  meta:        { input: 0.00018,output: 0.00018,name: 'Meta AI (unverified)' },
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

    // Diary/Continue Conversation's own real cost — genuinely different
    // in kind from the Compare numbers above, not just a different
    // source: these are REAL, measured token counts captured directly
    // from each provider's own API response (via diary_chat_usage,
    // logged in chat.js's own callWithFallback), not an average-based
    // estimate multiplied by a call count. Kept as its own separate
    // section rather than merged into providerCosts above, so this
    // real/estimated distinction stays visible rather than silently
    // blended into one number.
    const diaryR = await db.query(
      `SELECT provider, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as calls
       FROM diary_chat_usage WHERE created_at >= $1 GROUP BY provider`,
      [since]
    );
    const diaryProviderCosts = diaryR.rows.map((row) => {
      const p = PROVIDER_COSTS[row.provider];
      const inputTokens = parseInt(row.total_input || 0);
      const outputTokens = parseInt(row.total_output || 0);
      const cost = p ? (inputTokens / 1000) * p.input + (outputTokens / 1000) * p.output : 0;
      return {
        id: row.provider,
        name: (p && p.name) || row.provider,
        calls: parseInt(row.calls || 0),
        inputTokens, outputTokens,
        cost: parseFloat(cost.toFixed(4))
      };
    });
    const totalDiaryCost = diaryProviderCosts.reduce((s, p) => s + p.cost, 0);
    const totalDiaryCalls = diaryProviderCosts.reduce((s, p) => s + p.calls, 0);

    // Recent provider errors — deliberately a fixed, recent (last 24h)
    // window regardless of the selected period above, since the whole
    // point of surfacing these is "is something actively broken right
    // now," not a historical error count over a full month/year. Uses
    // DISTINCT ON to get each provider's own MOST RECENT error message
    // specifically (not just a count) — seeing "temperature is
    // deprecated for this model" directly is what actually would have
    // made today's real issue immediately actionable, rather than just
    // a number prompting someone to go dig through Railway logs anyway.
    const errorsR = await db.query(
      `SELECT DISTINCT ON (provider) provider, error_message, created_at,
              (SELECT COUNT(*) FROM diary_chat_errors e2 WHERE e2.provider = e1.provider AND e2.created_at >= NOW() - INTERVAL '24 hours') as count
       FROM diary_chat_errors e1
       WHERE created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY provider, created_at DESC`
    );
    const recentErrors = errorsR.rows.map(row => ({
      id: row.provider,
      name: (PROVIDER_COSTS[row.provider] && PROVIDER_COSTS[row.provider].name) || row.provider,
      count: parseInt(row.count || 0),
      lastError: row.error_message,
      lastErrorAt: row.created_at
    }));

    res.json({
      ok: true,
      period,
      totalSynths,
      totalApiCost: parseFloat(totalApiCost.toFixed(2)),
      infraCost,
      totalCost: parseFloat((totalApiCost + infraCost + totalDiaryCost).toFixed(2)),
      costPerSynth: parseFloat(costPerSynth.toFixed(4)),
      providers: providerCosts.sort((a,b) => b.cost - a.cost),
      diary: {
        totalCalls: totalDiaryCalls,
        totalCost: parseFloat(totalDiaryCost.toFixed(4)),
        providers: diaryProviderCosts.sort((a,b) => b.cost - a.cost)
      },
      recentErrors: recentErrors.sort((a,b) => b.count - a.count)
    });
  } catch(e) {
    console.error('[Costs]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
