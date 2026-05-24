'use strict';
const { findRelevantModules, buildInjectionPrompt } = require('./knowledge');
const { injectRealtimeContext } = require('../lib/forge-realtime-injector');

const LANGUAGE_INSTRUCTIONS = {
  'en': '',
  'de': 'Bitte antworte auf Deutsch. Verwende klare, präzise und professionelle Sprache.',
  'fr': 'Veuillez répondre en français. Utilisez un langage clair, précis et professionnel.',
  'it': 'Si prega di rispondere in italiano. Usa un linguaggio chiaro, preciso e professionale.',
};
// Input sanitization
const clean = (s, max=1000) => typeof s === 'string' ? s.trim().slice(0, max) : '';
const express = require('express');
const https   = require('https');
const router  = express.Router();
const db      = require('../lib/db');
const { optionalAuth, requireAuth } = require('../middleware/auth');

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

router.post('/', requireAuth, async (req, res) => {
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
    db.updateStreak(req.userEmail).catch(()=>{});
  }

  const responseText = Object.entries(responses)
    .filter(([,v]) => v?.content)
    .map(([p,v]) => `[${p.toUpperCase()}]\n${v.content}`)
    .join('\n\n---\n\n');
  if (!responseText.trim()) return res.status(400).json({ success:false, error:'No valid responses to synthesize.' });

  // RAG: inject relevant knowledge modules
  let knowledgeInjection = '';
  try {
    const modules = await findRelevantModules(String(prompt));
    if (modules.length) {
      knowledgeInjection = buildInjectionPrompt(modules);
      console.log(`✦ [Knowledge] Injecting modules: ${modules.map(m => m.module_id).join(', ')}`);
    }
  } catch(e) { console.warn('[Knowledge] injection failed:', e.message); }

  // Language preference
  const user = await db.getUser(req.userEmail).catch(() => null);
  const lang = req.body.language || user?.preferred_language || 'en';
  const langInstruction = LANGUAGE_INSTRUCTIONS[lang] || '';

  // Synthesis mode from ForgeSynthesisMode component (Ansh request)
  const SYNTH_MODE_INSTRUCTIONS = {
    'best-answer':   '',
    'board-memo':    'Synthesise as a structured board memo with four sections: Executive Summary (2-3 sentences), Key Findings (3-5 bullet points), Recommendation (one clear recommendation), and Risks (2-3 key risks). Use formal professional language.',
    'bullet-points': 'Synthesise as a concise bulleted list. Maximum 7 bullets. Order by importance — most important first. Each bullet one to two sentences. No introduction, no conclusion — bullets only.',
    'pros-cons':     'Synthesise as a structured pros and cons analysis. List the strongest arguments FOR and AGAINST clearly. End with a verdict that weighs the balance and gives a clear directional recommendation. Label sections: Pros, Cons, Verdict.',
    'action-plan':   'Synthesise as a numbered action plan. Focus entirely on what should be done. Each action specific, concrete, and sequenced logically. Active verbs. No preamble.',
    'formal-report': 'Synthesise as a formal report with sections: Background (context and question), Analysis (key themes), Findings (what the evidence shows), and Recommendation (clear justified conclusion). Formal complete sentences throughout.',
    'custom':        req.body.customInstruction || '',
  };
  const synthMode = req.body.synthesisMode || 'best-answer';
  const synthModeInstruction = SYNTH_MODE_INSTRUCTIONS[synthMode] || '';

  // Real-time data injection — Layer 3
  const realtimeSystemPrompt = await injectRealtimeContext(String(prompt), '');

  const modeConf = MODES[mode];
  console.log(`✦ [Synthesize] mode=${mode} | ${Object.keys(responses).filter(k=>responses[k]?.content).join(',')} | user=${req.userEmail||'anon'} | auth_header=${req.headers['authorization']?'present':'MISSING'}`);

  try {
    // Try Claude with retry, fall back to GPT-4 if overloaded
    let content;
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        content = await callClaude(forgeKey, modeConf.system, modeConf.userPrompt(String(prompt), realtimeSystemPrompt + responseText + knowledgeInjection + (langInstruction ? '\n\n' + langInstruction : '') + (synthModeInstruction ? '\n\n' + synthModeInstruction : '')), modeConf.temp, modeConf.tokens);
        break;
      } catch(retryErr) {
        lastErr = retryErr;
        if (retryErr.message?.includes('Overloaded') || retryErr.message?.includes('529') || retryErr.message?.includes('overloaded')) {
          console.warn(`✦ [Synthesize] Claude overloaded — attempt ${attempt}/3, waiting ${attempt * 2}s`);
          if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
        } else {
          throw retryErr; // Non-overload error — fail fast
        }
      }
    }
    // If all Claude attempts failed, try GPT-4 fallback
    if (!content) {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        console.warn('✦ [Synthesize] Falling back to GPT-4 after Claude overload');
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + openaiKey },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              { role: 'system', content: modeConf.system },
              { role: 'user', content: modeConf.userPrompt(String(prompt), realtimeSystemPrompt + responseText + knowledgeInjection + (langInstruction ? '\n\n' + langInstruction : '') + (synthModeInstruction ? '\n\n' + synthModeInstruction : '')) }
            ],
            max_tokens: modeConf.tokens || 1500,
            temperature: modeConf.temp || 0.7
          })
        });
        const data = await resp.json();
        content = data.choices?.[0]?.message?.content;
        if (!content) throw new Error(lastErr?.message || 'Synthesis unavailable');
        console.log('✦ [Synthesize] GPT-4 fallback successful');
        // Log fallback usage
        try {
          await db.query(
            `INSERT INTO synthesis_logs(user_email, question_length, response_tokens, primary_provider, fallback_used, fallback_provider, mode)
             VALUES($1,$2,$3,'claude',true,'gpt-4o',$4)`,
            [req.userEmail, String(prompt).length, content?.length || 0, mode]
          );
        } catch(le) { console.warn('[SynthLog] fallback log failed:', le.message); }
      } else {
        throw lastErr || new Error('Synthesis service overloaded — please try again in a moment');
      }
    }
    // Store synthesis result
    if (req.userEmail) {
      try {
        const ym = new Date().toISOString().slice(0,7);
        const entry = { id: Date.now(), mode, modeName: modeConf.name, prompt: String(prompt).slice(0,200), content: content.slice(0,10000), createdAt: new Date().toISOString() };
        // First ensure row exists
        await db.query(`
          INSERT INTO synthesis_usage (user_email, year_month, used, entries)
          VALUES ($1, $2, 0, '[]'::jsonb)
          ON CONFLICT (user_email, year_month) DO NOTHING
        `, [req.userEmail, ym]);
        // Then append entry to array
        await db.query(`
          UPDATE synthesis_usage
          SET entries = entries || $3::jsonb
          WHERE user_email = $1 AND year_month = $2
        `, [req.userEmail, ym, JSON.stringify([entry])]);
      } catch(e) { console.error('[Synthesize] save failed:', e.message); }
    }
    // Auto-nominate to knowledge engine if quality threshold met
    if (content && content.length > 800 && req.userEmail) {
      try {
        await db.query(
          `INSERT INTO knowledge_candidates(synthesis_id, user_email, proposed_title, proposed_content, proposed_keywords, status)
           VALUES($1,$2,$3,$4,$5,'pending')
           ON CONFLICT DO NOTHING`,
          [
            Date.now().toString(),
            req.userEmail,
            String(prompt).slice(0, 100),
            content.slice(0, 5000),
            [mode]
          ]
        );
        console.log(`✦ [Knowledge] Auto-nominated synthesis from ${req.userEmail}`);
      } catch(e) { console.warn('[Knowledge] auto-nomination failed:', e.message); }
    }

    res.json({ success:true, mode, modeName:modeConf.name, content, prompt });
  } catch (err) {
    console.error(`✦ [Synthesize] FAILED mode=${mode}:`, err.message);
    res.status(502).json({ success:false, error:`Synthesis failed: ${err.message}` });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const ym = new Date().toISOString().slice(0,7);
    const result = await db.query(
      'SELECT entries, used FROM synthesis_usage WHERE user_email=$1 ORDER BY year_month DESC LIMIT 6',
      [req.userEmail]
    );
    const entries = result.rows
      .flatMap(r => Array.isArray(r.entries) ? r.entries : [])
      .filter(e => e && (e.prompt || e.content) && e.createdAt)
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

function callClaude(apiKey, system, userMessage, temperature=0.3, maxTokens=4096) {
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
