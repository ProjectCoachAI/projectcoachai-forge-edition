'use strict';
const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ── RAG: Find relevant modules for a query ────────────────────────
async function findRelevantModules(query, limit = 3) {
  try {
    const words = query.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    if (!words.length) return [];

    const placeholders = words.map((_, i) => `$${i + 1}`).join(', ');
    const r = await db.query(`
      SELECT
        km.id, km.module_id, km.name, km.summary,
        km.system_prompt_snippet, km.confidence,
        SUM(kk.weight) as relevance_score
      FROM knowledge_modules km
      JOIN knowledge_keywords kk ON kk.module_id = km.id
      WHERE km.status = 'active'
        AND LOWER(kk.keyword) = ANY(ARRAY[${placeholders}])
      GROUP BY km.id, km.module_id, km.name, km.summary,
               km.system_prompt_snippet, km.confidence
      ORDER BY relevance_score DESC
      LIMIT $${words.length + 1}
    `, [...words, limit]);
    return r.rows;
  } catch(e) {
    console.warn('[Knowledge] findRelevantModules failed:', e.message);
    return [];
  }
}

// ── Build injection prompt from modules ───────────────────────────
function buildInjectionPrompt(modules) {
  if (!modules.length) return '';
  const snippets = modules.map(m =>
    `[${m.module_id}: ${m.name}]\n${m.system_prompt_snippet}`
  ).join('\n\n');
  return `\n\n--- FORGE KNOWLEDGE CONTEXT ---\nUse the following verified knowledge to enhance your response:\n\n${snippets}\n--- END KNOWLEDGE CONTEXT ---\n\n`;
}

// GET /api/knowledge/inject?query=... — get injection prompt for a query
router.get('/inject', async (req, res) => {
  try {
    const query = req.query.query || '';
    const modules = await findRelevantModules(query);
    const injection = buildInjectionPrompt(modules);
    res.json({ ok: true, modules: modules.map(m => m.module_id), injection });
  } catch(e) {
    res.json({ ok: true, modules: [], injection: '' });
  }
});

