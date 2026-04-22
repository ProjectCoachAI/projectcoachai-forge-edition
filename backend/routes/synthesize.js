'use strict';
// Input sanitization
const clean = (s, max=1000) => typeof s === 'string' ? s.trim().slice(0, max) : '';
const express = require('express');
const https   = require('https');
const router  = express.Router();
const db      = require('../lib/db');
const { optionalAuth } = require('../middleware/auth');

const MODEL   = 'claude-haiku-4-5-20251001';
const API_VER = '2023-06-01';

const MODES = {
  bestof: {
    name:'Best-of-Best', temp:0.5, tokens:2000,
    system:'You are a master synthesis editor. Combine the strongest elements from multiple AI responses into one clear, superior integrated answer. Do not just concatenate — create a new, better response that is concise-first but preserves important nuance.',
    userPrompt:(p,r)=>`The user asked: "${p}"\n\nSynthesize one integrated answer from these AI responses:\n\n${r}\n\nInstructions:\n1. Lead with a concise direct answer (2–5 sentences)\n2. Combine the strongest insights across all models\n3. Preserve important caveats without an advisory tone\n4. If models disagree, briefly note the disagreement and synthesize the most reliable conclusion\n5. Create a cohesive, improved final answer`,
  },
  executive: {
    name:'Executive Summary', temp:0.2, tokens:1200,
    system:'You are a synthesis editor specializing in executive communication. Create clear, direct summaries that prioritize direct answers and key insights.',
    userPrompt:(p,r)=>`The user asked: "${p}"\n\nAI Responses:\n${r}\n\nCreate a tight executive summary:\n- Direct answer in 1–2 sentences\n- 3–5 key insights as bullet points\n- Note any meaningful disagreements in one line each\n- One-sentence confidence statement`,
  },
  comprehensive: {
    name:'Comprehensive', temp:0.3, tokens:2500,
    system:'You are an expert synthesis analyst. Provide comprehensive, balanced analysis comparing multiple AI perspectives.',
    userPrompt:(p,r)=>`The user asked: "${p}"\n\nAI Responses:\n${r}\n\nProvide a comprehensive synthesis:\n- Main takeaways\n- Neutral synthesis of the most complete combined answer\n- Differences in framing or emphasis among models\n- Open questions`,
  },
  consensus: {
    name:'Consensus Map', temp:0.2, tokens:1500,
    system:'You are a data analyst specializing in finding agreement patterns across information sources.',
    userPrompt:(p,r)=>`The user asked: "${p}"\n\nAI Responses:\n${r}\n\nAnalyze for consensus:\n1. Points where 2+ AIs agree\n2. Strongest consensus areas\n3. Points of genuine disagreement\n4. Overall agreement percentage`,
  },
  divergence: {
    name:'Divergence Spotlight', temp:0.3, tokens:1500,
    system:'You are a critical analyst who surfaces hidden differences and disagreements between information sources.',
    userPrompt:(p,r)=>`The user asked: "${p}"\n\nAI Responses:\n${r}\n\nSpotlight divergence:\n1. Every point where AIs meaningfully differ\n2. Categorize differences: factual, framing, emphasis, recommendation\n3. Identify outliers and why\n4. Most significant disagreement and its implications`,
  },
  quality: {
    name:'Quality Scorecard', temp:0.2, tokens:1800,
    system:'You are an AI response quality evaluator. Score responses objectively across defined dimensions.',
    userPrompt:(p,r)=>`The user asked: "${p}"\n\nAI Responses:\n${r}\n\nScore each response (1–10) on:\n1. Structural Clarity\n2. Perspective Diversity\n3. Evidence Confidence\n4. Guidance Signal\n\nFormat as a table row per AI, then overall ranking with justification.`,
  },
  improvement: {
    name:'Improvement Report', temp:0.4, tokens:2000,
    system:'You are an AI writing coach. Analyse responses and provide specific, constructive suggestions.',
    userPrompt:(p,r)=>`The user asked: "${p}"\n\nAI Responses:\n${r}\n\nFor each AI response:\n1. 2–3 specific strengths\n2. 2–3 specific weaknesses\n3. Improved opening addressing the main weakness\n4. Improvement potential (Low/Medium/High)\n\nEnd with the single clearest improvement any AI could make.`,
  },
};

const VALID_MODES = Object.keys(MODES);

