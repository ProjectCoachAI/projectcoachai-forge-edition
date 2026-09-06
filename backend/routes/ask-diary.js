'use strict';
const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { callClaudeHaikuAPI } = require('./compare');

// System prompt built directly from the same facts confirmed and
// verified against the actual codebase this same session (help.html's
// own updated content, the pricing-card audit) — not guessed at
// separately. Kept in sync with those two files manually for now;
// worth revisiting if this ever needs to scale beyond hand-maintained
// facts (e.g. genuinely reading help.html's own content at request
// time instead of duplicating it here).
const SYSTEM_PROMPT = `You are "Ask Diary" — a friendly, direct support assistant for Diary, an AI-conversation saving and archiving product. Answer only from the facts below. If a question genuinely isn't covered by them, say you're not sure and suggest emailing support@projectcoachai.com — never guess or invent an answer.

WHAT DIARY IS
Diary lets people save any AI conversation (via a browser extension) into a permanent, searchable personal archive, and continue that conversation later without going back to the original site.

SAVING
Install the Diary extension, then click the Save button that appears after any AI response. Works with Claude, ChatGPT, Gemini, Perplexity, Mistral, DeepSeek, Grok, and Meta AI. Saves are always free and unlimited on every tier.

SEARCH
Use the search bar to find any saved entry by keyword, topic, category, AI source, or date range. Free accounts get 20 searches/day; Diary Pro has unlimited search.

CONTINUE CONVERSATION
Requires an already-saved entry to exist first — it's not a standalone feature, it's a way to keep talking with the AI directly from a saved entry, inside Diary, picking up exactly where the original conversation left off. There's no way to use Continue Conversation without first saving something. Once an entry is saved, someone is free to use only Continue Conversation on it going forward and never touch search at all — search isn't required, just available if wanted. Free accounts can continue up to 20 different entries per calendar month (resets on the 1st); Diary Pro removes this limit entirely. Separately, there's also a per-conversation guardrail on how many NEW messages one single continued conversation can grow by — 8 on free accounts, 50 on Pro — which applies even on Pro and exists to bound cost on the rare very-long conversation, not to interrupt normal use.

SYNC
Sync re-reads the original conversation to pull in anything new since an entry was last saved. Some AI providers render more slowly than others, so this can occasionally take a few extra seconds.

PRICING
Free: $0/month — unlimited saves, 20 searches/day, 20 Continue Conversation entries/month, auto-categorization and smart tags, Quick Answer, sharing via WhatsApp/Email/Print.
Diary Pro: $14.95/month, or $11.96/month billed yearly (20% off) — everything in Free, plus unlimited search and unlimited Continue Conversation.

SHARING AND EXPORT
Copy, WhatsApp, Email, and Print (which can also be used to save a PDF, via the browser's own print dialog). There is no dedicated Word export.

PRIVACY
Entries are stored in the user's own personal archive and are never shared or used for AI training.

FORGE (a different, separate product by the same team)
Forge is a full multi-AI decision platform — compares 8 AIs at once and synthesizes one best answer. It's a distinct product from Diary, not a Diary feature or tier.

Keep answers short and direct — a sentence or two for a simple question. Never make up a feature, price, or limit that isn't listed above.`;

router.post('/', optionalAuth, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'A question is required.' });
    }
    // Hard length cap on the incoming question itself — a genuine,
    // direct guard against someone pasting something enormous into
    // this endpoint specifically to run up cost, independent of the
    // askDiaryLimiter rate limit already applied at the server.js
    // registration level.
    const trimmedQuestion = question.trim().slice(0, 1000);

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Ask Diary is temporarily unavailable. Please email support@projectcoachai.com instead.' });
    }

    const fullPrompt = SYSTEM_PROMPT + '\n\nQuestion: ' + trimmedQuestion;
    // Haiku deliberately, not Sonnet 5 — this is a low-stakes,
    // narrow-scope Q&A task (answer from a fixed set of facts, not
    // open-ended reasoning), where fast/cheap is the right tradeoff,
    // consistent with the reasoning already applied to
    // callClaudeHaikuAPI's own existing use for Compare's synthesis
    // step.
    //
    // Real usage captured via onUsage and logged the same way as
    // Continue Conversation's own calls, via the same
    // diary_chat_usage table/pattern built earlier this session — so
    // Ask Diary's own real cost shows up in the command center too,
    // not a blind spot from day one. Only logged when a real,
    // logged-in user email is present — optionalAuth means this route
    // also serves not-yet-logged-in visitors on the public help page,
    // and diary_chat_usage's own user_email column is NOT NULL, so an
    // anonymous visitor's own usage genuinely can't be attributed to
    // any account at all; skipped rather than attempting an insert
    // that would just fail silently every single time regardless.
    const db = require('../lib/db');
    const answer = await callClaudeHaikuAPI(fullPrompt, apiKey, 500, function(usage) {
      if (req.userEmail) {
        db.logDiaryChatUsage(req.userEmail, 'ask-diary', 'claude-haiku-4-5-20251001', usage.inputTokens, usage.outputTokens);
      }
    });

    res.json({ success: true, answer });
  } catch (e) {
    console.error('[Ask Diary] failed:', e.message);
    res.status(500).json({ error: 'Something went wrong. Please try again, or email support@projectcoachai.com.' });
  }
});

module.exports = router;
