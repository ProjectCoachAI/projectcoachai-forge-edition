'use strict';
/**
 * /api/synthesize — 7-mode synthesis via Forge's Claude Haiku key.
 *
 * This endpoint ALWAYS uses Forge's own ANTHROPIC_API_KEY.
 * It is Forge's value-add feature — not the user's subscription.
 * Synthesis count is tracked per-user against their tier limit.
 *
 * POST /api/synthesize
 * Body: { mode, prompt, responses }
 *   mode      — one of: bestof | executive | comprehensive | consensus | divergence | quality | improvement
 *   prompt    — the original user prompt
 *   responses — { claude: { content: '...' }, chatgpt: { content: '...' }, ... }
 */
const express = require('express');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();
const { optionalAuth } = require('../middleware/auth');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

const MODEL  = 'claude-haiku-4-5-20251001';
const API_VER = '2023-06-01';

// ── Synthesis mode definitions ────────────────────────────────────────────────
const MODES = {
  bestof: {
    name: 'Best-of-Best',
    temp: 0.5, tokens: 2000,
    system: 'You are a master synthesis editor. Combine the strongest elements from multiple AI responses into one clear, superior integrated answer. Do not just concatenate — create a new, better response that is concise-first but preserves important nuance.',
    userPrompt: (prompt, responses) =>
      `The user asked: "${prompt}"\n\nSynthesize one integrated answer from these AI responses:\n\n${responses}\n\nInstructions:\n1. Lead with a concise direct answer (2–5 sentences)\n2. Combine the strongest insights across all models\n3. Preserve important caveats without an advisory tone\n4. If models disagree, briefly note the disagreement and synthesize the most reliable conclusion\n5. Create a cohesive, improved final answer`,
  },
  executive: {
    name: 'Executive Summary',
    temp: 0.2, tokens: 1200,
    system: 'You are a synthesis editor specializing in executive communication. Create clear, direct summaries that prioritize direct answers and key insights.',
    userPrompt: (prompt, responses) =>
      `The user asked: "${prompt}"\n\nAI Responses:\n${responses}\n\nCreate a tight executive summary:\n- Direct answer in 1–2 sentences\n- 3–5 key insights as bullet points\n- Note any meaningful disagreements in one line each\n- One-sentence confidence statement`,
  },
  comprehensive: {
    name: 'Comprehensive',
    temp: 0.3, tokens: 2500,
    system: 'You are an expert synthesis analyst. Provide comprehensive, balanced analysis comparing multiple AI perspectives. Be specific, evidence-aware, and neutral.',
    userPrompt: (prompt, responses) =>
      `The user asked: "${prompt}"\n\nAI Responses:\n${responses}\n\nProvide a comprehensive synthesis:\n- Main takeaways (clear bullet points)\n- Neutral synthesis of the most complete combined answer\n- Differences in framing or emphasis among models\n- Open questions that may benefit from further verification`,
  },
  consensus: {
    name: 'Consensus Map',
    temp: 0.2, tokens: 1500,
    system: 'You are a data analyst specializing in finding agreement patterns across information sources. Identify consensus objectively without adding recommendations.',
    userPrompt: (prompt, responses) =>
      `The user asked: "${prompt}"\n\nAI Responses:\n${responses}\n\nAnalyze these responses for consensus:\n1. List all points where 2+ AIs agree (with AI names)\n2. Identify the strongest consensus areas\n3. Note any surprising agreements\n4. List points of genuine disagreement\n5. Estimate overall agreement percentage and explain the score`,
  },
  divergence: {
    name: 'Divergence Spotlight',
    temp: 0.3, tokens: 1500,
    system: 'You are a critical analyst who surfaces hidden differences and disagreements between information sources. Be precise and non-evaluative.',
    userPrompt: (prompt, responses) =>
      `The user asked: "${prompt}"\n\nAI Responses:\n${responses}\n\nSpotlight divergence:\n1. List every point where AIs meaningfully differ\n2. Categorize differences: factual, framing, emphasis, or recommendation\n3. Identify which AI is the outlier in each case and why that might be\n4. Highlight the most significant disagreement and its implications for the user\n5. Note any places where one model is likely more reliable based on the question type`,
  },
  quality: {
    name: 'Quality Scorecard',
    temp: 0.2, tokens: 1800,
    system: 'You are an AI response quality evaluator. Score responses objectively across defined dimensions. Use a consistent, evidence-based scoring rubric.',
    userPrompt: (prompt, responses) =>
      `The user asked: "${prompt}"\n\nAI Responses:\n${responses}\n\nScore each response (1–10) on these dimensions:\n1. Structural Clarity — logical, easy-to-follow structure\n2. Perspective Diversity — breadth and variety of viewpoints offered\n3. Evidence Confidence — use of facts, examples, and avoidance of speculation\n4. Guidance Signal — actionability and decision-relevance for the user\n\nFormat: For each AI, show the 4 scores as a table row. Then provide an overall ranking with one-sentence justification per model.`,
  },
  improvement: {
    name: 'Improvement Report',
    temp: 0.4, tokens: 2000,
    system: 'You are an AI writing coach. Analyse responses and provide specific, constructive suggestions to improve each one. Be concrete, not vague.',
    userPrompt: (prompt, responses) =>
      `The user asked: "${prompt}"\n\nAI Responses:\n${responses}\n\nFor each AI response:\n1. Identify 2–3 specific strengths (with brief examples from the text)\n2. Identify 2–3 specific weaknesses or gaps\n3. Write an improved version of the response\'s opening that addresses the main weakness\n4. Rate improvement potential (Low / Medium / High)\n\nEnd with: the single clearest improvement any AI could make across all responses.`,
  },
};