router.post('/', optionalAuth, async (req, res) => {
  const { mode, prompt, responses } = req.body;
  if (!mode || !VALID_MODES.includes(mode)) return res.status(400).json({ success:false, error:`Invalid mode. Use: ${VALID_MODES.join(', ')}` });
  if (!prompt || !String(prompt).trim()) return res.status(400).json({ success:false, error:'Prompt is required.' });
  if (!responses || typeof responses !== 'object') return res.status(400).json({ success:false, error:'Responses object is required.' });

  const forgeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!forgeKey) return res.status(503).json({ success:false, error:'Synthesis service temporarily unavailable.' });

  // Check usage limits
  if (req.userEmail) {
    const usage = await db.checkAndIncrementUsage(req.userEmail);
    if (!usage.allowed) return res.status(429).json({ success:false, error:`Monthly synthesis limit reached (${usage.limit}/${usage.limit}). Upgrade for more.`, used:usage.used, limit:usage.limit });
  }

  const responseText = Object.entries(responses)
    .filter(([,v]) => v?.content)
    .map(([p,v]) => `[${p.toUpperCase()}]\n${v.content}`)
    .join('\n\n---\n\n');
  if (!responseText.trim()) return res.status(400).json({ success:false, error:'No valid responses to synthesize.' });

  const modeConf = MODES[mode];
  console.log(`✦ [Synthesize] mode=${mode} | ${Object.keys(responses).filter(k=>responses[k]?.content).join(',')} | user=${req.userEmail||'anon'} | auth_header=${req.headers['authorization']?'present':'MISSING'}`);

  try {
    const content = await callClaude(forgeKey, modeConf.system, modeConf.userPrompt(String(prompt), responseText), modeConf.temp, modeConf.tokens);
    // Store synthesis result
    if (req.userEmail) {
      try {
        const ym = new Date().toISOString().slice(0,7);
        const entry = { id: Date.now(), mode, modeName: modeConf.name, prompt: String(prompt).slice(0,200), content: content.slice(0,10000), createdAt: new Date().toISOString() };
        // First ensure row exists
        await db.query(`
          INSERT INTO synthesis_usage (user_email, year_month, used, entries)
          VALUES ($1, $2, 1, '[]'::jsonb)
          ON CONFLICT (user_email, year_month) DO UPDATE
          SET used = synthesis_usage.used + 1
        `, [req.userEmail, ym]);
        // Then append entry to array
        await db.query(`
          UPDATE synthesis_usage
          SET entries = entries || $3::jsonb
          WHERE user_email = $1 AND year_month = $2
        `, [req.userEmail, ym, JSON.stringify([entry])]);
      } catch(e) { console.error('[Synthesize] save failed:', e.message); }
    }
    res.json({ success:true, mode, modeName:modeConf.name, content, prompt });
  } catch (err) {
    console.error(`✦ [Synthesize] FAILED mode=${mode}:`, err.message);
    res.status(502).json({ success:false, error:`Synthesis failed: ${err.message}` });
  }
});

const { requireAuth } = require('../middleware/auth');

router.get('/history', requireAuth, async (req, res) => {
  try {
    const ym = new Date().toISOString().slice(0,7);
    const result = await db.query(
      'SELECT entries, used FROM synthesis_usage WHERE user_email=$1 ORDER BY year_month DESC LIMIT 6',
      [req.userEmail]
    );
    const entries = result.rows
      .flatMap(r => Array.isArray(r.entries) ? r.entries : [])
      .filter(e => e && e.modeName && e.prompt && e.createdAt)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);
    const total = result.rows.reduce((s,r) => s + (r.used||0), 0);
    res.json({ success:true, entries, total });
  } catch(e) {
    res.status(500).json({ success:false, error: e.message });
  }
});

router.get('/modes', (req, res) => {
  res.json({ success:true, modes:Object.entries(MODES).map(([id,m])=>({ id, name:m.name })) });
});

function callClaude(apiKey, system, userMessage, temperature=0.3, maxTokens=2000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model:MODEL, max_tokens:maxTokens, temperature, system, messages:[{role:'user',content:userMessage}] });
    const req  = https.request({
      hostname:'api.anthropic.com', port:443, path:'/v1/messages', method:'POST',
      headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':API_VER,'Content-Length':Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data+=c);
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.error) { reject(new Error(p.error.message||'Claude API error')); return; }
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


router.post('/save-forge', requireAuth, async (req, res) => {
  try {
    const { id, prompt, content, providers, createdAt } = req.body;
    const entry = JSON.stringify({ id: id||Date.now(), prompt: (prompt||'').slice(0,200), content: (content||'').slice(0,10000), providers, createdAt: createdAt||new Date().toISOString() });
    const ym = new Date().toISOString().slice(0,7);
    await db.query(`
      INSERT INTO synthesis_usage (user_email, year_month, used, entries)
      VALUES ($1, $2, 0, '[]'::jsonb)
      ON CONFLICT (user_email, year_month) DO NOTHING
    `, [req.userEmail, ym]);
    await db.query(`
      UPDATE synthesis_usage SET entries = entries || $3::jsonb
      WHERE user_email = $1 AND year_month = $2
    `, [req.userEmail, ym, JSON.stringify([JSON.parse(entry)])]);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
module.exports = router;
