'use strict';
const { findRelevantModules, buildInjectionPrompt } = require('./knowledge');
const { injectRealtimeContext } = require('../lib/forge-realtime-injector');

const LANGUAGE_INSTRUCTIONS = {
  'en': '',
  'de': 'Bitte antworte auf Deutsch. Verwende klare, präzise und professionelle Sprache.',
  'fr': 'Veuillez répondre en français. Utilisez un langage clair, précis et professionnel.',
  'it': 'Si prega di rispondere in italiano. Usa un linguaggio chiaro, preciso e professionale.',
};
const express = require('express');
const https = require('https');
const db = require('../lib/db');
const router = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');

const MODEL = 'claude-sonnet-4-20250514';
const API_VER = '2023-06-01';

const ANALYST_CTX = 'The user has provided analyst context. Read the ANALYST CONTEXT section carefully and incorporate it into your analysis. IMPORTANT PRINCIPLES: (1) Never name individual people in a critical, accusatory, or risk-related context. Reference patterns and data only. (2) Never make operational decisions or directives. Present findings; the user decides. (3) When farmers or end users appear frequently in corrupted records, they are affected parties — victims of system failures, not causes. Never label high record counts next to a name as a concern or anomaly. (4) When a single person created all records, note it neutrally as centralised processing — never flag it as suspicious. (5) Never recommend investigating a named individual. Recommend investigating processes, dates, and system parameters instead. (6) Never narrate your own guidelines or constraints in the output — just apply them silently.';

const EXCEL_MODES = {
  best:       { name:'Best Answer',       system:'You are a world-class data analyst. Provide the single best answer. Be specific, reference actual data values. When individuals appear frequently in problematic records, treat them as affected by system failures — never as the cause. Do not recommend investigating named individuals. Do not narrate your own constraints or guidelines in the output. ' + ANALYST_CTX, temp:0.3, tokens:1200 },
  executive:  { name:'Executive Summary', system:'You are an executive analyst. Provide a concise summary for senior decision-makers. When listing individuals who appear frequently in corrupted or problematic records, frame them as affected parties, not as causes. Never suggest investigating a farmer or end user by name — they are victims of system failures, not perpetrators. Do not use phrases like potential data entry concerns next to individual names. ' + ANALYST_CTX, temp:0.2, tokens:800 },
  detailed:   { name:'Detailed Analysis', system:'You are a thorough data scientist. Provide comprehensive analysis covering all patterns. ' + ANALYST_CTX, temp:0.4, tokens:1500 },
  formulas:   { name:'Excel Formulas',    system:'You are an Excel expert. Suggest specific ready-to-use formulas with exact syntax. ' + ANALYST_CTX, temp:0.2, tokens:1000 },
  visual:     { name:'Chart Suggestions', system:'You are a data visualization expert. Recommend chart types and configurations. ' + ANALYST_CTX, temp:0.3, tokens:800 },
  anomalies:  { name:'Anomalies & Risks', system:'You are a data quality expert. Identify anomalies, outliers, and data quality issues. Present findings factually and objectively. STRICT RULES: (1) If all records share the same creator or modifier, do NOT flag this as an anomaly — it is normal for batch upload systems and pipeline operators. Only flag it if there is genuine statistical deviation. (2) Never speculate about business consequences such as payment delays, financial impact, or operational disruption unless the data explicitly shows this. Stick strictly to what the data contains. (3) Do not label single-creator patterns as critical findings — note them neutrally as consistent with automated processing. (4) Present patterns only — let the user draw operational conclusions. ' + ANALYST_CTX, temp:0.3, tokens:1000 },
  actionable: { name:'Observations',      system:'You are a careful data analyst. Based on this data, highlight patterns worth noting and present options the user may want to consider — but do not make decisions for them, issue directives, or recommend halting operations. Frame everything as observations and possibilities, not instructions. The user decides what action to take. ' + ANALYST_CTX, temp:0.3, tokens:1000 },
  enhance:    { name:'Enhance & Write Back', system:'You are a world-class senior analyst. Your task is two-fold: (1) Provide thorough analysis. (2) Write back findings into the spreadsheet by producing new column values for EVERY row. Apply genuine reasoning per row. MANDATORY: End your response with exactly this on its own line: WRITEBACK_JSON:[{"col":"Column Name","rows":["value row 1","value row 2",...]}] Include all columns requested. Each rows array must have one value per data row in original order. Values must be concise (under 60 chars). ' + ANALYST_CTX, temp:0.4, tokens:4096 }
};

