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
const { voyageEmbed, toVectorLiteral } = require('../lib/embeddings');

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

// ── Conversation bridging (Option B: automatic session-bridging at the
// oversized-conversation ceiling) ───────────────────────────────────────────
// Confirmed launch-blocking: a real, month-long conversation (~1,835
// turns) hit the size ceiling with zero path forward except abandoning
// all prior context — exactly what Continue-in-Forge exists to prevent.
// This is deliberately Option B (bridge once, at the ceiling), not
// Option A (retrieval on every single message, forever, in every long
// conversation) — B closes the actual risk (nobody ever gets stranded
// with no way forward) with a much smaller, safer surface: retrieval
// only ever runs once per bridge event, not on every send. A remains
// real, valuable, prioritized post-launch work — continuous per-message
// retrieval quality is a refinement on top of a system that already
// never leaves anyone stranded, not a blocker to shipping that system.
//
// Old session's own messages are ALWAYS preserved as-is (never edited,
// never deleted) — a session with two unrelated features' messages
// genuinely interleaved couldn't be safely un-mixed by algorithm, so a
// bridge doesn't attempt to; it archives the original, then starts a
// new, seeded one. If oldSessionId is null (the exact real case
// confirmed live: the very first message of a brand-new session,
// already oversized from its own native seed, with nothing in
// chat_sessions yet at all), the old content is persisted as a genuine
// session first — so it's preserved and embeddable — before bridging
// from it.
const BRIDGE_RECENT_MESSAGES_TO_KEEP = 20; // ~10 turns verbatim, unsummarized
const BRIDGE_TOP_K_RETRIEVED = 15; // older turns pulled in via retrieval
async function bridgeConversation(oldSessionId, allMessages, model, userEmail, diaryEntryId) {
    try {
        // Checked directly here, before ever attempting an embed call —
        // confirmed as the single most likely cause of a bridge failure
        // for a genuinely new feature like this, and voyageEmbed() itself
        // only ever logs this to server logs (see its own comment), not
        // the response body, so this makes it immediately visible in
        // DevTools too without requiring separate Railway log access.
        if (!process.env.VOYAGE_API_KEY) {
            return { success: false, reason: 'voyage_api_key_not_set' };
        }
        await db.ensureChatMessageEmbeddingsTable();

        // Ensure the old session genuinely exists in chat_sessions —
        // needed both to preserve it (per the "archive, don't discard"
        // requirement) and because chat_message_embeddings' own foreign
        // key requires a real row to reference.
        let archivedSessionId = oldSessionId;
        if (!archivedSessionId) {
            archivedSessionId = genSessionId();
            await db.createChatSession(archivedSessionId, userEmail, model, allMessages, (allMessages[0] && allMessages[0].content || '').slice(0, 80));
        } else {
            await db.updateChatSession(archivedSessionId, userEmail, allMessages);
        }

        // The new message that triggered the overflow is the LAST
        // element — it's the query to retrieve against, not one of the
        // "older turns" to embed as a document alongside everything
        // before it.
        const olderMessages = allMessages.slice(0, -1);
        const newMessage = allMessages[allMessages.length - 1];

        // Skip re-embedding if this exact session was already bridged
        // from once before (e.g. a retried request after a prior,
        // partial failure) — genuinely non-fatal to check, and avoids
        // paying for duplicate embedding calls on retry.
        const existing = await db.query('SELECT COUNT(*) AS total FROM chat_message_embeddings WHERE session_id=$1', [archivedSessionId]);
        const alreadyEmbedded = parseInt((existing.rows[0] && existing.rows[0].total) || 0, 10) > 0;

        if (!alreadyEmbedded) {
            const texts = olderMessages.map(m => typeof m.content === 'string' ? m.content : '');
            const embeddings = await voyageEmbed(texts, 'document');
            if (!embeddings) return { success: false, reason: 'voyage_embed_document_failed' }; // Voyage unavailable — degrade to the existing error message below
            for (let i = 0; i < olderMessages.length; i++) {
                const vec = toVectorLiteral(embeddings[i]);
                if (!vec) continue; // an individual embed can fail without failing the whole batch
                await db.query(
                    `INSERT INTO chat_message_embeddings (session_id, message_index, role, content, embedding) VALUES ($1,$2,$3,$4,$5::vector)`,
                    [archivedSessionId, i, olderMessages[i].role, olderMessages[i].content, vec]
                );
            }
        }

        const queryEmbedding = await voyageEmbed(typeof newMessage.content === 'string' ? newMessage.content : '', 'query');
        if (!queryEmbedding) return { success: false, reason: 'voyage_embed_query_failed' };
        const queryVec = toVectorLiteral(queryEmbedding);

        // Exact cosine distance, scoped to this one session via the
        // btree index on session_id — see ensureChatMessageEmbeddingsTable's
        // own comment for why this is deliberately NOT an approximate
        // (ivfflat/hnsw) index: a single session's embedded turns are at
        // most a few thousand rows even for genuine outliers, nowhere
        // near where an approximate index earns its cost, and exact
        // search here gives perfect recall with no tuning burden.
        const retrievedR = await db.query(
            `SELECT role, content FROM chat_message_embeddings WHERE session_id=$1 AND embedding IS NOT NULL ORDER BY embedding <=> $2::vector ASC LIMIT $3`,
            [archivedSessionId, queryVec, BRIDGE_TOP_K_RETRIEVED]
        );
        const retrieved = retrievedR.rows;
        if (!retrieved.length) return { success: false, reason: 'no_embeddings_retrieved' }; // nothing usable retrieved — don't bridge into an empty context

        // Recent turns kept verbatim, unsummarized — the part of the
        // conversation someone's most likely referring to with "it"/
        // "that"/vague follow-ups, which retrieval alone handles poorly.
        const recentMessages = olderMessages.slice(-BRIDGE_RECENT_MESSAGES_TO_KEEP);

        // Excludes anything already covered by the verbatim recent
        // window, so the model doesn't see the same turn twice — a
        // small, deliberate imprecision (matches by exact content
        // string, not position, since retrievedR doesn't carry back its
        // own message_index): a coincidental duplicate string elsewhere
        // could be over-excluded, but worst case is one retrieved turn
        // omitted, never an incorrect one included.
        const retrievedFiltered = retrieved.filter(r => !recentMessages.some(rm => rm.content === r.content));

        const bridgeIntro = {
            role: 'user',
            content: 'This conversation has grown very long, so here are relevant excerpts retrieved from earlier in it, since they may be relevant to what I ask going forward:\n\n' +
                retrievedFiltered.map(m => `[${m.role === 'user' ? 'You' : 'AI'} said earlier]: ${m.content}`).join('\n\n')
        };
        const bridgeAck = { role: 'assistant', content: 'Understood — I have that earlier context in mind.' };

        const seededMessages = [bridgeIntro, bridgeAck, ...recentMessages, newMessage];

        const newSessionId = genSessionId();
        await db.createChatSession(newSessionId, userEmail, model, seededMessages, (newMessage.content || '').slice(0, 80));

        if (diaryEntryId) {
            await db.query(
                `UPDATE diary_entries SET metadata = jsonb_set(jsonb_set(jsonb_set(jsonb_set(COALESCE(metadata, '{}'::jsonb),
                    '{chatSessionId}', $1::jsonb), '{bridgedFromSessionId}', $2::jsonb), '{bridgedAt}', $3::jsonb), '{nativeSeedMessageCount}', $4::jsonb)
                 WHERE id=$5 AND user_email=$6`,
                [JSON.stringify(newSessionId), JSON.stringify(archivedSessionId), JSON.stringify(new Date().toISOString()), JSON.stringify(seededMessages.length - 1), diaryEntryId, userEmail]
            );
        }

        return { success: true, newSessionId, seededMessages, archivedSessionId };
    } catch (e) {
        console.warn('[Chat] Conversation bridging failed with an exception:', e.message, e.stack);
        return { success: false, reason: 'exception', error: e.message };
    }
}

