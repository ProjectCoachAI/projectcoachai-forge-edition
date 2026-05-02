'use strict';
const express = require('express');
const https = require('https');
const db = require('../lib/db');
const router = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');

const MODEL = 'claude-sonnet-4-20250514';
const API_VER = '2023-06-01';

const ANALYST_CTX = 'The user has provided analyst context. Read the ANALYST CONTEXT section carefully and incorporate it into your analysis.';

const EXCEL_MODES = {
  best:       { name:'Best Answer',       system:'You are a world-class data analyst. Provide the single best answer. Be specific, reference actual data values. ' + ANALYST_CTX, temp:0.3, tokens:1200 },
  executive:  { name:'Executive Summary', system:'You are an executive analyst. Provide a concise summary for senior decision-makers. ' + ANALYST_CTX, temp:0.2, tokens:800 },
  detailed:   { name:'Detailed Analysis', system:'You are a thorough data scientist. Provide comprehensive analysis covering all patterns. ' + ANALYST_CTX, temp:0.4, tokens:1500 },
  formulas:   { name:'Excel Formulas',    system:'You are an Excel expert. Suggest specific ready-to-use formulas with exact syntax. ' + ANALYST_CTX, temp:0.2, tokens:1000 },
  visual:     { name:'Chart Suggestions', system:'You are a data visualization expert. Recommend chart types and configurations. ' + ANALYST_CTX, temp:0.3, tokens:800 },
  anomalies:  { name:'Anomalies & Risks', system:'You are a data quality expert. Identify anomalies, outliers, data quality issues. ' + ANALYST_CTX, temp:0.3, tokens:1000 },
  actionable: { name:'Action Items',      system:'You are a strategic advisor. Based on this data, provide specific actionable recommendations. ' + ANALYST_CTX, temp:0.4, tokens:1000 },
  enhance:    { name:'Enhance & Write Back', system:'You are a world-class senior analyst. Your task is two-fold: (1) Provide thorough analysis. (2) Write back findings into the spreadsheet by producing new column values for EVERY row. Apply genuine reasoning per row. MANDATORY: End your response with exactly this on its own line: WRITEBACK_JSON:[{"col":"Column Name","rows":["value row 1","value row 2",...]}] Include all columns requested. Each rows array must have one value per data row in original order. Values must be concise (under 60 chars). ' + ANALYST_CTX, temp:0.4, tokens:4096 }
};

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
    const userMessage = 'DATA CONTEXT:\n' + dataContext + '\n\nQUESTION: ' + question + '\n\n' + typeInstruction + contextInstruction;

    const results = await Promise.all(
      requestedModes.map(async function(modeId) {
        const mode = EXCEL_MODES[modeId];
        if (!mode) return null;
        try {
          const content = await callClaude(forgeKey, mode.system, userMessage, mode.temp, mode.tokens);
          return { id: modeId, name: mode.name, content: content };
        } catch(e) {
          return { id: modeId, name: mode.name, content: 'Analysis unavailable — please try again.' };
        }
      })
    );
    res.json({ ok: true, results: results.filter(Boolean) });
  } catch(e) {
    console.error('[Excel] Error:', e.message);
    res.status(500).json({ ok: false, error: 'Analysis failed: ' + e.message });
  }
});

router.post('/save', requireAuth, async function(req, res) {
  try {
    const id = String(req.body.id || Date.now());
    const question = String(req.body.question || '').slice(0, 500);
    const fileName = String(req.body.fileName || '').slice(0, 200);
    const rowCount = parseInt(req.body.rowCount) || 0;
    const colCount = parseInt(req.body.colCount) || 0;
    const bestAnswer = String(req.body.bestAnswer || '').slice(0, 2000);
    const createdAt = req.body.createdAt || new Date().toISOString();
    const ym = new Date().toISOString().slice(0, 7);

    const entry = { id, question, fileName, rowCount, colCount, bestAnswer, createdAt };

    // Ensure table and entry column exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS excel_analyses (
        id SERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        year_month TEXT NOT NULL,
        entry JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`
      ALTER TABLE excel_analyses ADD COLUMN IF NOT EXISTS entry JSONB
    `);

    await db.query(
      'INSERT INTO excel_analyses(user_email, year_month, entry) VALUES($1, $2, $3::jsonb)',
      [req.userEmail, ym, JSON.stringify(entry)]
    );
    res.json({ ok: true });
  } catch(e) {
    console.error('[Excel save]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/history', requireAuth, async function(req, res) {
  try {
    const r = await db.query(
      'SELECT entry FROM excel_analyses WHERE user_email=$1 ORDER BY id DESC LIMIT 20',
      [req.userEmail]
    );
    const entries = r.rows.map(function(row) {
      try { return JSON.parse(row.entry); } catch(e) { return null; }
    }).filter(Boolean);
    res.json({ ok: true, entries: entries });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