// ── Dataset fingerprinting ────────────────────────────────────────────────────
function fingerprintDataset(dataContext) {
  const ctx = dataContext.toLowerCase();
  const signals = [];

  // Geographic / GIS signals
  if (/geojson|polygon|coordinates|latitude|longitude|boundary|gis|coord/i.test(ctx))
    signals.push('geojson coordinates polygon gis boundary mapping');

  // Agricultural signals
  if (/field|farmer|hectare|crop|harvest|plantation|zambia|africa|kobo|registration/i.test(ctx))
    signals.push('agricultural field farmer registration africa zambia');

  // Financial signals
  if (/revenue|cost|profit|budget|invoice|payment|chf|usd|eur|salary/i.test(ctx))
    signals.push('financial revenue budget cost accounting');

  // HR / People signals
  if (/employee|staff|department|salary|headcount|hiring|payroll/i.test(ctx))
    signals.push('hr employee staff people management');

  // Data pipeline / batch signals
  if (/created_by|modified_by|batch|upload|pipeline|etl|processor/i.test(ctx))
    signals.push('batch upload pipeline etl data processing');

  // Logistics signals
  if (/shipment|delivery|route|warehouse|inventory|stock|order/i.test(ctx))
    signals.push('logistics supply chain inventory delivery');

  return signals.join(' ');
}

// ── Proactive insight pass ──────────────────────────────────────────────────────
async function generateProactiveInsights(apiKey, dataContext) {
  const system = 'You are a senior data analyst opening a new dataset for the first time. '
    + 'Scan the pre-computed analytics and immediately identify the 3 most important patterns or anomalies. '
    + 'Be specific and reference exact numbers from the analytics. '
    + 'Format: three short bullet points, each starting with an emoji indicator: '
    + '\u{1F534} for critical issues, \u{1F7E1} for notable patterns, \u{1F7E2} for positive findings. '
    + 'Maximum 2 sentences per bullet. No introductory text. No conclusions.';

  const userMsg = 'DATASET OVERVIEW:\n' + dataContext.slice(0, 3000) + '\n\nWhat are the 3 most important things to know about this dataset?';

  try {
    const insights = await callClaude(apiKey, system, userMsg, 0.2, 400);
    return insights || '';
  } catch(e) {
    return '';
  }
}

// ── Confidence scoring ──────────────────────────────────────────────────────────
function addConfidenceFooter(content, hasFullDataset) {
  const note = hasFullDataset
    ? 'All counts in this analysis are exact (computed from full dataset).'
    : 'Patterns inferred from a representative sample — verify critical counts directly.';
  return content + '\n\n---\n*' + note + '*';
}

// ── Self-review pass — silently corrects principle violations ─────────────────
const REVIEW_FLAG_PATTERNS = [
  /investigate\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,   // Investigate [First] [Last]
  /why\s+[A-Z][a-z]+\s+[A-Z][a-z]+\s+has/i,    // why [person] has
  /payment\s+delay/i,
  /financial\s+(impact|loss|risk)/i,
  /halt\s+(operations|processing|collection)/i,
  /data\s+entry\s+concerns?\s*:/i,
  /targeting\s+individuals/i,
  /I\s+(have\s+been|am)\s+(instructed|asked|designed)/i,
  /Forge\s+(has\s+been|is)\s+(instructed|programmed|designed)/i,
  /my\s+guidelines/i,
  /as\s+instructed/i,
];

