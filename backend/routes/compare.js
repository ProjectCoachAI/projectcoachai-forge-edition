const express = require('express');
const https = require('https');
const router = express.Router();
const { optionalAuth } = require('../middleware/auth');
const { getUserProviderKey } = require('./connections');

// Rate limiter: IP-based, daily limit for anonymous users
const usageMap = new Map();
const DAILY_LIMIT = 5;

function getRateLimitKey(req) {
    return req.ip || req.connection.remoteAddress || 'unknown';
}

function checkRateLimit(req) {
    const key = getRateLimitKey(req);
    const today = new Date().toISOString().slice(0, 10);
    const entry = usageMap.get(key) || { date: today, count: 0 };

    if (entry.date !== today) {
        entry.date = today;
        entry.count = 0;
    }

    if (entry.count >= DAILY_LIMIT) {
        return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

function incrementRateLimit(req) {
    const key = getRateLimitKey(req);
    const today = new Date().toISOString().slice(0, 10);
    const entry = usageMap.get(key) || { date: today, count: 0 };

    if (entry.date !== today) {
        entry.date = today;
        entry.count = 0;
    }

    entry.count++;
    usageMap.set(key, entry);
}

// ===== AI API CALLERS =====

function callClaudeAPI(prompt, apiKey, maxTokens = 1024) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-sonnet-4-20250514',  // stable — check Anthropic deprecation notices periodically
            max_tokens: maxTokens,
            temperature: 0.3,
            system: 'You are a helpful AI assistant. Provide clear, concise, well-structured answers. Use markdown formatting.',
            messages: [{ role: 'user', content: prompt }]
        });

        const options = {
            hostname: 'api.anthropic.com',
            port: 443,
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200 && parsed.content && parsed.content.length > 0) {
                        resolve(parsed.content[0].text);
                    } else {
                        reject(new Error(parsed.error?.message || `Claude API error (${res.statusCode})`));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Claude response'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Claude API timeout')); });
        req.write(body);
        req.end();
    });
}

function callOpenAIAPI(prompt, apiKey) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'gpt-4o-mini',
            max_tokens: 1024,
            temperature: 0.3,
            messages: [
                { role: 'system', content: 'You are a helpful AI assistant. Provide clear, concise, well-structured answers. Use markdown formatting.' },
                { role: 'user', content: prompt }
            ]
        });

        const options = {
            hostname: 'api.openai.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200 && parsed.choices && parsed.choices.length > 0) {
                        resolve(parsed.choices[0].message.content);
                    } else {
                        reject(new Error(parsed.error?.message || `OpenAI API error (${res.statusCode})`));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse OpenAI response'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('OpenAI API timeout')); });
        req.write(body);
        req.end();
    });
}

function callGeminiAPI(prompt, apiKey) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024
            },
            systemInstruction: {
                parts: [{ text: 'You are a helpful AI assistant. Provide clear, concise, well-structured answers. Use markdown formatting.' }]
            }
        });

        const options = {
            hostname: 'generativelanguage.googleapis.com',
            port: 443,
            path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200 && parsed.candidates && parsed.candidates.length > 0) {
                        const parts = parsed.candidates[0].content?.parts || [];
                        // Gemini 2.5 Flash is a thinking model — skip thought parts, grab the actual text
                        const textPart = parts.filter(p => !p.thought).pop();
                        const text = textPart?.text;
                        if (text) {
                            resolve(text);
                        } else {
                            reject(new Error('Empty Gemini response'));
                        }
                    } else {
                        reject(new Error(parsed.error?.message || `Gemini API error (${res.statusCode})`));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Gemini response'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => { req.destroy(); reject(new Error('Gemini API timeout')); });
        req.write(body);
        req.end();
    });
}

// Fast Claude Haiku caller for synthesis (much faster than Sonnet 4)
// Uses alias ID "claude-haiku-4.5" so it auto-resolves to the latest Haiku version
function callClaudeHaikuAPI(prompt, apiKey, maxTokens = 2048) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: maxTokens,
            temperature: 0.2,
            system: 'You are an expert AI analyst. Be precise and follow formatting instructions exactly.',
            messages: [{ role: 'user', content: prompt }]
        });

        const options = {
            hostname: 'api.anthropic.com',
            port: 443,
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200 && parsed.content && parsed.content.length > 0) {
                        resolve(parsed.content[0].text);
                    } else {
                        reject(new Error(parsed.error?.message || `Claude Haiku API error (${res.statusCode})`));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Claude Haiku response'));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Claude Haiku API timeout')); });
        req.write(body);
        req.end();
    });
}