// GET /api/knowledge/modules — list all modules (admin)
router.get('/modules', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await db.query(
      'SELECT id, module_id, name, status, confidence, summary, created_at FROM knowledge_modules ORDER BY module_id'
    );
    res.json({ ok: true, modules: r.rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/knowledge/candidate — submit a synthesis as a knowledge candidate
router.post('/candidate', requireAuth, async (req, res) => {
  try {
    const { synthesisId, title, content, keywords } = req.body;
    await db.query(
      `INSERT INTO knowledge_candidates(synthesis_id, user_email, proposed_title, proposed_content, proposed_keywords)
       VALUES($1,$2,$3,$4,$5)`,
      [synthesisId, req.userEmail, title, content, keywords || []]
    );
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/knowledge/candidates — list pending candidates (admin)
router.get('/candidates', requireAuth, requireAdmin, async (req, res) => {
  try {
    const r = await db.query(
      "SELECT * FROM knowledge_candidates WHERE status='pending' ORDER BY created_at DESC"
    );
    res.json({ ok: true, candidates: r.rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /api/knowledge/candidates/:id — approve or reject
router.patch('/candidates/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, moduleId, name } = req.body;
    await db.query(
      `UPDATE knowledge_candidates SET status=$1, reviewed_by=$2, reviewed_at=NOW() WHERE id=$3`,
      [status, req.userEmail, req.params.id]
    );
    if (status === 'approved' && req.body.content) {
      await db.query(
        `INSERT INTO knowledge_modules(module_id, name, source, status, confidence, summary, content_markdown, system_prompt_snippet, approved_by, review_due_at)
         VALUES($1,$2,'forge-synthesis','active','medium',$3,$4,$5,$6,NOW()+INTERVAL '90 days')`,
        [moduleId || 'FKM-AUTO-' + Date.now(), name || 'Auto Module',
         req.body.summary || '', req.body.content, req.body.snippet || req.body.content.slice(0, 500),
         req.userEmail]
      );
    }
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/knowledge/seed — seed the 5 foundation modules
router.post('/seed', requireAuth, requireAdmin, async (req, res) => {
  try {
    const modules = [
      {
        module_id: 'FKM-001', name: 'AI Chatbot Technology', source: 'forge-synthesis',
        status: 'active', confidence: 'high',
        summary: 'Core knowledge about how LLM-based AI chatbots work, their capabilities and limitations.',
        content_markdown: '# AI Chatbot Technology\n\nLarge Language Models (LLMs) predict the next token based on training data. They excel at reasoning, summarisation, and generation but have no real-time knowledge, can hallucinate, and lack persistent memory between sessions.',
        system_prompt_snippet: 'AI chatbots are LLM-based systems that predict tokens from training data. They can hallucinate facts, have knowledge cutoffs, and lack real-time data. Always verify critical facts from authoritative sources.',
        keywords: [['ai', 2.0], ['chatbot', 2.0], ['llm', 2.0], ['language model', 1.8], ['gpt', 1.5], ['claude', 1.5], ['gemini', 1.5], ['artificial intelligence', 1.5], ['neural network', 1.2], ['transformer', 1.5]]
      },
      {
        module_id: 'FKM-002', name: 'Decision Frameworks', source: 'manual',
        status: 'active', confidence: 'high',
        summary: 'Structured approaches to making better decisions under uncertainty.',
        content_markdown: '# Decision Frameworks\n\nKey frameworks: SWOT (Strengths, Weaknesses, Opportunities, Threats), Decision Matrix (weighted scoring), Pre-mortem (imagine failure), Second-order thinking (consequences of consequences).',
        system_prompt_snippet: 'Apply structured decision frameworks: use SWOT for strategic analysis, weighted decision matrices for options comparison, pre-mortem analysis for risk identification, and second-order thinking for long-term consequences.',
        keywords: [['decision', 2.0], ['framework', 1.8], ['swot', 2.0], ['strategy', 1.5], ['analysis', 1.3], ['risk', 1.5], ['options', 1.2], ['choose', 1.5], ['compare', 1.3], ['evaluate', 1.3]]
      },
      {
        module_id: 'FKM-003', name: 'Data & Spreadsheet Quality', source: 'manual',
        status: 'active', confidence: 'high',
        summary: 'Best practices for analysing spreadsheet data and identifying quality issues.',
        content_markdown: '# Data & Spreadsheet Quality\n\nKey checks: completeness (missing values), consistency (formatting), accuracy (outliers), timeliness (date ranges). Excel pitfalls: merged cells break formulas, implicit data types cause errors.',
        system_prompt_snippet: 'When analysing spreadsheet data: check for missing values, inconsistent formatting, outliers, and date range validity. Flag merged cells, mixed data types, and formula errors. Provide both summary statistics and data quality assessment.',
        keywords: [['excel', 2.0], ['spreadsheet', 2.0], ['data', 1.5], ['csv', 1.8], ['analysis', 1.3], ['rows', 1.2], ['columns', 1.2], ['formula', 1.5], ['pivot', 1.3], ['chart', 1.0]]
      },
      {
        module_id: 'FKM-004', name: 'AI Limitations & Failure Modes', source: 'forge-synthesis',
        status: 'active', confidence: 'high',
        summary: 'Known failure modes of AI systems and how to mitigate them.',
        content_markdown: '# AI Limitations & Failure Modes\n\nHallucination: AI confidently states false information. Mitigation: verify with primary sources. Bias: training data bias propagates to outputs. Context window limits truncate long documents.',
        system_prompt_snippet: 'Be aware of AI limitations: hallucination (false confident statements), training data bias, knowledge cutoffs, and context window constraints. Always recommend verification of critical facts from authoritative sources.',
        keywords: [['hallucination', 2.0], ['bias', 1.8], ['limitation', 1.5], ['error', 1.3], ['wrong', 1.2], ['accuracy', 1.5], ['reliability', 1.5], ['trust', 1.2], ['verify', 1.3], ['mitigate', 1.2]]
      },
      {
        module_id: 'FKM-005', name: 'Swiss Business & SaaS Context', source: 'manual',
        status: 'active', confidence: 'high',
        summary: 'Swiss business environment, regulations, and SaaS considerations.',
        content_markdown: '# Swiss Business & SaaS Context\n\nSwitzerland: federal structure, 26 cantons, GDPR-equivalent (nDSG), strong banking secrecy, CHF currency. SaaS: recurring revenue model, MRR/ARR metrics, churn rate critical.',
        system_prompt_snippet: 'Swiss business context: governed by Swiss Code of Obligations, nDSG data protection law (GDPR-equivalent), VAT at 8.1%, strong privacy culture. SaaS metrics: focus on MRR, ARR, churn rate, LTV/CAC ratio.',
        keywords: [['switzerland', 2.0], ['swiss', 2.0], ['saas', 1.8], ['gdpr', 1.5], ['ndsg', 1.8], ['chf', 1.5], ['zurich', 1.3], ['geneva', 1.2], ['mrr', 1.5], ['arr', 1.5], ['startup', 1.2]]
      }
    ];

    let seeded = 0;
    for (const m of modules) {
      const r = await db.query(
        `INSERT INTO knowledge_modules(module_id, name, source, status, confidence, summary, content_markdown, system_prompt_snippet, approved_by, review_due_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'system',NOW()+INTERVAL '90 days')
         ON CONFLICT (module_id) DO NOTHING RETURNING id`,
        [m.module_id, m.name, m.source, m.status, m.confidence, m.summary, m.content_markdown, m.system_prompt_snippet]
      );
      if (r.rows[0]) {
        const moduleDbId = r.rows[0].id;
        for (const [kw, weight] of m.keywords) {
          await db.query(
            'INSERT INTO knowledge_keywords(module_id, keyword, weight) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [moduleDbId, kw, weight]
          );
        }
        seeded++;
      }
    }
    res.json({ ok: true, seeded, total: modules.length });
  } catch(e) {
    console.error('[Knowledge seed]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = { router, findRelevantModules, buildInjectionPrompt };
