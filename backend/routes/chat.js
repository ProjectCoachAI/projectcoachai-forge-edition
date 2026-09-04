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
const attachmentStorage = require('../lib/attachmentStorage');

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
    claude:     (messages, key, attachments) => cmp.callClaudeAPI(messages, key, 4096, attachments),
    chatgpt:    (messages, key, attachments) => cmp.callOpenAIAPI(messages, key, attachments),
    gemini:     (messages, key, attachments) => cmp.callGeminiAPI(messages, key, attachments),
    mistral:    (messages, key) => cmp.callMistralAPI(messages, key),
    deepseek:   (messages, key) => cmp.callDeepSeekAPI(messages, key),
    perplexity: (messages, key) => cmp.callPerplexityAPI(messages, key),
    grok:       (messages, key) => cmp.callGrokAPI(messages, key),
    meta:       (messages, key) => cmp.callMetaAPI(messages, key),
};

// Per-message attachment ceiling. Chosen against real, verified provider
// limits, not a round guess: Claude allows up to 100 images/request,
// Gemini up to ~900, but OpenAI/GPT-4o caps at 10 images CUMULATIVE
// across the entire conversation history (not just one message) — the
// most restrictive of the three, confirmed directly against Microsoft's
// published Azure OpenAI quota reference. 5 per message leaves headroom
// for at least two separate attachment turns in a conversation before
// nearing that ceiling, while still being a meaningful, genuine
// improvement over the previous one-at-a-time limit.
const MAX_ATTACHMENTS_PER_MESSAGE = 5;

// Confirmed directly against compare.js: only these three callXAPI
// functions accept an attachments parameter at all today (claude, chatgpt,
// gemini) — the other five have no image-handling code path whatsoever.
// Scoped explicitly here, rather than inferred implicitly from each
// caller's own arity, so this stays correct and obvious if a caller's
// signature ever changes for an unrelated reason.
const IMAGE_CAPABLE_MODELS = new Set(['claude', 'chatgpt', 'gemini']);

