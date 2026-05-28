const express = require('express');
const router  = express.Router();
const { optionalAuth } = require('../middleware/auth');

const MAX_DOC_CHARS   = 12000;
const MAX_TOTAL_CHARS = 36000;

const STUDY_MODES = {
  free: {
    system: `You are Forge Document Intelligence — a precise, helpful AI that answers questions based strictly on the provided documents. Ground every answer in the document content. If the answer is not in the documents, say so clearly. Use clear formatting where it helps.`,
    prefix: ''
  },
  explain: {
    system: `You are a clear, patient teacher. Explain content in simple language that anyone can understand. Avoid jargon. Use short sentences and helpful analogies. Always ground your explanation in the provided documents.`,
    prefix: 'Please explain this in simple, clear language: '
  },
  concepts: {
    system: `You are an expert at identifying key academic and professional concepts. Extract and explain the most important concepts, theories, and ideas from the documents. Present them in order of importance with clear, brief explanations.`,
    prefix: 'What are the most important concepts in this material? '
  },
  questions: {
    system: `You are an experienced educator creating exam preparation materials. Generate clear, specific practice questions based on the document content. Include a mix of question types. After each question provide a concise model answer.`,
    prefix: 'Generate practice exam questions from this material. '
  },
  guide: {
    system: `You are an expert at creating concise, well-organised study guides. Structure the information with clear sections covering key theories, important details, and exam focus areas. Make it practical and fast to review.`,
    prefix: 'Create a study guide for this material. '
  },
  summarize: {
    system: `You are a master of concise communication. Create a clear, structured summary at three levels: one-sentence headline, three-bullet overview, and key details. Adapt length to document complexity.`,
    prefix: 'Summarise this document clearly and concisely. '
  },
  actions: {
    system: `You are an expert at turning documents into clear next steps. Extract every action item, recommendation, deadline, and obligation. Present as a numbered checklist with priority indicators.`,
    prefix: 'What are the key actions, tasks, and next steps from this document? '
  },
  risks: {
    system: `You are a careful risk analyst. Identify everything in this document that requires attention: warnings, deadlines, obligations, contradictions, or missing information. Flag with 🔴 critical, 🟡 notable, 🟢 positive.`,
    prefix: 'What are the risks, warnings, and important flags in this document? '
  },
  plain: {
    system: `You are an expert at plain language translation. Rewrite complex content in simple, everyday language that anyone — regardless of background — can understand. No jargon. Short sentences. Use examples.`,
    prefix: 'Explain this in plain, everyday language that anyone can understand. '
  },
  decisions: {
    system: `You are a decision analyst. Identify every decision point, recommendation, and choice described in or implied by this document. Present what decision is needed, what the options are, and what the document recommends.`,
    prefix: 'What are the key decisions and recommendations in this document? '
  }
};

async function callClaude(apiKey, system, userContent) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      temperature: 0.3,
      system,
      messages: [{ role: 'user', content: userContent }]
    })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || 'Claude API error');
  return data.content?.[0]?.text || '';
}

function buildContext(documents) {
  let total = 0;
  const parts = [];
  for (const doc of documents) {
    if (total >= MAX_TOTAL_CHARS) break;
    const limit   = Math.min(MAX_DOC_CHARS, MAX_TOTAL_CHARS - total);
    const text    = (doc.text || '').slice(0, limit);
    const clipped = (doc.text || '').length > limit;
    parts.push(`📄 ${doc.name}\n${'─'.repeat(50)}\n${text}${clipped ? '\n\n[Document continues beyond shown portion]' : ''}`);
    total += text.length;
  }
  return parts.join('\n\n═══\n\n');
}

// POST /api/documents/ask
router.post('/ask', optionalAuth, async (req, res) => {
  const { question, documents, studyMode = 'free', language = 'en' } = req.body;
  if (!question || !documents?.length)
    return res.status(400).json({ success: false, error: 'Question and at least one document are required.' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ success: false, error: 'API not configured.' });

  const mode       = STUDY_MODES[studyMode] || STUDY_MODES.free;
  const context    = buildContext(documents);
  const langNote   = language && language !== 'en' ? '\n\nRespond in the same language as the question.' : '';
  const userContent = `[DOCUMENTS]\n${context}\n\n[QUESTION]\n${mode.prefix}${question}${langNote}`;

  try {
    const content = await callClaude(key, mode.system, userContent);
    res.json({ success: true, content });
  } catch (e) {
    console.error('[Documents/ask]', e.message);
    res.status(500).json({ success: false, error: 'Analysis failed. Please try again.' });
  }
});

