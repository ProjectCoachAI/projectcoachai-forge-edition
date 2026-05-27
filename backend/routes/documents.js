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

module.exports = router;
