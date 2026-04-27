'use strict';

const express = require('express');
const https   = require('https');
const db      = require('../lib/db');
const router  = express.Router();
const { optionalAuth, requireAuth } = require('../middleware/auth');

const MODEL   = 'claude-sonnet-4-20250514';
const API_VER = '2023-06-01';

const ANALYST_CONTEXT_INSTRUCTION = 'The user has provided analyst context answers. Read and incorporate these answers into your analysis. They contain critical domain knowledge.';

const EXCEL_MODES = {
  best:       { name:'Best Answer',       system:'You are a world-class data analyst. Provide the single best answer to the question about this data. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.3, tokens:1200 },
  executive:  { name:'Executive Summary', system:'You are an executive business analyst. Provide a concise executive summary for senior decision-makers. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.2, tokens:800 },
  detailed:   { name:'Detailed Analysis', system:'You are a thorough data scientist. Provide a comprehensive analysis covering all relevant patterns and insights. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.4, tokens:1500 },
  formulas:   { name:'Excel Formulas',    system:'You are an Excel expert. Suggest specific, ready-to-use Excel formulas. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.2, tokens:1000 },
  visual:     { name:'Chart Suggestions', system:'You are a data visualization expert. Recommend the best chart types and configurations. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.3, tokens:800 },
  anomalies:  { name:'Anomalies & Risks', system:'You are a data quality expert. Identify anomalies, outliers, and data quality issues. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.3, tokens:1000 },
  actionable: { name:'Action Items',      system:'You are a strategic business advisor. Based on the data analysis, provide specific action items. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.4, tokens:1000 },
  enhance:    { name:'Enhance & Write Back', system:'You are a world-class senior analyst. Analyse this data and write back findings into new columns. For EVERY row determine appropriate values. MANDATORY: End your response with exactly: WRITEBACK_JSON:[{"col":"Column Name","rows":["value1","value2",...]}] Each rows array must have one value per data row. Values must be concise (under 60 chars). ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.3, tokens:4096 }
};

function callClaude(apiKey, system, userMessage, temperature, maxTokens) {
  temperature = temperature || 0.3;
  maxTokens = maxTokens || 4096;
  return new Promise(function(resolve, reject) {
    var body = JSON.stringify({ model:MODEL, max_tokens:maxTokens, temperature:temperature, system:system, messages:[{role:'user',content:userMessage}] });
    var req = https.request({
      hostname:'api.anthropic.com', port:443, path:'/v1/messages', method:'POST',
      headers:{ 'Content-Type':'application/json','x-api-key':apiKey,'anthropic-version':API_VER,'Content-Length':Buffer.byteLength(body) }
    }, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try {
          var parsed = JSON.parse(data);
          resolve((parsed.content && parsed.content[0] && parsed.content[0].text) || '');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// GET /api/excel/modes
router.get('/modes', function(req, res) {
  res.json({ ok:true, modes:Object.entries(EXCEL_MODES).map(function(entry) { return { id:entry[0], name:entry[1].name }; }) });
});

// POST /api/excel/analyze
router.post('/analyze', optionalAuth, async function(req, res) {
  try {
    var question = req.body.question;
    var dataContext = req.body.dataContext;
    var modes = req.body.modes;
    var analysisType = req.body.analysisType;
    var analysisTypePrompt = req.body.analysisTypePrompt;

    if (!question || !dataContext) return res.status(400).json({ ok:false, error:'question and dataContext are required.' });
    var forgeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!forgeKey) return res.status(503).json({ ok:false, error:'Analysis service temporarily unavailable.' });

    var requestedModes = modes || Object.keys(EXCEL_MODES);
    var hasContext = dataContext.includes('ANALYST CONTEXT:');
    var typeInstruction = analysisTypePrompt ? ('ANALYSIS TYPE: ' + analysisTypePrompt + '\n\n') : '';
    var contextInstruction = hasContext ? 'IMPORTANT: The analyst has provided context. Use it in your analysis.\n\n' : '';
    var userMessage = 'DATA CONTEXT:\n' + dataContext + '\n\nQUESTION: ' + question + '\n\n' + typeInstruction + contextInstruction;

    var results = await Promise.all(
      requestedModes.map(async function(modeId) {
        var mode = EXCEL_MODES[modeId];
        if (!mode) return null;
        try {
          var content = await callClaude(forgeKey, mode.system, userMessage, mode.temp, mode.tokens);
          return { id:modeId, name:mode.name, content:content };
        } catch(e) {
          return { id:modeId, name:mode.name, content:'Analysis unavailable — please try again.' };
        }
      })
    );

    res.json({ ok:true, results:results.filter(Boolean) });
  } catch(e) {
    console.error('[Excel] Error:', e.message);
    res.status(500).json({ ok:false, error:'Analysis failed.' });
  }
});

// POST /api/excel/save
router.post('/save', requireAuth, async function(req, res) {
  try {
    var id = req.body.id;
    var question = req.body.question;
    var fileName = req.body.fileName;
    var rowCount = req.body.rowCount;
    var colCount = req.body.colCount;
    var bestAnswer = req.body.bestAnswer;
    var createdAt = req.body.createdAt;
    var entry = JSON.stringify({ id: id || Date.now(), question:question, fileName:fileName, rowCount:rowCount, colCount:colCount, bestAnswer:bestAnswer, createdAt: createdAt || new Date().toISOString() });
    var ym = new Date().toISOString().slice(0,7);
    await db.query(
      'INSERT INTO excel_analyses(user_email,year_month,entries) VALUES($1,$2,$3::jsonb) ON CONFLICT(user_email,year_month) DO UPDATE SET entries=excel_analyses.entries||$3::jsonb',
      [req.userEmail, ym, entry]
    );
    res.json({ ok:true });
  } catch(e) {
    console.error('[Excel] Save error:', e.message);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// GET /api/excel/history
router.get('/history', requireAuth, async function(req, res) {
  try {
    var r = await db.query('SELECT entries FROM excel_analyses WHERE user_email=$1 ORDER BY year_month DESC LIMIT 6', [req.userEmail]);
    var entries = [];
    r.rows.forEach(function(row) {
      try {
        var parsed = typeof row.entries === 'string' ? JSON.parse(row.entries) : row.entries;
        if (Array.isArray(parsed)) entries = entries.concat(parsed);
        else entries.push(parsed);
      } catch(e) {}
    });
    res.json({ ok:true, entries:entries.slice(0,20) });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

module.exports = router;