// POST /api/documents/overview — initial overview when docs uploaded
router.post('/overview', optionalAuth, async (req, res) => {
  const { documents } = req.body;
  if (!documents?.length)
    return res.status(400).json({ success: false, error: 'Documents required.' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ success: false, error: 'API not configured.' });

  const context     = buildContext(documents);
  const system      = `You are Forge Document Intelligence. Be helpful, concise, and welcoming to students.`;
  const userContent = `[DOCUMENTS UPLOADED]\n${context}\n\n[TASK]\nIn 2-3 sentences describe what these documents contain. Then suggest exactly 4 specific, practical questions a student might ask — make them directly relevant to the actual content. Number the suggestions 1-4.`;

  try {
    const content = await callClaude(key, system, userContent);
    res.json({ success: true, content });
  } catch (e) {
    console.error('[Documents/overview]', e.message);
    res.status(500).json({ success: false, error: 'Could not generate overview.' });
  }
});


// ── Domain fingerprinting ─────────────────────────────────────────────────────
function fingerprintDocument(text) {
  const t = text.toLowerCase();
  if (/abstract|methodology|hypothesis|citations|references|doi|journal|peer.review/.test(t))
    return { domain: 'academic', label: '🎓 Academic / Research' };
  if (/diagnosis|patient|treatment|medication|dosage|symptoms|clinical|medical/.test(t))
    return { domain: 'medical', label: '🏥 Medical / Clinical' };
  if (/clause|whereas|herein|liability|indemnify|jurisdiction|agreement|contract/.test(t))
    return { domain: 'legal', label: '⚖️ Legal / Contract' };
  if (/revenue|ebitda|cashflow|balance sheet|profit|loss|forecast|budget|chf|usd|eur/.test(t))
    return { domain: 'financial', label: '💰 Financial' };
  if (/ingredients|tbsp|tsp|preheat|bake|simmer|recipe|serves|cup of|flour|butter/.test(t))
    return { domain: 'culinary', label: '🍳 Recipe / Culinary' };
  if (/kpi|roadmap|stakeholder|deliverable|milestone|objective|strategy|revenue target/.test(t))
    return { domain: 'business', label: '📊 Business / Strategy' };
  if (/lesson plan|curriculum|learning objective|assessment|rubric|grade|classroom/.test(t))
    return { domain: 'education', label: '📚 Education / Teaching' };
  return { domain: 'general', label: '📄 General Document' };
}

// ── Analysis mode definitions ─────────────────────────────────────────────────
const ANALYSIS_MODES = {
  summary: {
    name: 'Summary',
    system: 'You are a world-class document analyst. Provide a clear, structured summary of the document. Use sections where appropriate. Be concise but complete — capture the main purpose, key arguments, and conclusions. Adapt your style to the document type.',
    prompt: 'Provide a comprehensive summary of this document.'
  },
  keypoints: {
    name: 'Key Points',
    system: 'You are an expert at extracting the most important information from documents. Extract the key points, facts, figures, and insights. Use bullet points. Prioritise by importance. Include specific numbers, dates, and names where relevant.',
    prompt: 'Extract the most important key points from this document.'
  },
  actions: {
    name: 'Action Items',
    system: 'You are an expert at identifying actionable information. Extract all tasks, recommendations, next steps, deadlines, and obligations from the document. Format as a clear action list with owner and deadline where available. If no explicit actions exist, identify implied actions.',
    prompt: 'What are all the action items, recommendations, and next steps in this document?'
  },
  risks: {
    name: 'Risks & Flags',
    system: 'You are a careful analyst who identifies risks, warnings, concerns, and important flags in documents. Look for: deadlines, obligations, warnings, contradictions, missing information, and anything requiring attention. Use 🔴 critical, 🟡 notable, 🟢 positive format.',
    prompt: 'What are the risks, concerns, warnings, and important flags in this document?'
  },
  numbers: {
    name: 'Data & Numbers',
    system: 'You are a precise data analyst. Extract all significant numbers, statistics, dates, financial figures, measurements, and quantitative data from the document. Present in a structured format. Group by category where useful.',
    prompt: 'Extract all important numbers, dates, statistics, and quantitative data from this document.'
  }
};