async function selfReviewContent(apiKey, rawContent) {
  // Only run review if flagged patterns detected — keeps latency low for clean outputs
  const needsReview = REVIEW_FLAG_PATTERNS.some(p => p.test(rawContent));
  if (!needsReview) return rawContent;

  console.log('[Excel/SelfReview] Violations detected — running correction pass');

  const reviewSystem = `You are a senior editorial reviewer for a professional data analysis tool. 
Silently correct any of the following violations in the analysis below:
1. INDIVIDUAL BLAME: If named individuals appear frequently in corrupted records, they are affected parties — victims of system failures. Remove any language implying they caused the problem.
2. DIRECTIVES: Replace any directives (halt, fire, investigate [person name]) with neutral observations.
3. SPECULATION: Remove business impact claims not directly evidenced by the data (payment delays, financial losses).
4. SELF-NARRATION: Remove any sentences where the AI mentions its own guidelines, instructions, or constraints.
Return ONLY the corrected analysis. Do not explain what you changed. If no corrections needed, return original unchanged.`;

  try {
    const corrected = await callClaude(apiKey, reviewSystem, rawContent, 0.1, 1500);
    return corrected && corrected.trim() ? corrected : rawContent;
  } catch(e) {
    console.warn('[Excel/SelfReview] correction failed, using original:', e.message);
    return rawContent;
  }
}

function callClaude(apiKey, system, userMessage, temperature, maxTokens) {
  return new Promise(function(resolve, reject) {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens || 1200,
      temperature: temperature || 0.3,
      system: system,
      messages: [{ role: 'user', content: userMessage }]
    });
    const req = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VER,
        'Content-Length': Buffer.byteLength(body)
      }
    }, function(res) {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.content && parsed.content[0] && parsed.content[0].text) || '');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

router.get('/modes', function(req, res) {
  res.json({ ok: true, modes: Object.entries(EXCEL_MODES).map(function(entry) {
    return { id: entry[0], name: entry[1].name };
  })});
});

router.post('/analyze', optionalAuth, async function(req, res) {
  try {
    const question = req.body.question;
    const dataContext = req.body.dataContext;
    const modes = req.body.modes;
    const analysisType = req.body.analysisType;
    const analysisTypePrompt = req.body.analysisTypePrompt;
    if (!question || !dataContext) {
      return res.status(400).json({ ok: false, error: 'question and dataContext are required.' });
    }
    const forgeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!forgeKey) {
      return res.status(503).json({ ok: false, error: 'Analysis service temporarily unavailable.' });
    }
    const requestedModes = modes && modes.length > 0
      ? modes.filter(m => ['best','executive','detailed','anomalies','actionable'].includes(m))
      : ['best','executive','detailed','anomalies','actionable'];
    const hasContext = dataContext.includes('ANALYST CONTEXT:');
    const typeInstruction = analysisTypePrompt ? ('ANALYSIS TYPE: ' + analysisTypePrompt + '\n\n') : '';
    const contextInstruction = hasContext ? 'IMPORTANT: The analyst has provided context answers under ANALYST CONTEXT above. You MUST use them.\n\n' : '';
    // ── Dataset fingerprinting — detect domain from column names ──────────────────
    const domainKeywords = fingerprintDataset(dataContext);
    const enrichedQuery  = question + ' ' + domainKeywords + ' excel spreadsheet data';

    // RAG: inject relevant knowledge for this query
    let knowledgeInjection = '';
    let kModules = [];
    try {
      kModules = await findRelevantModules(enrichedQuery);
      if (kModules.length) {
        knowledgeInjection = buildInjectionPrompt(kModules);
        console.log(`[Knowledge/Excel] Injecting: ${kModules.map(m => m.module_id).join(', ')}`);
      }
    } catch(e) { console.warn('[Knowledge/Excel] injection failed:', e.message); }

    const user = await db.getUser(req.userEmail).catch(() => null);
    const lang = req.body.language || user?.preferred_language || 'en';
    const langInstruction = LANGUAGE_INSTRUCTIONS[lang] || '';
    // Real-time data injection — Layer 3
    const realtimeExcelContext = await injectRealtimeContext(question, '');
    const userMessage = realtimeExcelContext + 'DATA CONTEXT:\n' + dataContext + '\n\nQUESTION: ' + question + '\n\n' + typeInstruction + contextInstruction + knowledgeInjection + (langInstruction ? '\n\n' + langInstruction : '');

    const hasFullDataset = !dataContext.includes('SAMPLE (');

    // Run proactive insights and mode analysis in parallel
    const [proactiveInsights, ...modeResults] = await Promise.all([
      generateProactiveInsights(forgeKey, dataContext),
      ...requestedModes.map(async function(modeId) {
        const mode = EXCEL_MODES[modeId];
        if (!mode) return null;
        try {
          const rawContent = await callClaude(forgeKey, mode.system, userMessage, mode.temp, mode.tokens);
          // Pass 3: Self-review — silently correct principle violations
          const reviewed  = await selfReviewContent(forgeKey, rawContent);
          // Add confidence footer
          const content   = addConfidenceFooter(reviewed, hasFullDataset);
          return { id: modeId, name: mode.name, content };
        } catch(e) {
          return { id: modeId, name: mode.name, content: 'Analysis unavailable — please try again.' };
        }
      })
    ]);

    const results = modeResults.filter(Boolean);

    // Prepend proactive insights to the best/executive mode
    if (proactiveInsights) {
      const bestMode = results.find(r => r.id === 'best' || r.id === 'executive');
      if (bestMode) {
        bestMode.content = '**Key findings at a glance:**
' + proactiveInsights + '

---

' + bestMode.content;
      }
    }

    res.json({ ok: true, results, knowledgeModules: kModules.map(m => m.module_id), domain: domainKeywords.slice(0,50) });
  } catch(e) {
    console.error('[Excel] Error:', e.message);
    res.status(500).json({ ok: false, error: 'Analysis failed: ' + e.message });
  }
});

