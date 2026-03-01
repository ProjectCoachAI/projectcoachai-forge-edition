function createChatgptSessionAdapter({ callWithRetry, injectPromptForProvider }) {
    async function strictSend(view, prompt) {
        return view.webContents.executeJavaScript(`
            (() => {
                const textToInject = ${JSON.stringify(prompt || '')};
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
                const selectors = [
                    'textarea#prompt-textarea',
                    'textarea[data-testid*="prompt"]',
                    'textarea[placeholder*="Ask"]',
                    'textarea[placeholder*="Message"]',
                    'div[contenteditable="true"][role="textbox"]',
                    'div[contenteditable="true"]',
                    'textarea'
                ];
                const candidates = [];
                selectors.forEach((selector) => {
                    let nodes = [];
                    try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { nodes = []; }
                    nodes.forEach((el) => {
                        if (!isVisible(el)) return;
                        const placeholder = String(el.getAttribute('placeholder') || '').toLowerCase();
                        const ariaLabel = String(el.getAttribute('aria-label') || '').toLowerCase();
                        let score = 0;
                        if (el.id === 'prompt-textarea') score += 500;
                        if (placeholder.includes('ask') || placeholder.includes('message')) score += 140;
                        if (ariaLabel.includes('ask') || ariaLabel.includes('message')) score += 120;
                        if (el.closest('main, [role="main"]')) score += 100;
                        if (el.closest('form')) score += 90;
                        if (el.closest('aside, nav, [class*="sidebar"]')) score -= 500;
                        candidates.push({ el, score });
                    });
                });
                if (candidates.length === 0) return false;
                candidates.sort((a, b) => b.score - a.score);
                const input = candidates[0].el;
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
                        // If prompt remains staged unchanged, submit likely did not fire.
                        if (promptNeedle && postSendText.includes(promptNeedle) && postSendText === preSendText) {
                            resolve(false);
                            return;
                        }
                        resolve(true);
                    }, 260);
                });
            })();
        `);
    }

    async function hasPromptEcho(view, prompt) {
        return Boolean(await view.webContents.executeJavaScript(`
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
        `));
    }

    async function sendPrompt(pane, prompt) {
        try {
            return await callWithRetry(
                async () => {
                    const ok = await strictSend(pane.view, prompt);
                    if (!ok) throw new Error('ChatGPT strict send not confirmed');
                    return true;
                },
                {
                    maxRetries: 3,
                    initialDelay: 700,
                    timeout: 30000,
                    context: `${pane?.tool?.name || 'ChatGPT'} adapter send`
                }
            );
        } catch (_) {
            try {
                const fallbackOk = Boolean(await injectPromptForProvider(pane.view, prompt, pane?.tool?.name || 'ChatGPT'));
                return fallbackOk;
            } catch (_) {
                return false;
            }
        }
    }

    async function extractResponse(pane, runPrompt = '') {
        try {
            const result = await pane.view.webContents.executeJavaScript(`
                (() => {
                    try {
                        const prompt = ${JSON.stringify(runPrompt || '')};
                        const normalize = (v) => String(v || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                        const normalizeLoose = (v) => normalize(v).replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
                        const isVisible = (el) => {
                            if (!el) return false;
                            const rect = el.getBoundingClientRect();
                            const style = window.getComputedStyle(el);
                            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                        };
                        const latestBySelectors = (selectors) => {
                            const candidates = [];
                            for (const selector of selectors) {
                                let nodes = [];
                                try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { nodes = []; }
                                for (const node of nodes) {
                                    if (!isVisible(node)) continue;
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
                        let candidate = latestBySelectors([
                            'main [data-message-author-role="assistant"] .markdown',
                            'main [data-message-author-role="assistant"] [class*="prose"]',
                            '[data-testid*="conversation-turn"] [data-message-author-role="assistant"] .markdown',
                            '[data-testid*="conversation-turn"] [data-message-author-role="assistant"] [class*="prose"]',
                            '[data-message-author-role="assistant"]',
                            '[data-role="assistant"]',
                            '[class*="assistant"]',
                            '.markdown',
                            '.prose'
                        ]);
                        if (prompt) {
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
                            if (promptNeedleLoose && (!latestUserLoose || !latestUserLoose.includes(promptNeedleLoose))) {
                                return '';
                            }
                            const body = String(document.body?.innerText || document.body?.textContent || '').trim();
                            if (!body) return '';
                            {
                                const lowerBody = normalize(body);
                                const lowerPrompt = normalize(prompt);
                                const idx = lowerBody.lastIndexOf(lowerPrompt);
                                if (idx >= 0) {
                                    let after = body.slice(idx + prompt.length).trim();
                                    after = after
                                        .replace(/\\n?Ask anything.*$/i, '')
                                        .replace(/\\n?ChatGPT can make mistakes.*$/i, '')
                                        .replace(/\\n?Check important info\\. See Cookie Preferences\\.?/i, '')
                                        .replace(/\\n?ChatGPT says:.*$/i, '')
                                        .replace(/\\n?Dimage_group\\..*$/i, '')
                                        .replace(/\\n?New chat.*$/i, '')
                                        .replace(/\\n?Search chats.*$/i, '')
                                        .trim();
                                    if (after.length > 40) {
                                        candidate = after;
                                    }
                                }
                            }
                        }
                        if (!candidate || candidate.length <= 40) return '';
                        const normalized = normalize(candidate);
                        if (normalized.includes('new chat') && normalized.includes('search chats')) return '';
                        if (normalized.includes('ask anything')) return '';
                        if (normalized.includes("what's on the agenda today")) return '';
                        if (normalized.includes('what are you working on')) return '';
                        const normalizedPrompt = normalize(prompt);
                        if (normalizedPrompt) {
                            if (normalized === normalizedPrompt) return '';
                            if (normalized.includes(normalizedPrompt) && normalized.length <= (normalizedPrompt.length + 48)) return '';
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
    createChatgptSessionAdapter
};
