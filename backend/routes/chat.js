'use strict';
/**
 * routes/chat.js — Forge Chat: continue a multi-turn conversation with a single AI model.
 * Additive route — does not modify compare.js or synthesize.js behavior.
 */
const express = require('express');
const router  = express.Router();
const db      = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const cmp     = require('./compare');

// Forge's own keys (same pattern as compare.js / synthesize.js)
function getForgeKeys() {
    return {
        claude:     process.env.ANTHROPIC_API_KEY  || process.env.CLAUDE_API_KEY,
        chatgpt:    process.env.OPENAI_API_KEY,
        gemini:     process.env.GOOGLE_AI_API_KEY  || process.env.GEMINI_API_KEY,
        mistral:    process.env.Mistral_AI_API_Key  || process.env.MISTRAL_API_KEY || null,
        deepseek:   process.env.DeepSeek_API_Key || process.env.DEEPSEEK_API_KEY || null,
        perplexity: process.env.Perplexity_AI_API_Key || process.env.PERPLEXITY_API_KEY || null,
        grok:       process.env.Grok_AI_API_Key     || process.env.GROK_API_KEY || process.env.XAI_API_KEY || null,
        meta:       process.env.GROQ_API_KEY || process.env.Groq_API_Key || null,
    };
}

// Model -> caller function (all support array-of-messages as of compare.js update)
const MODEL_CALLERS = {
    claude:     (messages, key) => cmp.callClaudeAPI(messages, key),
    chatgpt:    (messages, key) => cmp.callOpenAIAPI(messages, key),
    gemini:     (messages, key) => cmp.callGeminiAPI(messages, key),
    mistral:    (messages, key) => cmp.callMistralAPI(messages, key),
    deepseek:   (messages, key) => cmp.callDeepSeekAPI(messages, key),
    perplexity: (messages, key) => cmp.callPerplexityAPI(messages, key),
    grok:       (messages, key) => cmp.callGrokAPI(messages, key),
    meta:       (messages, key) => cmp.callMetaAPI(messages, key),
};