router.post('/save', requireAuth, async function(req, res) {
  try {
    const question = String(req.body.question || '').slice(0, 500);
    const filename = String(req.body.filename || req.body.fileName || '').slice(0, 200);
    const rows = parseInt(req.body.rows || req.body.rowCount) || 0;
    const cols = parseInt(req.body.cols || req.body.colCount) || 0;
    const type = String(req.body.type || 'Analysis');
    const date = req.body.date || req.body.createdAt || new Date().toISOString();
    const bestAnswer = String(req.body.bestAnswer || '').slice(0, 2000);
    const createdAt = req.body.createdAt || new Date().toISOString();
    const ym = new Date().toISOString().slice(0, 7);
    const entry = { id: Date.now(), question, filename, rows, cols, type, date, bestAnswer, createdAt };

    // Table PK is (user_email, year_month) — one row per month
    // Upsert: insert new row or append to existing entries array
    await db.query(`
      INSERT INTO excel_analyses(user_email, year_month, entries)
      VALUES($1, $2, $3::jsonb)
      ON CONFLICT (user_email, year_month)
      DO UPDATE SET entries = excel_analyses.entries || $3::jsonb
    `, [req.userEmail, ym, JSON.stringify([entry])]);

    res.json({ ok: true });
  } catch(e) {
    console.error('[Excel save]', e.message);
    res.status(200).json({ ok: false, error: e.message });
  }
});

router.get('/history', requireAuth, async function(req, res) {
  try {
    const r = await db.query(
      'SELECT entries FROM excel_analyses WHERE user_email=$1 ORDER BY year_month DESC LIMIT 12',
      [req.userEmail]
    );
    // entries is a JSONB array per row — flatten all months
    const entries = r.rows.flatMap(function(row) {
      try {
        const arr = Array.isArray(row.entries) ? row.entries : JSON.parse(row.entries || '[]');
        return arr;
      } catch(e) { return []; }
    }).slice(0, 20);
    res.json({ ok: true, entries: entries });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
