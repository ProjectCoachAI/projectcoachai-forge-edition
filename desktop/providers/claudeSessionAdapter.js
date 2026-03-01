function createClaudeSessionAdapter({
    callWithRetry,
    injectPromptForProvider,
    waitForClaudeComposerReady,
    claudeComposerSelectors = [],
    claudePollerSelectors = [],
    claudeDefaultLandingTokens = [],
    claudeContaminationTokens = []
}) {
    async function strictSend(view, prompt) {
        return view.webContents.executeJavaScript(`
            (() => {
                try {
                    const textToInject = ${JSON.stringify(prompt || '')};
                    const selectors = ${JSON.stringify(Array.from(claudeComposerSelectors || []))};
                    const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                    const getInputText = (el) => {
                        if (!el) return '';
                        if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return String(el.value || '');
                        return String(el.innerText || el.textContent || '');
                    };
                    const isVisible = (el) => {
                        if (!el) return false;
                        const rect = el.getBoundingClientRect();
                        const style = window.getComputedStyle(el);
                        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                    };
                    const composerSelectors = selectors.length ? selectors : [
                        'main form textarea',
                        'form textarea',
                        'textarea[placeholder*="Message"]',
                        'textarea[placeholder*="Reply"]',
                        'main [contenteditable="true"][role="textbox"]',
                        'main [contenteditable="true"]'
                    ];
                    const candidates = [];
                    composerSelectors.forEach((selector) => {
                        let nodes = [];
                        try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { nodes = []; }
                        nodes.forEach((el) => {
                            if (!isVisible(el)) return;
                            if (!el.closest('main, [role="main"]')) return;
                            const inSidebar = !!el.closest('aside, nav, [class*="sidebar"], [data-testid*="history"], [data-testid*="search"]');
                            if (inSidebar) return;
                            candidates.push(el);
                        });
                    });
                    if (!candidates.length) return false;
                    const input = candidates[0];
                    const promptNeedle = normalize(textToInject).slice(0, 48);
                    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
                        const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement?.prototype : window.HTMLInputElement?.prototype;
                        const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
                        if (descriptor && descriptor.set) descriptor.set.call(input, textToInject);
                        else input.value = textToInject;
                        input.focus();
                        if (input.setSelectionRange) input.setSelectionRange(textToInject.length, textToInject.length);
                        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                    } else {
                        input.focus();
                        input.textContent = textToInject;
                        input.innerText = textToInject;
                        input.dispatchEvent(new InputEvent('input', {
                            bubbles: true,
                            cancelable: true,
                            inputType: 'insertText',
                            data: textToInject
                        }));
                    }
                    const stagedPrompt = normalize(getInputText(input));
                    if (!stagedPrompt || (promptNeedle && !stagedPrompt.includes(promptNeedle))) return false;
                    const root = input.closest('form, main, [role="main"], article') || document;
                    const sendButtons = Array.from(root.querySelectorAll('button, [role="button"], [type="submit"], [data-testid]')).filter((btn) => {
                        if (!isVisible(btn) || btn.disabled) return false;
                        const type = String(btn.getAttribute('type') || '').toLowerCase();
                        const txt = String(btn.textContent || '').toLowerCase();
                        const label = String(btn.getAttribute('aria-label') || '').toLowerCase();
                        const testId = String(btn.getAttribute('data-testid') || '').toLowerCase();
                        return type === 'submit' || txt.includes('send') || label.includes('send') || label.includes('submit') || testId.includes('send');
                    });
                    const preSendText = normalize(getInputText(input));
                    if (sendButtons.length > 0) {
                        sendButtons[0].click();
                    } else {
                        input.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
                        }));
                        input.dispatchEvent(new KeyboardEvent('keyup', {
                            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
                        }));
                    }
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            const postSendText = normalize(getInputText(input));
                            if (promptNeedle && postSendText.includes(promptNeedle) && postSendText === preSendText) {
                                resolve(false);
                                return;
                            }
                            resolve(true);
                        }, 260);
                    });
                } catch (_) {
                    return false;
                }
            })();
        `);
    }

    async function sendPrompt(pane, prompt) {
        try {
            const ready = await waitForClaudeComposerReady(pane.view, 7000);
            if (!ready) {
                // fall through to retries; hidden panes can still become ready after this window
            }
        } catch (_) {
            // ignore readiness probe failures
        }
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            try {
                const ok = await strictSend(pane.view, prompt);
                if (ok) return true;
            } catch (_) {
                // continue retrying
            }
            if (attempt < maxAttempts - 1) {
                const waitMs = 600 * Math.pow(2, attempt);
                await new Promise((resolve) => setTimeout(resolve, waitMs));
            }
        }
        try {
            return Boolean(await injectPromptForProvider(pane.view, prompt, pane?.tool?.name || 'Claude'));
        } catch (_) {
            return false;
        }
    }

    async function waitForPromptEcho(view, prompt, timeoutMs = 5500) {
        const started = Date.now();
        while ((Date.now() - started) < timeoutMs) {
            try {
                const hasEcho = await view.webContents.executeJavaScript(`
                    (() => {
                        try {
                            const prompt = ${JSON.stringify(prompt || '')};
                            const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                            const normalizeLoose = (v) => normalize(v).replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
                            const fullNeedle = normalize(prompt);
                            const fullNeedleLoose = normalizeLoose(prompt);
                            const needle = fullNeedle.slice(0, 36);
                            const needleLoose = fullNeedleLoose.slice(0, 24);
                            if (!needle) return true;
                            const isVisible = (el) => {
                                if (!el) return false;
                                const rect = el.getBoundingClientRect();
                                const style = window.getComputedStyle(el);
                                return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                            };
                            const selectors = [
                                '[data-message-author-role="user"]',
                                '[data-role="user"]',
                                '[class*="user"]',
                                '[class*="human"]',
                                '[data-testid*="conversation-turn"]',
                                'main article',
                                '[role="article"]'
                            ];
                            const latestUserText = () => {
                                const candidates = [];
                                for (const selector of selectors) {
                                    let nodes = [];
                                    try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { nodes = []; }
                                    for (const node of nodes) {
                                        if (!isVisible(node)) continue;
                                        const txt = normalize(node.innerText || node.textContent || '');
                                        if (!txt) continue;
                                        const rect = node.getBoundingClientRect();
                                        candidates.push({ txt, y: rect.top, x: rect.left });
                                    }
                                }
                                if (!candidates.length) return '';
                                candidates.sort((a, b) => (a.y - b.y) || (a.x - b.x));
                                return String(candidates[candidates.length - 1].txt || '');
                            };
                            const latest = latestUserText();
                            const latestLoose = normalizeLoose(latest);
                            if (latest && fullNeedle && latest.includes(fullNeedle)) return true;
                            if (latestLoose && needleLoose && latestLoose.includes(needleLoose)) return true;
                            for (const selector of selectors) {
                                let nodes = [];
                                try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { nodes = []; }
                                for (const node of nodes) {
                                    if (!isVisible(node)) continue;
                                    const txt = normalize(node.innerText || node.textContent || '');
                                    const txtLoose = normalizeLoose(txt);
                                    if (txt && txt.includes(needle)) return true;
                                    if (txtLoose && needleLoose && txtLoose.includes(needleLoose)) return true;
                                }
                            }
                            return false;
                        } catch (_) {
                            return false;
                        }
                    })();
                `);
                if (hasEcho) return true;
            } catch (_) {
                // Continue polling while pane settles.
            }
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
        return false;
    }

    async function extractResponse(pane, runPrompt = '') {
        try {
            const result = await pane.view.webContents.executeJavaScript(`
                (() => {
                    try {
                        const prompt = ${JSON.stringify(runPrompt || '')};
                        const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                        const normalizeLoose = (v) => normalize(v).replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
                        const strongUiNoiseTokens = [
                            'sonnet 4.6',
                            'extended thinking',
                            'most efficient for everyday tasks',
                            'more models',
                            'think longer for complex tasks',
                            'claude is ai and can make mistakes'
                        ];
                        const debugLast = (window.__projectcoachDebug && typeof window.__projectcoachDebug.getLastResponse === 'function')
                            ? String(window.__projectcoachDebug.getLastResponse() || '').trim()
                            : '';
                        const isVisible = (el) => {
                            if (!el) return false;
                            const rect = el.getBoundingClientRect();
                            const style = window.getComputedStyle(el);
                            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                        };
                        const queryAllDeep = (selector) => {
                            const roots = [document];
                            const collected = [];
                            for (let i = 0; i < roots.length; i += 1) {
                                const root = roots[i];
                                let nodes = [];
                                try { nodes = Array.from(root.querySelectorAll(selector)); } catch (_) { nodes = []; }
                                collected.push(...nodes);
                                let hostCandidates = [];
                                try { hostCandidates = Array.from(root.querySelectorAll('*')); } catch (_) { hostCandidates = []; }
                                for (const host of hostCandidates) {
                                    if (host && host.shadowRoot && !roots.includes(host.shadowRoot)) {
                                        roots.push(host.shadowRoot);
                                    }
                                }
                            }
                            return collected;
                        };
                        const latestBySelectors = (selectors) => {
                            const candidates = [];
                            for (const selector of selectors) {
                                const nodes = queryAllDeep(selector);
                                for (const node of nodes) {
                                    if (!isVisible(node)) continue;
                                    if (node.closest('aside, nav, [class*="sidebar"], [data-testid*="history"], [data-testid*="search"]')) continue;
                                    const txt = String(node.innerText || node.textContent || '').trim();
                                    if (txt.length < 40) continue;
                                    const rect = node.getBoundingClientRect();
                                    candidates.push({ txt, y: rect.top, x: rect.left });
                                }
                            }
                            if (!candidates.length) return '';
                            candidates.sort((a, b) => (a.y - b.y) || (a.x - b.x));
                            return String(candidates[candidates.length - 1].txt || '').trim();
                        };
                        const stripClaudeUiTail = (value) => {
                            return String(value || '')
                                .replace(/\n?Claude is AI and can make mistakes[\s\S]*$/i, '')
                                .replace(/\n?Ask a follow-up[\s\S]*$/i, '')
                                .replace(/\n?Recents[\s\S]*$/i, '')
                                .replace(/\n?Hide details[\s\S]*$/i, '')
                                .trim();
                        };
                        const isLikelyUiNoise = (value) => {
                            const n = normalize(value);
                            if (!n) return true;
                            let hits = 0;
                            for (const token of strongUiNoiseTokens) {
                                if (token && n.includes(token)) hits += 1;
                            }
                            // Treat model-picker clusters as contamination, but avoid over-dropping valid replies.
                            if (hits >= 2 && n.length < 1200) return true;
                            if (hits >= 1 && n.length < 220) return true;
                            return false;
                        };
                        let candidate = latestBySelectors(${JSON.stringify(Array.from(claudePollerSelectors || []))});
                        if (!candidate) {
                            candidate = latestBySelectors([
                                '[data-message-author-role="assistant"]',
                                '[data-role="assistant"]',
                                'main article',
                                'main [role="article"]',
                                '[class*="assistant"]',
                                '.markdown',
                                '.prose',
                                '[class*="message"]'
                            ]);
                        }
                        candidate = stripClaudeUiTail(candidate);
                        if (candidate && isLikelyUiNoise(candidate)) {
                            candidate = '';
                        }
                        if (!candidate && debugLast.length > 40) {
                            candidate = stripClaudeUiTail(debugLast);
                            if (isLikelyUiNoise(candidate)) {
                                candidate = '';
                            }
                        }
                        if (!candidate && prompt) {
                            const promptLoose = normalizeLoose(prompt);
                            const promptNeedleLoose = String(promptLoose || '').slice(0, 24);
                            const userSelectors = [
                                '[data-message-author-role="user"]',
                                '[data-role="user"]',
                                '[class*="user"]',
                                '[class*="human"]',
                                '[data-testid*="conversation-turn"]',
                                'main article',
                                '[role="article"]'
                            ];
                            const latestUser = latestBySelectors(userSelectors);
                            const latestUserLoose = normalizeLoose(latestUser);
                            // Hidden/offscreen Claude panes can miss visible user-turn echoes.
                            // Do not hard-fail extraction here; continue to body-anchored fallbacks.
                            const body = String(document.body?.innerText || document.body?.textContent || '').trim();
                            if (!body) return '';
                            const lowerBody = normalize(body);
                            const lowerPrompt = normalize(prompt);
                            const idx = lowerBody.lastIndexOf(lowerPrompt);
                            if (idx >= 0) {
                                let after = body.slice(idx + prompt.length).trim();
                                after = after
                                    .replace(/\\n?Ask a follow-up.*$/i, '')
                                    .replace(/\\n?Claude can make mistakes.*$/i, '')
                                    .replace(/\\n?Recents.*$/i, '')
                                    .replace(/\\n?Hide details.*$/i, '')
                                    .trim();
                                if (after.length > 40) {
                                    const cleanedAfter = stripClaudeUiTail(after);
                                    candidate = isLikelyUiNoise(cleanedAfter) ? '' : cleanedAfter;
                                }
                            }
                            if (!candidate) {
                                // Loose fallback for punctuation/format drift (e.g., "Ft. Worth" vs "Ft Worth")
                                const lowerBodyLoose = normalizeLoose(body);
                                const lowerPromptLoose = normalizeLoose(prompt);
                                const idxLoose = lowerBodyLoose.lastIndexOf(lowerPromptLoose);
                                if (idxLoose >= 0) {
                                    const projectedStart = Math.max(0, Math.min(body.length - 1, idxLoose + prompt.length));
                                    let afterLoose = body.slice(projectedStart).trim();
                                    afterLoose = afterLoose
                                        .replace(/\\n?Ask a follow-up.*$/i, '')
                                        .replace(/\\n?Claude can make mistakes.*$/i, '')
                                        .replace(/\\n?Recents.*$/i, '')
                                        .replace(/\\n?Hide details.*$/i, '')
                                        .trim();
                                    if (afterLoose.length > 40) {
                                        const cleanedAfterLoose = stripClaudeUiTail(afterLoose);
                                        candidate = isLikelyUiNoise(cleanedAfterLoose) ? '' : cleanedAfterLoose;
                                    }
                                }
                            }
                        }
                        if (!candidate) {
                            // Last resort for hidden panes: pick the longest likely assistant block.
                            const fallback = latestBySelectors([
                                'main article',
                                'main [role="article"]',
                                '.prose',
                                '.markdown'
                            ]);
                            const cleanedFallback = stripClaudeUiTail(fallback);
                            if (cleanedFallback.length > 80 && !isLikelyUiNoise(cleanedFallback)) {
                                candidate = cleanedFallback;
                            }
                        }
                        if (!candidate || candidate.length <= 40) return '';
                        const normalized = normalize(candidate);
                        if (${JSON.stringify(Array.from(claudeDefaultLandingTokens || []))}.some((token) => normalized.includes(String(token || '')))) return '';
                        const hasUiToken = ${JSON.stringify(Array.from(claudeContaminationTokens || []))}.some((token) => normalized.includes(String(token || '')));
                        const locationCount = (normalized.match(/location/g) || []).length;
                        if ((hasUiToken || locationCount >= 6) && normalized.length < 360) return '';
                        const normalizedPrompt = normalize(prompt);
                        if (normalizedPrompt) {
                            if (normalized === normalizedPrompt) return '';
                            if (normalized.includes(normalizedPrompt) && normalized.length <= (normalizedPrompt.length + 64)) return '';
                        }
                        return candidate;
                    } catch (_) {
                        return '';
                    }
                })();
            `);
            return String(result || '').trim();
        } catch (_) {
            return '';
        }
    }

    return {
        sendPrompt,
        extractResponse
    };
}

module.exports = {
    createClaudeSessionAdapter
};
