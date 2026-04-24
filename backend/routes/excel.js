'use strict';
// Input sanitization
const clean = (s, max=1000) => typeof s === 'string' ? s.trim().slice(0, max) : '';
const express = require('express');
const https   = require('https');
const db = require('../lib/db');
const router  = express.Router();
const { optionalAuth } = require('../middleware/auth');
const MODEL   = 'claude-sonnet-4-20250514';
const API_VER = '2023-06-01';

const ANALYST_CONTEXT_INSTRUCTION = 'The user has provided analyst context answers before running this analysis. These answers are included in the DATA CONTEXT section under ANALYST CONTEXT. You MUST read and incorporate these answers into your analysis. They contain critical domain knowledge including what flagged/error values mean, expected normal values, known data issues, and the decision this analysis will support. Failure to use this context will produce incorrect conclusions.';

const EXCEL_MODES = {
  best:       { name:'Best Answer',       system:'You are a world-class data analyst. Provide the single best, most accurate answer to the question about the uploaded data. Be specific, reference actual values from the data. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.3, tokens:1200 },
  executive:  { name:'Executive Summary', system:'You are an executive business analyst. Provide a concise executive summary with key findings, written for senior decision-makers. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.2, tokens:800 },
  detailed:   { name:'Detailed Analysis', system:'You are a thorough data scientist. Provide a comprehensive analysis covering all relevant patterns, trends, and insights. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.4, tokens:1500 },
  formulas:   { name:'Excel Formulas',    system:'You are an Excel expert. Suggest specific, ready-to-use Excel formulas and functions. Include exact formula syntax that can be copied directly into Excel cells. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.2, tokens:1000 },
  visual:     { name:'Chart Suggestions', system:'You are a data visualization expert. Recommend the best chart types for this data, specifying what goes on each axis and why.', temp:0.3, tokens:800 },
  anomalies:  { name:'Anomalies & Risks', system:'You are a data quality expert. Identify anomalies, outliers, data quality issues, and potential risks in this dataset. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.3, tokens:1000 },
  actionable: { name:'Action Items',      system:'You are a strategic business advisor. Based on this data analysis, provide specific, actionable recommendations and decisions. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.4, tokens:1000 },,
  enhance: { name:'Enhance & Write Back', system:'You are a world-class senior analyst and domain expert. Your task is two-fold: (1) Provide a thorough intelligent analysis applying your domain expertise to interpret each row, make judgements, identify patterns, and produce meaningful insights. (2) Write back your findings into the spreadsheet producing new column values for EVERY row. Apply genuine reasoning per row — classify, score, assess, recommend based on actual content. MANDATORY: End your response with exactly this on its own line: WRITEBACK_JSON:[{"col":"Column Name","rows":["value row 1","value row 2",...]}] Include all columns requested plus any your analysis determines valuable. Each rows array must have one value per data row in original order. Values must be concise (under 60 chars) but meaningful. Provide detailed analysis FIRST then WRITEBACK_JSON at the very end.', temp:0.2, tokens:4096 }
};

function callClaude(apiKey, system, userMessage, temperature=0.3, maxTokens = 4096) {
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
          const parsed = JSON.parse(data);
          resolve(parsed.content?.[0]?.text || '');
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// GET /api/excel/modes
router.get('/modes', (req, res) => {
  res.json({ ok:true, modes:Object.entries(EXCEL_MODES).map(([id,m])=>({ id, name:m.name })) });
});

// POST /api/excel/analyze
router.post('/analyze', optionalAuth, async (req, res) => {
  try {
    const { question, dataContext, modes, analysisType, analysisTypePrompt } = req.body;
    if (!question || !dataContext) return res.status(400).json({ ok:false, error:'question and dataContext are required.' });
    const forgeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!forgeKey) return res.status(503).json({ ok:false, error:'Analysis service temporarily unavailable.' });

    const requestedModes = modes || Object.keys(EXCEL_MODES);
    const hasContext = dataContext.includes('ANALYST CONTEXT:');
    const typeInstruction = analysisTypePrompt ? `ANALYSIS TYPE: ${analysisTypePrompt}\n\n` : '';
    const contextInstruction = hasContext ? 'IMPORTANT: The analyst has provided context answers under ANALYST CONTEXT above. These MUST be used to inform your interpretation and conclusions.\n\n' : '';
    const userMessage = `DATA CONTEXT:\n${dataContext}\n\nQUESTION: ${question}\n\n${typeInstruction}${contextInstruction}Provide a specific, accurate answer based on the actual data and any analyst context provided above.`;

    const results = await Promise.all(
      requestedModes.map(async modeId => {
        const mode = EXCEL_MODES[modeId];
        if (!mode) return null;
        try {
          const content = await callClaude(forgeKey, mode.system, userMessage, mode.temp, mode.tokens);
          return { id:modeId, name:mode.name, content };
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


const { requireAuth } = require('../middleware/auth');

router.post('/save', requireAuth, async (req, res) => {
  try {
    const { id, question, fileName, rowCount, colCount, bestAnswer, createdAt } = req.body;
    const entry = JSON.stringify({ id: id||Date.now(), question, fileName, rowCount, colCount, bestAnswer, createdAt: createdAt||new Date().toISOString() });
    const ym = new Date().toISOString().slice(0,7);
    await db.query(`
      INSERT INTO excel_analyses (user_email, year_month, entries)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (user_email, year_month) DO UPDATE
      SET entries = excel_analyses.entries || $3::jsonb
    `, [req.userEmail, ym, JSON.stringify([JSON.parse(entry)])]);
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT entries FROM excel_analyses WHERE user_email=$1 ORDER BY year_month DESC LIMIT 6',
      [req.userEmail]
    );
    const entries = result.rows
      .flatMap(r => Array.isArray(r.entries) ? r.entries : [])
      .filter(e => e && e.question && e.createdAt)
      .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20);
    res.json({ ok:true, entries });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

module.exports = router;
