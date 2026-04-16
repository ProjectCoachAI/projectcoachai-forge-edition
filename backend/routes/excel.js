'use strict';
const express = require('express');
const https   = require('https');
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
  actionable: { name:'Action Items',      system:'You are a strategic business advisor. Based on this data analysis, provide specific, actionable recommendations and decisions. ' + ANALYST_CONTEXT_INSTRUCTION, temp:0.4, tokens:1000 },
};

function callClaude(apiKey, system, userMessage, temperature=0.3, maxTokens=1200) {
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
    const { question, dataContext, modes } = req.body;
    if (!question || !dataContext) return res.status(400).json({ ok:false, error:'question and dataContext are required.' });
    const forgeKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!forgeKey) return res.status(503).json({ ok:false, error:'Analysis service temporarily unavailable.' });

    const requestedModes = modes || Object.keys(EXCEL_MODES);
    const hasContext = dataContext.includes('ANALYST CONTEXT:');
    const userMessage = `DATA CONTEXT:\n${dataContext}\n\nQUESTION: ${question}\n\n${hasContext ? 'IMPORTANT: The analyst has provided context answers above under ANALYST CONTEXT. These MUST be used to inform your interpretation. For example, if the analyst states that flagged means requires review not invalid, your conclusions must reflect that distinction.\n\n' : ''}Provide a specific, accurate answer based on the actual data and any analyst context provided above.`;

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

module.exports = router;