// ── OpenAI-compatible generic caller (Mistral, DeepSeek, Perplexity, Grok) ──
function callOpenAICompatible(prompt, apiKey, hostname, path, model) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            model,
            max_tokens: 1024,
            temperature: 0.3,
            messages: [
                { role: 'system', content: 'You are a helpful AI assistant. Provide clear, concise, well-structured answers. Use markdown formatting.' },
                { role: 'user', content: prompt }
            ]
        });
        const options = {
            hostname, port: 443, path, method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200 && parsed.choices?.[0]) {
                        resolve(parsed.choices[0].message.content);
                    } else {
                        reject(new Error(parsed.error?.message || `API error (${res.statusCode})`));
                    }
                } catch (e) { reject(new Error('Failed to parse response')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('API timeout')); });
        req.write(body);
        req.end();
    });
}

function callMistralAPI(prompt, apiKey) {
    return callOpenAICompatible(prompt, apiKey, 'api.mistral.ai', '/v1/chat/completions', 'mistral-small-latest');
}

function callDeepSeekAPI(prompt, apiKey) {
    return callOpenAICompatible(prompt, apiKey, 'api.deepseek.com', '/v1/chat/completions', 'deepseek-chat');
}

function callPerplexityAPI(prompt, apiKey) {
    return callOpenAICompatible(prompt, apiKey, 'api.perplexity.ai', '/chat/completions', 'sonar');
}

function callGrokAPI(prompt, apiKey) {
    return callOpenAICompatible(prompt, apiKey, 'api.x.ai', '/v1/chat/completions', 'grok-3-fast');
}

// POE uses a different API — subscription-based access via Quora
function callPOEAPI(prompt, apiKey) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            query: [{ role: 'user', content: prompt }],
            bot: 'Assistant',
            api_key: apiKey,
        });
        const options = {
            hostname: 'api.poe.com', port: 443,
            path: '/bot/Assistant',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'Content-Length': Buffer.byteLength(body)
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    const text = parsed.text || parsed.response || parsed.choices?.[0]?.message?.content;
                    if (text) resolve(text);
                    else reject(new Error(parsed.error || `POE API error (${res.statusCode})`));
                } catch (e) { reject(new Error('Failed to parse POE response')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('POE API timeout')); });
        req.write(body);
        req.end();
    });
}



function synthesizeResponses(prompt, responses, apiKey) {
    const responsesText = Object.entries(responses)
        .filter(([, r]) => !r.error && r.content)
        .map(([model, r]) => `=== ${model.toUpperCase()} ===\n${r.content}`)
        .join('\n\n');

    if (!responsesText) return Promise.resolve(null);

    const synthPrompt = `You are an expert AI analyst. The user asked: "${prompt}"

Below are responses from multiple AI models. Your job:
1. Rank the responses by quality (accuracy, depth, clarity, practicality)
2. Assess how much the models AGREE or DISAGREE on the core answer (confidence score 0-100)
3. Create a SYNTHESIZED BEST ANSWER that combines the strongest elements from all responses
4. Suggest 3 follow-up questions the user might want to explore next

Format your response EXACTLY as:

## Rankings
1. **[Model Name]** — [1-line reason]
2. **[Model Name]** — [1-line reason]
3. **[Model Name]** — [1-line reason]

## Confidence: [NUMBER]%
[One sentence: do models agree or disagree, and on what?]

## Synthesized Best Answer
[The combined, superior answer here]

## Explore Next
- [Follow-up question 1]
- [Follow-up question 2]
- [Follow-up question 3]

---
Responses:
${responsesText}`;

    return callClaudeHaikuAPI(synthPrompt, apiKey, 2048);
}

