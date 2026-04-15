// Forge Extension — Provider Content Script
// Runs inside ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Grok, Mistral
// Handles: provider detection, auth detection, prompt injection, response capture
// Ported from battle-tested main.js injection code

(function () {
  'use strict';

  if (window.__forgeProviderActive) return;
  window.__forgeProviderActive = true;

  // ── Provider detection ──────────────────────────────────────────────────────
  const h = window.location.hostname;
  const PROVIDER =
    h.includes('chatgpt.com') || h.includes('chat.openai.com') ? 'chatgpt' :
    h.includes('claude.ai')                                     ? 'claude'  :
    h.includes('gemini.google.com')                             ? 'gemini'  :
    h.includes('perplexity.ai')                                 ? 'perplexity' :
    h.includes('deepseek.com')                                  ? 'deepseek' :
    h.includes('x.ai') || h.includes('grok.com')               ? 'grok'    :
    h.includes('mistral.ai')                                    ? 'mistral' :
    null;

  if (!PROVIDER) return;
  console.log(`[Forge] Provider content script: ${PROVIDER}`);

  // ── Shadow DOM pierce (for DeepSeek, Mistral) ───────────────────────────────
  function queryAllDeep(selector) {
    const roots = [document], collected = [];
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      try { collected.push(...Array.from(root.querySelectorAll(selector))); } catch (_) {}
      try {
        for (const host of root.querySelectorAll('*')) {
          if (host.shadowRoot && !roots.includes(host.shadowRoot))
            roots.push(host.shadowRoot);
        }
      } catch (_) {}
    }
    return collected;
  }

  // ── Auth detection ──────────────────────────────────────────────────────────
  const AUTH_SIGNALS = {
    chatgpt:    () => !!document.querySelector('nav, #prompt-textarea, [data-testid="profile-button"]'),
    claude:     () => !!document.querySelector('[data-testid="user-menu"], [class*="ConversationList"], .ph-no-capture'),
    gemini:     () => !!document.querySelector('[data-ogsr-up], bard-sidenav, .conversation-list'),
    perplexity: () => !!document.querySelector('[data-testid="user-avatar"], [href="/settings"]'),
    deepseek:   () => !!document.querySelector('[class*="userAvatar"], [class*="userName"]'),
    grok:       () => !!document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]'),
    mistral:    () => !!document.querySelector('[class*="userMenu"], [href*="/chat"]'),
  };

  function isAuthenticated() {
    try { return (AUTH_SIGNALS[PROVIDER] || (() => false))(); } catch (_) { return false; }
  }

  // Report auth status
  function reportAuthStatus() {
    window.postMessage({
      type: '__FORGE_TO_EXT__',
      payload: { type: 'AUTH_STATUS', provider: PROVIDER, authenticated: isAuthenticated() }
    }, '*');
  }
  setTimeout(reportAuthStatus, 2000);
  setTimeout(reportAuthStatus, 5000);

  // ── Prompt injection (ported from main.js injectTextChatgpt / injectText) ───
  const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const getInputText = (el) => {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return String(el.value || '');
    return String(el.innerText || el.textContent || '');
  };

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return true;
    // Relax for Claude ProseMirror (height=0 when empty)
    const tag = (el.tagName || '').toLowerCase();
    return rect.width > 0 && (tag === 'textarea' || tag === 'input' || el.isContentEditable === true);
  };

  // Provider-specific input selectors (from main.js)
  const INPUT_SELECTORS = {
    chatgpt: [
      'textarea#prompt-textarea',
      'textarea[data-testid*="prompt"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea'
    ],
    claude: [
      'main form textarea',
      'form textarea',
      'textarea[placeholder*="How can I help"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Reply"]',
      'main [contenteditable="true"][role="textbox"]',
      'main [contenteditable="true"]'
    ],
    gemini: [
      'textarea[aria-label*="Ask Gemini"]',
      'textarea[aria-label*="Enter a prompt"]',
      'textarea[placeholder*="Ask Gemini"]',
      'rich-textarea textarea',
      'main textarea',
      'main [contenteditable="true"][role="textbox"]',
      'main [contenteditable="true"]'
    ],
    perplexity: [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Search"]',
      '[contenteditable="true"][class*="editor"]',
      'textarea'
    ],
    deepseek: [
      'textarea#chat-input',
      'textarea[placeholder*="Send a message"]',
      'textarea[placeholder*="Ask"]',
      'textarea',
      '[contenteditable="true"]'
    ],
    grok: [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      '[contenteditable="true"][data-lexical-editor]',
      'textarea'
    ],
    mistral: [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      '[contenteditable="true"]',
      'textarea'
    ]
  };

  function findInput() {
    const selectors = INPUT_SELECTORS[PROVIDER] || ['textarea', '[contenteditable="true"]'];
    const candidates = [];

    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = PROVIDER === 'deepseek' || PROVIDER === 'mistral'
          ? queryAllDeep(selector)
          : Array.from(document.querySelectorAll(selector));
      } catch (_) { continue; }

      for (const el of nodes) {
        if (!isVisible(el)) continue;
        let score = 0;
        const placeholder = String(el.getAttribute('placeholder') || '').toLowerCase();
        const ariaLabel   = String(el.getAttribute('aria-label')  || '').toLowerCase();
        const testId      = String(el.getAttribute('data-testid') || '').toLowerCase();
        if (el.id === 'prompt-textarea') score += 500;
        if (testId.includes('prompt'))   score += 220;
        if (placeholder.includes('ask') || placeholder.includes('message')) score += 140;
        if (ariaLabel.includes('ask')   || ariaLabel.includes('message'))   score += 120;
        if (el.closest('main, [role="main"]')) score += 100;
        if (el.closest('form'))  score += 90;
        const rect = el.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.45) score += 80;
        if (el.closest('aside, nav, [class*="sidebar"]')) score -= 500;
        candidates.push({ el, score });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].el;
  }

  function setInputValue(input, text) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const proto = input.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
      const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
      if (descriptor?.set) descriptor.set.call(input, text);
      else input.value = text;
      input.focus();
      if (input.setSelectionRange) input.setSelectionRange(text.length, text.length);
      input.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } else {
      // contenteditable
      input.focus();
      input.textContent = text;
      input.innerText   = text;
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true, cancelable: true, inputType: 'insertText', data: text
      }));
    }
  }

  function clickSend(input, text) {
    const root = input.closest('form, main, [role="main"], article') || document;
    const promptNeedle = normalize(text).slice(0, 48);
    const preSendText  = normalize(getInputText(input));

    const sendButtons = Array.from(root.querySelectorAll(
      'button, [role="button"], [type="submit"], [data-testid]'
    )).filter((btn) => {
      if (!isVisible(btn) || btn.disabled) return false;
      const type    = String(btn.getAttribute('type')         || '').toLowerCase();
      const txt     = String(btn.textContent                  || '').toLowerCase();
      const label   = String(btn.getAttribute('aria-label')   || '').toLowerCase();
      const testId  = String(btn.getAttribute('data-testid')  || '').toLowerCase();
      if (type === 'submit') return true;
      if (txt.includes('send') || label.includes('send') || testId.includes('send')) return true;
      // Proximity to input (from main.js)
      const inRect  = input.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      return Math.abs(btnRect.top - inRect.top) < 120 && Math.abs(btnRect.left - inRect.right) < 220;
    });

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
  }

  async function injectPrompt(text) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    if (!isAuthenticated()) {
      console.warn(`[Forge] ${PROVIDER}: not signed in`);
      return false;
    }

    // Wait for input to be available
    let input = null;
    for (let i = 0; i < 20; i++) {
      input = findInput();
      if (input) break;
      await sleep(500);
    }

    if (!input) {
      console.warn(`[Forge] ${PROVIDER}: input not found`);
      return false;
    }

    setInputValue(input, text);
    await sleep(300);

    const staged = normalize(getInputText(input));
    const needle = normalize(text).slice(0, 48);
    if (!staged || (needle && !staged.includes(needle))) {
      console.warn(`[Forge] ${PROVIDER}: text not staged correctly`);
      return false;
    }

    clickSend(input, text);
    console.log(`[Forge] ${PROVIDER}: prompt submitted`);
    return true;
  }

  // ── Response capture (ported from response-capture.js) ──────────────────────
  const RESPONSE_SELECTORS = {
    chatgpt:    ['[data-message-author-role="assistant"] .markdown',
                 '[data-message-author-role="assistant"] .prose',
                 '[data-message-author-role="assistant"]'],
    claude:     ['[data-is-streaming="false"] .contents',
                 '[data-testid="assistant-message"]',
                 '[class*="AssistantMessage"]',
                 '[data-role="assistant"]'],
    gemini:     ['model-response .markdown',
                 '[data-chunk-index] p',
                 '[class*="model-response"]',
                 '[data-message-author-role="model"]'],
    perplexity: ['[class*="prose"]', '[class*="answer"]'],
    deepseek:   ['[class*="assistant"] [class*="markdown"]',
                 '[class*="message-assistant"]',
                 '[data-message-author-role="assistant"]'],
    grok:       ['[class*="message"]:not([class*="user"]) [class*="content"]',
                 '[data-testid*="message"]:not([data-testid*="user"])'],
    mistral:    ['[data-message-author-role="assistant"]',
                 '[class*="prose"]',
                 'main article']
  };

  function isLikelyResponse(text) {
    if (text.length < 30) return false;
    if (/self\.__next_f|__next_f|\["\$"/.test(text)) return false;
    if (/@keyframes|@media|intercom/.test(text)) return false;
    const letters  = (text.match(/[a-zA-Z]/g) || []).length;
    const specials = (text.match(/[{}[\]:,"<>]/g) || []).length;
    if (specials > letters * 0.3 && text.length > 500) return false;
    return text.split(/\s+/).filter(w => w.length > 0).length >= 5;
  }

  let lastCaptured  = '';
  let debounceTimer = null;

  function getBestResponse() {
    const selectors  = RESPONSE_SELECTORS[PROVIDER] || [];
    const useShadow  = PROVIDER === 'deepseek' || PROVIDER === 'mistral';
    let bestText = '';

    for (const sel of selectors) {
      try {
        const els = useShadow ? queryAllDeep(sel) : Array.from(document.querySelectorAll(sel));
        for (const el of els) {
          if (el.closest('button, input, textarea, nav, header, [class*="input"]')) continue;
          const text = el.textContent?.trim() || '';
          if (text.length > bestText.length && isLikelyResponse(text)) bestText = text;
        }
      } catch (_) {}
    }
    return bestText;
  }

  function scheduleCapture(text) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (text && text !== lastCaptured && text.length > 30) {
        lastCaptured = text;
        console.log(`[Forge] ${PROVIDER}: captured ${text.length} chars`);
        window.postMessage({
          type: '__FORGE_TO_EXT__',
          payload: { type: 'RESPONSE_CAPTURED', provider: PROVIDER, response: text, timestamp: Date.now() }
        }, '*');
      }
    }, 3000); // 3s debounce — wait for response to stabilise
  }

  // Watch for DOM changes
  const observer = new MutationObserver(() => {
    const best = getBestResponse();
    if (best) scheduleCapture(best);
  });

  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true
  });

  // Periodic fallback
  const interval = setInterval(() => {
    const best = getBestResponse();
    if (best) scheduleCapture(best);
  }, 4000);
  setTimeout(() => clearInterval(interval), 120000);

  // ── Listen for messages from background (via isolated relay) ───────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== '__FORGE_FROM_EXT__') return;
    const message = event.data.payload;
    if (message.type === 'INJECT_PROMPT') {
      injectPrompt(message.prompt).then(ok => {
        window.postMessage({ type: '__FORGE_TO_EXT__', payload: { type: 'INJECT_RESULT', ok, provider: PROVIDER }}, '*');
      });
    }
    if (message.type === 'CHECK_AUTH') {
      window.postMessage({ type: '__FORGE_TO_EXT__', payload: { type: 'AUTH_RESULT', authenticated: isAuthenticated(), provider: PROVIDER }}, '*');
    }
    if (message.type === 'GET_RESPONSE') {
      window.postMessage({ type: '__FORGE_TO_EXT__', payload: { type: 'RESPONSE_RESULT', response: lastCaptured, provider: PROVIDER }}, '*');
    }
  });

  // Ask background for pending prompt via message (no storage access needed)
  function checkPendingPrompt() {
    try {
      window.postMessage({ type: '__FORGE_TO_EXT__', payload: { type: 'GET_PENDING_PROMPT', provider: PROVIDER }}, '*');
      window.addEventListener('message', async function pendingHandler(event) {
        if (event.data?.type !== '__FORGE_PENDING_RESULT__') return;
        window.removeEventListener('message', pendingHandler);
        const result = event.data;
        const pending = result?.pendingPrompt;
        if (!pending) return;
        if (!pending.providers?.includes(PROVIDER)) return;
        if (Date.now() - pending.timestamp > 60000) return;
        await new Promise(r => setTimeout(r, 2000));
        if (!isAuthenticated()) {
          window.postMessage({ type: '__FORGE_TO_EXT__', payload: { type: 'NOT_SIGNED_IN', provider: PROVIDER }}, '*');
          return;
        }
        await injectPrompt(pending.text);
      });
    } catch (_) {}
  }

  if (document.readyState === 'complete') {
    checkPendingPrompt();
  } else {
    window.addEventListener('load', checkPendingPrompt);
  }

  console.log(`[Forge] ${PROVIDER} ready`);
})();
