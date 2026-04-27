'use strict';
const express = require('express');
const https = require('https');
const db = require('../lib/db');
const router = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');

const MODEL = 'claude-sonnet-4-20250514';
const API_VER = '2023-06-01';

const ANALYST_CTX = 'The user has provided analyst context. You MUST read and incorporate these answers. They contain critical domain knowledge.';

const EXCEL_MODES = {
  best:       { name:'Best Answer',       system:'You are a world-class data analyst. Provide the single best answer to the question. Be specific and reference actual values. ' + ANALYST_CTX, temp:0.3, tokens:1200 },
  executive:  { name:'Executive Summary', system:'You are an executive analyst. Provide a concise summary for senior decision-makers. ' + ANALYST_CTX, temp:0.2, tokens:800 },
  detailed:   { name:'Detailed Analysis', system:'You are a thorough data scientist. Provide comprehensive analysis covering all patterns and insights. ' + ANALYST_CTX, temp:0.4, tokens:1500 },
  formulas:   { name:'Excel Formulas',    system:'You are an Excel expert. Suggest specific ready-to-use Excel formulas with exact syntax. ' + ANALYST_CTX, temp:0.2, tokens:1000 },
  visual:     { name:'Chart Suggestions', system:'You are a data visualization expert. Recommend the best chart types and configurations. ' + ANALYST_CTX, temp:0.3, tokens:800 },
  anomalies:  { name:'Anomalies & Risks', system:'You are a data quality expert. Identify anomalies, outliers, and data quality issues. ' + ANALYST_CTX, temp:0.3, tokens:1000 },
  actionable: { name:'Action Items',      system:'You are a strategic advisor. Based on this data, provide specific actionable recommendations. ' + ANALYST_CTX, temp:0.4, tokens:1000 },
  enhance:    { name:'Enhance & Write Back', system:'You are a world-class senior analyst. Your task is two-fold: (1) Provide thorough intelligent analysis applying domain expertise. (2) Write back findings into the spreadsheet producing new column values for EVERY row. Apply genuine reasoning per row. MANDATORY: End your response with exactly this on its own line: WRITEBACK_JSON:[{"col":"Column Name","rows":["value row 1","value row 2",...]}] Include all columns requested plus any your analysis determines valuable. Each rows array must have one value per data row in original order. Values must be concise (under 60 chars). ' + ANALYST_CTX, temp:0.4, tokens:4000 }
};

function callClaude(apiKey, system, userMessage, temperature, maxTokens) {
  temperature = temperature || 0.3;
  maxTokens = maxTokens || 4096;
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      temperature: temperature,
      system: system,
      messages: [{ role: 'user', content: userMessage }]
    });
    var req = https.request({
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
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          var text = (parsed.content && parsed.content[0] && parsed.content[0].text) ? parsed.content[0].text : '';
          resolve(text);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

router.get('/modes', function(req, res) {
  var modes = Object.keys(EXCEL_MODES).map(function(id) {
    return { id: id, name: EXCEL_MODES[id].name };
  });
  res.json({ ok: true, modes: modes });
});

router.post('/analyze', optionalAuth, async function(req, res) {
  try {
    var question = req.body.question;
    var dataContext = req.body.dataContext;
    var modes = req.body.modes;
    var analysisType = req.body.analysisType;
    var analysisTypePrompt = req.body.analysisTypePrompt;

    if (!question || !dataContext) {
      return res.status(400).json({ ok: false, error: 'question and dataContext are required.' });
    }

    var forgeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!forgeKey) {
      return res.status(503).json({ ok: false, error: 'Analysis service temporarily unavailable.' });
    }

    var requestedModes = modes || Object.keys(EXCEL_MODES);
    var hasContext = dataContext.indexOf('ANALYST CONTEXT:') !== -1;
    var typeInstruction = analysisTypePrompt ? ('ANALYSIS TYPE: ' + analysisTypePrompt + '\n\n') : '';
    var contextInstruction = hasContext ? 'IMPORTANT: The analyst has provided context answers under ANALYST CONTEXT above. You MUST use these answers in your analysis.\n\n' : '';
    var userMessage = 'DATA CONTEXT:\n' + dataContext + '\n\nQUESTION: ' + question + '\n\n' + typeInstruction + contextInstruction;

    var promises = requestedModes.map(function(modeId) {
      var mode = EXCEL_MODES[modeId];
      if (!mode) return Promise.resolve(null);
      return callClaude(forgeKey, mode.system, userMessage, mode.temp, mode.tokens)
        .then(function(content) {
          return { id: modeId, name: mode.name, content: content };
        })
        .catch(function() {
          return { id: modeId, name: mode.name, content: 'Analysis unavailable — please try again.' };
        });
    });

    var results = await Promise.all(promises);
    res.json({ ok: true, results: results.filter(Boolean) });
  } catch(e) {
    console.error('[Excel] Error:', e.message);
    res.status(500).json({ ok: false, error: 'Analysis failed: ' + e.message });
  }
});

router.post('/save', requireAuth, async function(req, res) {
  try {
    var id = req.body.id;
    var question = req.body.question;
    var fileName = req.body.fileName;
    var rowCount = req.body.rowCount;
    var colCount = req.body.colCount;
    var bestAnswer = req.body.bestAnswer;
    var createdAt = req.body.createdAt;
    var entry = JSON.stringify({
      id: id || Date.now(),
      question: question,
      fileName: fileName,
      rowCount: rowCount,
      colCount: colCount,
      bestAnswer: bestAnswer,
      createdAt: createdAt || new Date().toISOString()
    });
    var ym = new Date().toISOString().slice(0, 7);
    await db.query(
      'INSERT INTO excel_analyses(user_email,year_month,entry) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING',
      [req.userEmail, ym, entry]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/history', requireAuth, async function(req, res) {
  try {
    var r = await db.query(
      'SELECT entry FROM excel_analyses WHERE user_email=$1 ORDER BY id DESC LIMIT 20',
      [req.userEmail]
    );
    var entries = r.rows.map(function(row) {
      try { return JSON.parse(row.entry); } catch(e) { return null; }
    }).filter(Boolean);
    res.json({ ok: true, entries: entries });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