const VALID_MODES = Object.keys(MODES);

// ── Tier limits ───────────────────────────────────────────────────────────────
const TIER_MONTHLY = {
  starter: 30, lite: 100, creator: 100, pro: 300, professional: 300,
  team: Infinity, enterprise: Infinity,
};

function readUsers()         { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '{}'); } catch (_) { return {}; } }
function writeUsers(u)       { const t = `${USERS_FILE}.tmp`; fs.writeFileSync(t, JSON.stringify(u, null, 2)); fs.renameSync(t, USERS_FILE); }
function yearMonth()         { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function checkAndIncrementUsage(userEmail) {
  if (!userEmail) return { allowed: true, used: 0, limit: 30 };
  const users = readUsers();
  const user  = users[userEmail];
  if (!user) return { allowed: true, used: 0, limit: 30 };

  const tier  = user.tier || 'starter';
  const limit = TIER_MONTHLY[tier] || 30;
  const ym    = yearMonth();

  if (!user.synthesisUsage) user.synthesisUsage = {};
  if (!user.synthesisUsage[ym]) user.synthesisUsage[ym] = { used: 0, entries: [] };

  const used = user.synthesisUsage[ym].used;
  if (limit !== Infinity && used >= limit) {
    return { allowed: false, used, limit };
  }

  user.synthesisUsage[ym].used++;
  user.synthesisUsage[ym].entries.push(new Date().toISOString());
  users[userEmail] = user;
  writeUsers(users);
  return { allowed: true, used: user.synthesisUsage[ym].used, limit };
}

// ── POST /api/synthesize ─────────────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  const { mode, prompt, responses } = req.body;

  if (!mode || !VALID_MODES.includes(mode)) {
    return res.status(400).json({ success: false, error: `Invalid mode. Use one of: ${VALID_MODES.join(', ')}` });
  }
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ success: false, error: 'Prompt is required.' });
  }
  if (!responses || typeof responses !== 'object') {
    return res.status(400).json({ success: false, error: 'Responses object is required.' });
  }

  const forgeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!forgeKey) {
    return res.status(503).json({ success: false, error: 'Synthesis service is temporarily unavailable. Contact support.' });
  }

  // Check usage limits for authenticated users
  if (req.userEmail) {
    const usage = checkAndIncrementUsage(req.userEmail);
    if (!usage.allowed) {
      return res.status(429).json({
        success: false,
        error: `Monthly synthesis limit reached (${usage.limit}/${usage.limit}). Upgrade for more.`,
        used: usage.used, limit: usage.limit,
      });
    }
  }

  // Format responses for the prompt
  const responseText = Object.entries(responses)
    .filter(([, v]) => v?.content)
    .map(([provider, v]) => `[${provider.toUpperCase()}]\n${v.content}`)
    .join('\n\n---\n\n');

  if (!responseText.trim()) {
    return res.status(400).json({ success: false, error: 'No valid responses to synthesize.' });
  }

  const modeConf = MODES[mode];
  const userMsg  = modeConf.userPrompt(String(prompt), responseText);

  console.log(`✦ [Synthesize] mode=${mode} | ${Object.keys(responses).filter(k => responses[k]?.content).join(',')} | user=${req.userEmail || 'anon'} | auth_header=${req.headers['authorization'] ? 'present' : 'MISSING'}`);

  try {
    const content = await callClaude(forgeKey, modeConf.system, userMsg, modeConf.temp, modeConf.tokens);
    res.json({ success: true, mode, modeName: modeConf.name, content, prompt });
  } catch (err) {
    console.error(`✦ [Synthesize] FAILED mode=${mode}:`, err.message);
    res.status(502).json({ success: false, error: `Synthesis failed: ${err.message}` });
  }
});

// ── GET /api/synthesize/modes ────────────────────────────────────────────────
// Let the frontend know which modes are available and their metadata
router.get('/modes', (req, res) => {
  const modes = Object.entries(MODES).map(([id, m]) => ({
    id, name: m.name,
  }));
  res.json({ success: true, modes });
});

// ── Claude API call ───────────────────────────────────────────────────────────
function callClaude(apiKey, system, userMessage, temperature = 0.3, maxTokens = 2000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      port:     443,
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': API_VER,
        'Content-Length':    Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) { reject(new Error(parsed.error.message || 'Claude API error')); return; }
          const text = parsed.content?.[0]?.text;
          if (!text) { reject(new Error('Empty response from Claude')); return; }
          resolve(text);
        } catch (e) { reject(new Error('Failed to parse Claude response')); }
      });
    });

    req.on('error', err  => reject(err));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body);
    req.end();
  });
}

module.exports = router;