// Domain-specific system prompt additions
const DOMAIN_CONTEXT = {
  academic:   'This is an academic document. Pay attention to methodology, findings, and conclusions. Cite section names when referencing content.',
  medical:    'This is a medical document. Flag any clinical recommendations, contraindications, dosages, or urgent findings clearly.',
  legal:      'This is a legal document. Identify key obligations, rights, deadlines, and clauses. Note any unusual or potentially problematic terms.',
  financial:  'This is a financial document. Extract all figures accurately. Identify variances, trends, and any numbers that deviate significantly from context.',
  culinary:   'This is a recipe or culinary document. Extract ingredients with quantities, steps in order, timing, temperatures, and any tips or variations.',
  business:   'This is a business document. Focus on objectives, KPIs, decisions required, risks, and recommended actions.',
  education:  'This is an educational document. Identify learning objectives, key concepts, assessment criteria, and practical applications.',
  general:    ''
};

// ── Self-review pass ───────────────────────────────────────────────────────────
const DOC_REVIEW_FLAGS = [
  /this (person|individual|author) (is|seems|appears) (wrong|incorrect|bad)/i,
  /you should (fire|dismiss|report)/i,
  /i (have been|am) (instructed|programmed|designed)/i,
  /as (an ai|an llm|a language model)/i,
  /my (guidelines|instructions|training)/i,
];

async function selfReview(apiKey, content) {
  const needsReview = DOC_REVIEW_FLAGS.some(p => p.test(content));
  if (!needsReview) return content;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5', max_tokens: 1500, temperature: 0.1,
        system: 'You are an editorial reviewer. Remove any language that blames individuals, gives operational directives, or narrates AI guidelines. Return only the corrected text.',
        messages: [{ role: 'user', content }]
      })
    });
    const data = await resp.json();
    return data.content?.[0]?.text || content;
  } catch(e) { return content; }
}

// POST /api/documents/analyze — parallel multi-mode analysis
router.post('/analyze', optionalAuth, async (req, res) => {
  const { documents: docs, modes = ['summary','keypoints','actions','risks'] } = req.body;
  if (!docs?.length) return res.status(400).json({ success: false, error: 'Documents required.' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ success: false, error: 'API not configured.' });

  const context = buildContext(docs);
  const fullText = docs.map(d => d.text || '').join(' ');
  const fingerprint = fingerprintDocument(fullText);
  const domainCtx = DOMAIN_CONTEXT[fingerprint.domain] || '';

  // Proactive insights
  const insightSystem = 'You are a senior analyst. Scan this document and identify the 3 most important things the reader should know immediately. Use: 🔴 critical, 🟡 notable, 🟢 positive. Maximum 2 sentences each. No intro text.';
  const insightPrompt = '[DOCUMENT]\n' + context + '\n\nWhat are the 3 most important things to know about this document?';

  const modeList = modes.filter(m => ANALYSIS_MODES[m]);

  const [insights, ...results] = await Promise.all([
    callClaude(key, insightSystem, insightPrompt).catch(() => ''),
    ...modeList.map(async modeId => {
      const mode = ANALYSIS_MODES[modeId];
      const system = mode.system + (domainCtx ? ' ' + domainCtx : '');
      const userContent = '[DOCUMENT]\n' + context + '\n\n' + mode.prompt;
      try {
        const raw = await callClaude(key, system, userContent);
        const reviewed = await selfReview(key, raw);
        return { id: modeId, name: mode.name, content: reviewed };
      } catch(e) {
        return { id: modeId, name: mode.name, content: 'Analysis unavailable — please try again.' };
      }
    })
  ]);

  res.json({ success: true, results, insights, domain: fingerprint });
});

module.exports = router;