// ── POST /api/chat — send a message, get a response (SSE streaming) ────────
router.post('/', requireAuth, async (req, res) => {
    let { sessionId, model, message, history, source, diaryEntryId, attachments } = req.body;

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
        let messagesForApi = messages.map(m => {
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
        let bridged = false;
        let bridgedFromSessionId = null;
        if (approxTokenCount > MAX_SAFE_TOKENS) {
            // Attempt to bridge BEFORE falling back to the oversized-
            // conversation error — see bridgeConversation's own comment
            // for the full reasoning. On success, messagesForApi/messages/
            // sid below are all replaced with the new, seeded session's
            // own values, and the request proceeds normally as if this
            // had simply been the first message of the new session —
            // only a bridged:true flag in the final response (plus the
            // pre-existing sessionId field, now the NEW session's own id)
            // signals to the frontend that this happened at all.
            const bridgeResult = await bridgeConversation(sessionId || null, messagesForApi, model, req.userEmail, diaryEntryId);
            if (bridgeResult.success) {
                bridged = true;
                bridgedFromSessionId = bridgeResult.archivedSessionId;
                messagesForApi = bridgeResult.seededMessages;
                messages = bridgeResult.seededMessages.slice();
                sessionId = bridgeResult.newSessionId;
            } else {
                // Diagnostic breakdown — investigated after a report of this
                // check firing on a conversation the user was confident was
                // NOT that long. Traced via debugSessionId (null, ruling out
                // any shared/cross-product database session) and confirmed
                // directly against the source Diary entry ("Load earlier
                // 1815 more") — this was a real, legitimate month-long
                // native thread, ~1,835 turns, not a bug of any kind. Kept
                // here regardless, since a future occurrence may not be:
                // this still distinguishes a genuinely oversized
                // conversation from some other, real cause inflating the
                // count. Reached now only if bridging itself genuinely
                // failed (e.g. Voyage unavailable) — a real degrade path,
                // not the default outcome for a large conversation anymore.
                const perMessageBreakdown = messagesForApi.map((m, i) => ({
                    index: i,
                    role: m.role,
                    chars: typeof m.content === 'string' ? m.content.length : 0,
                    preview: (typeof m.content === 'string' ? m.content : '').slice(0, 80)
                }));
                console.error(`[Chat] Oversized conversation detected AND bridging failed: ~${approxTokenCount} tokens across ${messagesForApi.length} messages. sessionId=${sessionId || '(new)'} bridgeFailureReason=${bridgeResult.reason || '(unknown)'} bridgeFailureError=${bridgeResult.error || '(none)'}`, JSON.stringify(perMessageBreakdown));
                return res.status(400).json({
                    success: false,
                    error: `This conversation has grown to roughly ${approxTokenCount.toLocaleString()} tokens — a sign you've been using it exactly as intended, without ever needing to restart. At this size, though, it's beyond what any AI model here can process in a single request yet, and we couldn't automatically continue it in a new, linked conversation just now. Please try again in a moment, or start a fresh conversation to keep going.`,
                    debugBreakdown: perMessageBreakdown,
                    debugSessionId: sessionId || null,
                    debugBridgeFailureReason: bridgeResult.reason || null,
                    debugBridgeFailureError: bridgeResult.error || null,
                    debugFirstMessages: messagesForApi.slice(0, 3).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 500) : m.content })),
                    debugLastMessages: messagesForApi.slice(-3).map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 500) : m.content }))
                });
            }
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
            // bridged/bridgedFromSessionId — so the frontend can show a
            // visible marker when a conversation was automatically
            // bridged (see bridgeConversation's own comment). Included
            // in both this streaming event and the non-streaming
            // response below; previously neither path carried this at
            // all, since bridging didn't exist yet when this response
            // shape was first built.
            res.write(`data: ${JSON.stringify({ type: 'message', content, sessionId: sid, bridged, bridgedFromSessionId, seededMessages: bridged ? messages : undefined })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            return res.end();
        }

        res.json({ success: true, content, sessionId: sid, bridged, bridgedFromSessionId, seededMessages: bridged ? messages : undefined });
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