function genSessionId() {
    return 'chat_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// ── POST /api/chat — send a message, get a response (SSE streaming) ────────
router.post('/', requireAuth, async (req, res) => {
    const { sessionId, model, message, history, source, diaryEntryId, attachments } = req.body;

    if (!model || !MODEL_CALLERS[model]) {
        return res.status(400).json({ success: false, error: 'Invalid or unsupported model.' });
    }
    if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Message is required.' });
    }
    // Confirmed file-attachment support (images AND PDFs — see
    // IMAGE_CAPABLE_MODELS above, which now also covers PDF support since
    // all three of these providers were separately confirmed to support
    // PDF input too) only exists for these three providers today —
    // rejecting explicitly here, with an honest reason, rather than
    // silently ignoring the attachment or letting an unsupported
    // provider's own caller throw an unrelated-looking error.
    if (Array.isArray(attachments) && attachments.length) {
        if (!IMAGE_CAPABLE_MODELS.has(model)) {
            return res.status(400).json({ success: false, error: `File uploads aren't supported for ${model} yet — try Claude, ChatGPT, or Gemini.` });
        }
        if (attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
            return res.status(400).json({ success: false, error: `Please attach at most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.` });
        }
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
    //
    // Two-axis check (see checkAndIncrementChatContinueUsage's own
    // comment): entries/month (generous, user-facing) and messages/
    // entry (a guardrail, invisible in normal use) — replacing an
    // earlier, simpler per-message counter that had a real UX mismatch
    // (counting messages meant "3 free continues" actually meant "3
    // messages, ever, across everything combined").
    if (source === 'diary') {
        if (!diaryEntryId) {
            return res.status(400).json({ success: false, error: 'diaryEntryId is required for Diary-sourced continues.' });
        }
        const usage = await db.checkAndIncrementChatContinueUsage(req.userEmail, diaryEntryId, sessionId || null);
        if (!usage.allowed) {
            if (usage.reason === 'message_cap') {
                // Confirmed as a real, previously-misleading message —
                // "upgrade for higher limits" was shown even to genuine
                // paid subscribers already hitting their own, higher
                // cap, for whom upgrading changes nothing at all. Now
                // branches on the tier actually confirmed server-side
                // (isPaidTier), rather than assuming free tier by
                // default.
                const capMessage = usage.isPaidTier
                  ? `This conversation has reached its message limit (${usage.messageCount}/${usage.messageCap}) for your plan. Continue a different entry, or start a fresh conversation.`
                  : `This conversation has reached its message limit (${usage.messageCount}/${usage.messageCap}). Continue a different entry, or upgrade to Forge for up to ${usage.paidTierMessageCap} messages per conversation.`;
                return res.status(429).json({
                    success: false,
                    error: capMessage,
                    reason: 'message_cap'
                });
            }
            return res.status(429).json({
                success: false,
                error: `Monthly continue-in-Forge limit reached (${usage.entriesUsed}/${usage.entryLimit} entries). Upgrade for unlimited continues.`,
                reason: 'entry_limit',
                entriesUsed: usage.entriesUsed,
                entryLimit: usage.entryLimit
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
    const newUserMessage = { role: 'user', content: message };
    messages.push(newUserMessage);

    // Confirmed as a real, concrete fix (not the original design): earlier
    // this genuinely never persisted an uploaded image at all — only used
    // for the live API call, then discarded. attachmentStorage.js (the
    // same, existing infrastructure already used for captured PDFs/images
    // elsewhere) makes real persistence straightforward, so there's no
    // good reason to keep discarding it. Stored BEFORE the AI call below
    // so a slow/failed AI response can't leave an upload with nowhere to
    // go — files are saved regardless of whether the AI call succeeds.
    // Each stored URL is attached to newUserMessage.attachmentUrls
    // (plural — this now supports multiple files per message, up to
    // MAX_ATTACHMENTS_PER_MESSAGE), the exact object already being pushed
    // into messages/history above, so no separate re-matching step is
    // needed — persisting the reference is just setting one extra field
    // on an object already being saved.
    const storedAttachmentUrls = [];
    if (Array.isArray(attachments) && attachments.length) {
        for (const att of attachments.slice(0, MAX_ATTACHMENTS_PER_MESSAGE)) {
            if (!att || !att.base64) continue;
            try {
                const commaIdx = att.base64.indexOf(',');
                const rawBase64 = commaIdx !== -1 ? att.base64.slice(commaIdx + 1) : att.base64;
                const buffer = Buffer.from(rawBase64, 'base64');
                const stored = await attachmentStorage.store({
                    buffer,
                    contentType: att.mimeType || (att.type === 'pdf' ? 'application/pdf' : 'image/jpeg'),
                    userEmail: req.userEmail,
                    filenameHint: 'chat-upload'
                });
                storedAttachmentUrls.push({ url: stored.url, type: att.type || 'image', filename: att.filename || null });
            } catch (storeErr) {
                // Genuinely non-fatal per-file — the AI call below still
                // works from the raw base64 regardless of whether storage
                // succeeded, so one file's storage failure shouldn't block
                // either the response or the other files in the same
                // message. Just means this specific file won't be
                // restorable on a later revisit.
                console.error('[Chat] attachment storage failed (non-fatal, continuing):', storeErr.message);
            }
        }
    }
    if (storedAttachmentUrls.length) newUserMessage.attachmentUrls = storedAttachmentUrls;

    const isStreaming = req.headers['accept'] === 'text/event-stream';

    // Fallback order when primary model fails
    const FALLBACKS = {
        meta: ['claude', 'chatgpt'], grok: ['claude', 'chatgpt'],
        perplexity: ['claude', 'chatgpt'], mistral: ['claude', 'chatgpt'],
        deepseek: ['claude', 'chatgpt'], gemini: ['claude', 'chatgpt'],
        chatgpt: ['claude'], claude: ['chatgpt']
    };

    async function callWithFallback(primaryModel, messages, attachments) {
        const forgeKeys = getForgeKeys();
        const tryModels = [primaryModel, ...(FALLBACKS[primaryModel] || [])];
        for (const m of tryModels) {
            const key = forgeKeys[m];
            if (!key || !MODEL_CALLERS[m]) continue;
            try {
                // Only ever passed to a model actually in IMAGE_CAPABLE_MODELS
                // — confirmed safe to pass uniformly through every fallback
                // attempt here specifically because every fallback target for
                // claude/chatgpt/gemini (the only models attachments can ever
                // be set for, per the route's own validation above) is also
                // image-capable. A caller that doesn't accept a 3rd argument
                // (mistral, deepseek, etc.) simply ignores the extra
                // parameter, per normal JS semantics — but those models can
                // never be reached with attachments set in the first place.
                const result = await MODEL_CALLERS[m](messages, key, attachments);
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
        // Confirmed as a real, direct bug: `messages` here is the exact
        // same array (and same newUserMessage object reference) that
        // also gets persisted to the database with attachmentUrls
        // attached, for the revisit/re-render feature. Passing it
        // straight to an AI provider's own API sends that same field
        // along too — providers validate message shape strictly and
        // reject unrecognized fields outright (confirmed directly in
        // Railway logs: "messages.5.attachmentUrls: Extra inputs are
        // not permitted"). Stripped here into a separate, clean copy
        // for the actual API call only — the original `messages` array
        // used for persistence below is untouched.
        const messagesForApi = messages.map(m => {
            if (!m.attachmentUrls) return m;
            const { attachmentUrls, ...clean } = m;
            return clean;
        });

        // Confirmed directly in Railway logs: a conversation forked from
        // an already-extremely-long native thread can be so large from
        // the start that EVERY provider's own token limit is exceeded on
        // the very first message — 1,172,116 tokens seen in one real
        // case, roughly 6x even Claude's own 200k ceiling. Previously
        // this failed completely silently to the user, retried forever
        // with the exact same generic "temporarily unavailable" message
        // each time, since the real cause only ever appeared in server
        // logs. Checked here, BEFORE ever attempting a call that's
        // already guaranteed to fail for every provider — an honest,
        // specific error beats a repeatable, silent dead end. Rough
        // estimate (characters/4), not an exact token count — deliberately
        // conservative against ChatGPT's own 128k ceiling specifically,
        // since it's the smallest limit among this endpoint's supported
        // providers, so a conversation passing this check should have a
        // real shot with any of them.
        const approxCharCount = messagesForApi.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
        const approxTokenCount = Math.ceil(approxCharCount / 4);
        const MAX_SAFE_TOKENS = 100000;
        if (approxTokenCount > MAX_SAFE_TOKENS) {
            // Diagnostic breakdown — added after a report that this check
            // fired on a conversation the user was confident was NOT
            // actually that long, meaning the real cause might not be a
            // genuinely oversized native seed at all, but something else
            // inflating the count (a duplication bug, a runaway single
            // message, etc.). Included directly in the response itself
            // (not just server logs, which need separate Railway access)
            // so the very next occurrence is immediately diagnosable from
            // the browser's own network tab — pinpointing exactly which
            // message(s) are responsible, rather than only the aggregate
            // total.
            const perMessageBreakdown = messagesForApi.map((m, i) => ({
                index: i,
                role: m.role,
                chars: typeof m.content === 'string' ? m.content.length : 0,
                preview: (typeof m.content === 'string' ? m.content : '').slice(0, 80)
            }));
            console.error(`[Chat] Oversized conversation detected: ~${approxTokenCount} tokens across ${messagesForApi.length} messages. sessionId=${sessionId || '(new)'}`, JSON.stringify(perMessageBreakdown));
            return res.status(400).json({
                success: false,
                error: `This conversation is too long to continue — it's grown to roughly ${approxTokenCount.toLocaleString()} tokens, beyond what any AI model here can process in one request. This usually means it was forked from an already very long native conversation. Try forking a shorter one, or starting a fresh conversation instead.`,
                debugBreakdown: perMessageBreakdown,
                debugSessionId: sessionId || null,
                debugFirstMessages: messagesForApi.slice(0, 3).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 500) : m.content })),
                debugLastMessages: messagesForApi.slice(-3).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 500) : m.content }))
            });
        }

        const content = await callWithFallback(model, messagesForApi, attachments);
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