function parseRanking(synthesisText) {
    if (!synthesisText) return [];

    const rankings = [];
    const lines = synthesisText.split('\n');
    const modelMap = { chatgpt: 'chatgpt', openai: 'chatgpt', gpt: 'chatgpt', claude: 'claude', anthropic: 'claude', gemini: 'gemini', google: 'gemini', mistral: 'mistral', deepseek: 'deepseek', perplexity: 'perplexity', grok: 'grok', poe: 'poe' };

    const knownModels = Object.keys(modelMap);
    for (const line of lines) {
        const match = line.match(/^\d+\.\s*\*?\*?\[?(\w+)/i);
        if (match) {
            const raw = match[1].toLowerCase();
            const model = modelMap[raw];
            // Only add if it maps to a known AI provider — ignore markdown headings
            if (model && !rankings.find(r => r.model === model)) {
                rankings.push({ model, rank: rankings.length + 1 });
            }
        }
    }

    return rankings;
}

function extractSynthesisBody(synthesisText) {
    if (!synthesisText) return '';
    const marker = '## Synthesized Best Answer';
    const idx = synthesisText.indexOf(marker);
    if (idx === -1) return synthesisText;
    let body = synthesisText.slice(idx + marker.length).trim();
    const nextSection = body.indexOf('## Explore Next');
    if (nextSection !== -1) body = body.slice(0, nextSection).trim();
    return body;
}

function extractConfidence(synthesisText) {
    if (!synthesisText) return null;
    const match = synthesisText.match(/## Confidence:\s*(\d+)%\s*\n(.+)/);
    if (!match) return null;
    const score = parseInt(match[1], 10);
    const explanation = match[2].trim();
    let level = 'HIGH';
    if (score < 50) level = 'LOW';
    else if (score < 75) level = 'MEDIUM';
    return { score, level, explanation };
}

function extractSuggestedQuestions(synthesisText) {
    if (!synthesisText) return [];
    const marker = '## Explore Next';
    const idx = synthesisText.indexOf(marker);
    if (idx === -1) return [];
    const block = synthesisText.slice(idx + marker.length).trim();
    const questions = [];
    for (const line of block.split('\n')) {
        const m = line.match(/^[-*]\s+(.+)/);
        if (m) questions.push(m[1].trim());
    }
    return questions.slice(0, 4);
}

// ── MAIN ROUTE ──────────────────────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
    const { prompt, models } = req.body;

    if (!prompt || !prompt.trim()) {
        return res.status(400).json({ success: false, error: 'Prompt is required.' });
    }
    if (!models || !Array.isArray(models) || models.length < 1) {
        return res.status(400).json({ success: false, error: 'Select at least 1 model.' });
    }

    const isQuickChat     = req.body.quickchat === true || models.length === 1;
    const isAuthenticated = Boolean(req.user);
    const isUnlimited     = req.headers['x-lite-plan'] === 'unlimited' || isAuthenticated;

    if (!isUnlimited) {
        const rateCheck = checkRateLimit(req);
        if (!rateCheck.allowed) {
            return res.status(429).json({ success: false, error: 'Daily free limit reached. Sign in to continue.', remaining: 0 });
        }
    }

    // Forge's own keys — used as fallback for unauthed users & always for synthesis
    const forgeKeys = {
        claude:     process.env.ANTHROPIC_API_KEY  || process.env.CLAUDE_API_KEY,
        chatgpt:    process.env.OPENAI_API_KEY,
        gemini:     process.env.GOOGLE_AI_API_KEY  || process.env.GEMINI_API_KEY,
        mistral:    process.env.Mistral_AI_API_Key  || process.env.MISTRAL_API_KEY || null,
        deepseek:   process.env.DeepSeek_API_Key || process.env.DEEPSEEK_API_KEY || null,
        perplexity: process.env.Perplexity_AI_API_Key || process.env.PERPLEXITY_API_KEY || null,
        grok:       process.env.Grok_AI_API_Key     || process.env.GROK_API_KEY || process.env.XAI_API_KEY || null,
        poe:        process.env.POE_AI_API_Key       || process.env.POE_API_KEY || null,
    };

    // Resolve per-model key: user's own key first, Forge's key as fallback
    const apiKeys = {};
    for (const model of models) {
        if (isAuthenticated && req.userEmail) {
            const userKey  = await getUserProviderKey(req.userEmail, model);
            apiKeys[model] = userKey || forgeKeys[model] || null;
        } else {
            apiKeys[model] = forgeKeys[model] || null;
        }
    }

    const unknownModels    = models.filter(m => apiKeys[m] === undefined);
    if (unknownModels.length > 0) {
        return res.status(500).json({ success: false, error: `Unknown model(s): ${unknownModels.join(', ')}.` });
    }

    const availableModels  = models.filter(m => apiKeys[m] !== null);
    const unavailableModels = models.filter(m => apiKeys[m] === null);

    if (availableModels.length === 0) {
        return res.status(503).json({
            success: false,
            error: isAuthenticated
                ? 'No connected providers. Add API keys in Profile → Connected AI Accounts.'
                : 'AI providers unavailable. Sign in and connect your own API keys.'
        });
    }

    console.log(`🚀 [Compare] "${prompt.slice(0, 80)}..." | ${availableModels.join(', ')}${isAuthenticated ? ' [user keys]' : ' [forge keys]'}`);
    if (unavailableModels.length > 0) console.log(`  ⚠️  Skipped (no key): ${unavailableModels.join(', ')}`);

    const callers = {
        claude:     (p) => callClaudeAPI(p, apiKeys.claude),
        chatgpt:    (p) => callOpenAIAPI(p, apiKeys.chatgpt),
        gemini:     (p) => callGeminiAPI(p, apiKeys.gemini),
        mistral:    (p) => callMistralAPI(p, apiKeys.mistral),
        deepseek:   (p) => callDeepSeekAPI(p, apiKeys.deepseek),
        perplexity: (p) => callPerplexityAPI(p, apiKeys.perplexity),
        grok:       (p) => callGrokAPI(p, apiKeys.grok),
        poe:        (p) => callPOEAPI(p, apiKeys.poe),
    };

    const results  = {};
    const startAll = Date.now();

    // Pre-fill unavailable models so frontend knows they were requested
    for (const model of unavailableModels) {
        results[model] = { content: null, error: 'Provider not connected. Add your API key in Profile → Connected AI Accounts.', elapsed: 0 };
    }

    const promises = availableModels.map(async (model) => {
        const t0 = Date.now();
        try {
            const content  = await callers[model](prompt);
            results[model] = { content, error: null, elapsed: Date.now() - t0 };
            console.log(`  ✅ ${model}: ${content.length} chars in ${results[model].elapsed}ms`);
        } catch (err) {
            results[model] = { content: null, error: err.message, elapsed: Date.now() - t0 };
            console.error(`  ❌ ${model}: ${err.message}`);
        }
    });

    await Promise.allSettled(promises);
    console.log(`  ⏱  Done in ${Date.now() - startAll}ms`);

    const successCount = Object.values(results).filter(r => r.content && !r.error).length;
    if (successCount === 0) {
        return res.status(502).json({ success: false, error: 'All AI models failed. Please try again.', responses: results });
    }

    if (!isUnlimited) incrementRateLimit(req);

    // Phase 1 — return provider responses immediately, don't wait for synthesis
    if (isQuickChat || successCount < 2 || !forgeKeys.claude) {
        return res.json({
            success: true,
            responses: results,
            ranking: [],
            synthesis: null,
            confidence: null,
            suggestedQuestions: [],
            remaining: isUnlimited ? null : getRemainingAfter(req),
            providers: { available: availableModels, unavailable: unavailableModels },
        });
    }

    // Phase 1 — send provider results immediately
    res.json({
        success: true,
        responses: results,
        ranking: [],
        synthesis: null,
        confidence: null,
        suggestedQuestions: [],
        synthesizing: true,
        remaining: isUnlimited ? null : getRemainingAfter(req),
        providers: { available: availableModels, unavailable: unavailableModels },
    });

    // Phase 2 — synthesis runs after response is sent (fire and forget via separate endpoint)
    // Synthesis result will be fetched by frontend via /api/synthesize directly
    console.log(`  ⏳ Synthesis will run via /api/synthesize`);
});

function getRemainingAfter(req) {
    const key = getRateLimitKey(req);
    const today = new Date().toISOString().slice(0, 10);
    const entry = usageMap.get(key) || { date: today, count: 0 };
    if (entry.date !== today) return DAILY_LIMIT;
    return Math.max(0, DAILY_LIMIT - entry.count);
}

module.exports = router;