function genSessionId() {
    return 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// ── POST /api/chat — send a message, get a response (SSE streaming) ────────
router.post('/', requireAuth, async (req, res) => {
    const { sessionId, model, message, history, source } = req.body;

    if (!model || !MODEL_CALLERS[model]) {
        return res.status(400).json({ success: false, error: 'Invalid or unsupported model.' });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Message is required.' });
    }

    // Continue-in-Forge gating (Diary Priority 9) — deliberately scoped
    // to ONLY requests explicitly tagged source:'diary', not applied to
    // this shared endpoint unconditionally. Forge's own, existing
    // chat.html already calls this same route today with no source
    // field at all — gating the endpoint itself, rather than this one
    // specific caller, would have silently changed a separate, already-
    // live feature's behavior as a side effect of Diary's own work,
    // which is a distinct decision explicitly left to whoever owns
    // Forge's cost/business side, not something to bundle in here.
    if (source === 'diary') {
        const usage = await db.checkAndIncrementChatContinueUsage(req.userEmail);
        if (!usage.allowed) {
            return res.status(429).json({
                success: false,
                error: `Monthly continue-in-Forge limit reached (${usage.used}/${usage.limit}). Upgrade for unlimited continues.`,
                used: usage.used,
                limit: usage.limit
            });
        }
    }

    const forgeKeys = getForgeKeys();
    const apiKey = forgeKeys[model];
    if (!apiKey) {
        return res.status(503).json({ success: false, error: `${model} is currently unavailable.` });
    }

    // Build message history: prior history (if any) + new user message
    let messages = Array.isArray(history) ? history.slice() : [];
    messages.push({ role: 'user', content: message });

    const isStreaming = req.headers['accept'] === 'text/event-stream';

    // Fallback order when primary model fails
    const FALLBACKS = {
        meta: ['claude', 'chatgpt'], grok: ['claude', 'chatgpt'],
        perplexity: ['claude', 'chatgpt'], mistral: ['claude', 'chatgpt'],
        deepseek: ['claude', 'chatgpt'], gemini: ['claude', 'chatgpt'],
        chatgpt: ['claude'], claude: ['chatgpt']
    };

    async function callWithFallback(primaryModel, messages) {
        const forgeKeys = getForgeKeys();
        const tryModels = [primaryModel, ...(FALLBACKS[primaryModel] || [])];
        for (const m of tryModels) {
            const key = forgeKeys[m];
            if (!key || !MODEL_CALLERS[m]) continue;
            try {
                const result = await MODEL_CALLERS[m](messages, key);
                if (m !== primaryModel) {
                    console.log(`[Chat] Fell back from ${primaryModel} to ${m}`);
                    try {
                        const { sendMail } = require('../lib/emailTransport');
                        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@projectcoachai.com';
                        sendMail({ from: 'Forge Alerts <noreply@projectcoachai.com>', to: ADMIN_EMAIL,
                            subject: `[Forge Alert] Rate limit fallback: ${primaryModel} → ${m}`,
                            html: `<p>${primaryModel} rate limited, fell back to ${m}.</p><p>${new Date().toISOString()}</p>`
                        }).catch(()=>{});
                    } catch(_) {}
                }
                return result;
            } catch(err) {
                console.error(`[Chat] ${m} failed:`, err.message);
                if (m === tryModels[tryModels.length - 1]) throw err;
            }
        }
    }

    try {
        const content = await callWithFallback(model, messages);
        messages.push({ role: 'assistant', content });

        // Persist session
        let sid = sessionId;
        try {
            if (sid) {
                const existing = await db.getChatSession(sid, req.userEmail);
                if (existing) {
                    await db.updateChatSession(sid, req.userEmail, messages);
                } else {
                    await db.createChatSession(sid, req.userEmail, model, messages, message.slice(0, 80));
                }
            } else {
                sid = genSessionId();
                await db.createChatSession(sid, req.userEmail, model, messages, message.slice(0, 80));
            }
        } catch (dbErr) {
            console.error('[Chat] session persist failed:', dbErr.message);
        }

        if (isStreaming) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();
            res.write(`data: ${JSON.stringify({ type: 'message', content, sessionId: sid })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            return res.end();
        }

        res.json({ success: true, content, sessionId: sid });
    } catch (err) {
        console.error(`[Chat] ${model} error:`, err.message);
        const isRateLimit = err.message && err.message.toLowerCase().includes('rate limit');
        const userError = isRateLimit
          ? 'This AI is temporarily busy. Please try again in a few minutes.'
          : 'The AI is temporarily unavailable. Please try again in a moment.';
        if (isRateLimit) {
          try {
            const { sendMail } = require('../lib/emailTransport');
            const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@projectcoachai.com';
            sendMail({ from: 'Forge Alerts <noreply@projectcoachai.com>', to: ADMIN_EMAIL,
              subject: `[Forge Alert] Rate limit: ${model}`,
              html: `<p><strong>${model}</strong> rate limited.</p><p>${err.message}</p><p>${new Date().toISOString()}</p>`
            }).catch(()=>{});
          } catch(_) {}
        }
        if (isStreaming) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.flushHeaders();
            res.write(`data: ${JSON.stringify({ type: 'error', error: userError })}\n\n`);
            return res.end();
        }
        res.status(500).json({ success: false, error: userError });
    }
});

// ── GET /api/chat/sessions — list recent chat sessions for the user ────────
router.get('/sessions', requireAuth, async (req, res) => {
    try {
        const sessions = await db.listChatSessions(req.userEmail, 20);
        res.json({ success: true, sessions });
    } catch (err) {
        console.error('[Chat] list sessions failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load sessions.' });
    }
});

// ── GET /api/chat/:sessionId — load a specific session ──────────────────────
router.get('/:sessionId', requireAuth, async (req, res) => {
    try {
        const session = await db.getChatSession(req.params.sessionId, req.userEmail);
        if (!session) return res.status(404).json({ success: false, error: 'Session not found.' });
        res.json({ success: true, session });
    } catch (err) {
        console.error('[Chat] get session failed:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load session.' });
    }
});

module.exports = router;
