// Diary Extension — Content Script
// Runs inside ChatGPT, Claude, Gemini, Perplexity, DeepSeek, Grok, Mistral
// Handles: provider detection, auth detection, prompt injection, response capture
// Ported from battle-tested main.js injection code

(function () {
  'use strict';

  // Coexistence: Diary and Forge can run side by side
  // Diary uses __diary* globals; Forge uses __forge* globals
  if (window.__diaryProviderActive) return;
  window.__diaryProviderActive = true;

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
    h.includes('meta.ai')                                       ? 'meta'    :
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
    chatgpt:    () => !!document.querySelector('#prompt-textarea, [data-testid="profile-button"], [data-testid="user-menu"]'),
    claude:     () => !!document.querySelector('.ph-no-capture, [class*="ConversationList"], [data-testid="user-menu"], [class*="UserMenu"]') || (window.location.hostname === 'claude.ai' && !window.location.pathname.includes('login') && !window.location.hash.includes('magic')),
    gemini:     () => !!document.querySelector('[data-ogsr-up], bard-sidenav, .conversation-list, [aria-label*="Google Account"]'),
    // For API providers, detect the chat interface being present (only shown when logged in)
    perplexity: () => !!document.querySelector('textarea, [placeholder*="Ask"], [data-testid="search-input"], main'),
    deepseek:   () => !!document.querySelector('textarea, [id*="chat"], [class*="chat-input"], main'),
    grok:       () => !!document.querySelector('textarea, [data-testid="tweetTextarea_0"], [aria-label*="Ask"], main'),
    mistral:    () => !!document.querySelector('textarea, [placeholder*="Ask"], [class*="chat"], main'),
    meta:       () => !!document.querySelector('textarea, [placeholder*="Ask"], [class*="chat"], main'),
  };

  function isAuthenticated() {
    try { return (AUTH_SIGNALS[PROVIDER] || (() => false))(); } catch (_) { return false; }
  }

  // Report auth status
  function reportAuthStatus() {
    window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'AUTH_STATUS', provider: PROVIDER, authenticated: isAuthenticated() }}, '*');
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
      'div.ProseMirror[contenteditable="true"]',
      '#prompt-textarea',
      'textarea#prompt-textarea',
      'textarea[data-testid*="prompt"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea'
    ],
    claude: [
      '[data-testid="chat-input"]',
      '.tiptap.ProseMirror[contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]',
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
        if (el.getAttribute('data-testid') === 'chat-input') score += 500;
        if (el.classList.contains('tiptap') || el.classList.contains('ProseMirror')) score += 400;
        if (el.id === 'prompt-textarea' || el.getAttribute('data-id') === 'root') score += 300;
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
      // contenteditable — use execCommand for Tiptap/ProseMirror compatibility
      input.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted) {
        input.textContent = text;
        input.innerText = text;
        input.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, inputType: 'insertText', data: text
        }));
      }
    }
  }

  function clickSend(input, text) {
    const root = input.closest('form, main, [role="main"], article') || document;
    const promptNeedle = normalize(text).slice(0, 48);
    const preSendText  = normalize(getInputText(input));

    // First try document-wide priority selectors
    const priorityBtn = document.querySelector('[data-testid="send-button"]:not([disabled]), [id="composer-submit-button"]:not([disabled])');
    if (priorityBtn && isVisible(priorityBtn)) {
      priorityBtn.click();
      return;
    }

    const sendButtons = Array.from(root.querySelectorAll(
      'button, [role="button"], [type="submit"], [data-testid]'
    )).filter((btn) => {
      if (!isVisible(btn) || btn.disabled) return false;
      const type    = String(btn.getAttribute('type')         || '').toLowerCase();
      const txt     = String(btn.textContent                  || '').toLowerCase();
      const label   = String(btn.getAttribute('aria-label')   || '').toLowerCase();
      const testId  = String(btn.getAttribute('data-testid')  || '').toLowerCase();
      if (type === 'submit') return true;
      if (testId === 'send-button') return true;
      if (testId === 'composer-submit-button') return true;
      if (txt.includes('send') || label.includes('send') || testId.includes('send')) return true;
      // Proximity to input
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
    claude:     ['.font-claude-response',
                 '.standard-markdown',
                 '.font-claude-response-body',
                 '[data-is-streaming="false"] .contents',
                 '[data-testid="assistant-message"]',
                 '[class*="AssistantMessage"]',
                 '[data-role="assistant"]'],
    gemini:     ['model-response .markdown',
                 '[data-chunk-index] p',
                 '[class*="model-response"]',
                 '[data-message-author-role="model"]'],
    perplexity: ['[class*="prose"]', '[data-testid="answer"]', '[class*="answer-content"]', '[class*="AnswerBody"]', '[class*="answer"]', 'section [class*="text"]'],
    deepseek:   ['[class*="ds-markdown"]',
                 '[class*="markdown-body"]',
                 '[class*="assistant"] [class*="markdown"]',
                 '[class*="message-content"]',
                 '[class*="message-assistant"]'],
    grok:       ['[class*="response-content"]',
                 '[class*="assistant-message"] [class*="content"]',
                 '[data-testid="response"]',
                 '[class*="message-bubble"]:not([class*="user"])',
                 '[class*="message"]:not([class*="user"]) [class*="content"]'],
    mistral:    ['[data-message-author-role="assistant"]',
                 '[class*="prose"]',
                 'main article'],
    meta:       ['[data-testid="ai-response-message-content"]',
                 '[class*="assistant-message-content"]',
                 '[data-testid="ai-message"]',
                 '[class*="AiMessage"] [class*="content"]',
                 '[class*="assistant-message"]',
                 '[class*="BotMessage"]',
                 '[role="main"] [class*="message"]:not([class*="user"]):not([class*="connect"]):not([class*="promo"])']
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

  function htmlToMarkdown(el) {
    if (!el) return '';
    function walk(node, ctx) {
      if (node.nodeType === 3) { // Text node
        return node.textContent || '';
      }
      if (node.nodeType !== 1) return '';
      const tag = node.tagName ? node.tagName.toLowerCase() : '';
      const children = Array.from(node.childNodes).map(c => walk(c, ctx)).join('');
      const trimmed = children.trim();
      if (!trimmed && !['br','hr','img'].includes(tag)) return ''; // Skip empty elements
      if (tag === 'br') return '\n';
      if (tag === 'p') return trimmed ? (ctx === 'li' ? trimmed + ' ' : '\n' + trimmed + '\n') : '';
      if (tag === 'h1') return trimmed ? '\n# ' + trimmed + '\n' : '';
      if (tag === 'h2') return trimmed ? '\n## ' + trimmed + '\n' : '';
      if (tag === 'h3') return trimmed ? '\n### ' + trimmed + '\n' : '';
      if (tag === 'h4' || tag === 'h5' || tag === 'h6') return trimmed ? '\n#### ' + trimmed + '\n' : '';
      if (tag === 'strong' || tag === 'b') return trimmed ? '**' + trimmed + '**' : '';
      if (tag === 'em' || tag === 'i') return trimmed ? '_' + trimmed + '_' : '';
      if (tag === 'code' && ctx !== 'pre') return trimmed ? '`' + trimmed + '`' : '';
      if (tag === 'pre') return '\n```\n' + node.textContent.trim() + '\n```\n';
      if (tag === 'ul') {
        const items = Array.from(node.querySelectorAll(':scope > li'))
          .map(li => {
            // Get only direct text and inline children, skip nested ul/ol
            const parts = [];
            li.childNodes.forEach(c => {
              if (c.nodeType === 3) { const t = c.textContent.trim(); if (t) parts.push(t); }
              else if (c.nodeType === 1) {
                const ct = (c.tagName||'').toLowerCase();
                if (!['ul','ol'].includes(ct)) { const t = walk(c, ctx).trim(); if (t) parts.push(t); }
              }
            });
            return parts.join(' ').trim();
          })
          .filter(t => t.length > 2);
        return items.length ? '\n' + items.map(t => '* ' + t).join('\n') + '\n' : '';
      }
      if (tag === 'ol') {
        const items = Array.from(node.querySelectorAll(':scope > li'))
          .map(li => {
            const parts = [];
            li.childNodes.forEach(c => {
              if (c.nodeType === 3) { const t = c.textContent.trim(); if (t) parts.push(t); }
              else if (c.nodeType === 1) {
                const ct = (c.tagName||'').toLowerCase();
                if (!['ul','ol'].includes(ct)) { const t = walk(c, ctx).trim(); if (t) parts.push(t); }
              }
            });
            return parts.join(' ').trim();
          })
          .filter(t => t.length > 2);
        return items.length ? '\n' + items.map((t, i) => (i + 1) + '. ' + t).join('\n') + '\n' : '';
      }
      if (tag === 'li') {
        // Inside li, collapse p/div newlines to spaces
        const liText = Array.from(node.childNodes).map(c => {
          if (c.nodeType === 3) return c.textContent || '';
          if (c.nodeType !== 1) return '';
          const ct = (c.tagName||'').toLowerCase();
          if (['ul','ol'].includes(ct)) return ''; // skip nested lists
          return walk(c, 'li');
        }).join('').trim();
        return liText;
      }
      if (tag === 'a') return trimmed;
      if (tag === 'img') return '';
      if (tag === 'table') {
        var rows = Array.from(node.querySelectorAll('tr'));
        if (!rows.length) return '';
        return '\n' + rows.map(r => '| ' + Array.from(r.querySelectorAll('td,th')).map(c => c.textContent.trim()).join(' | ') + ' |').join('\n') + '\n';
      }
      if (tag === 'hr') return '\n---\n';
      if (tag === 'blockquote') return trimmed ? '\n> ' + trimmed.replace(/\n/g, '\n> ') + '\n' : '';
      if (['script','style','noscript','svg'].includes(tag)) return '';
      return children;
    }
    var md = walk(el, '');
    // Clean up: remove empty bullet/numbered lines, normalize newlines
    // Split into lines, filter out empty bullet lines, rejoin
    var lines = md.split('\n');
    lines = lines.filter(function(line) {
      var stripped = line.trim();
      // Remove lines that are just "* " or "* " with nothing after
      if (stripped === '*' || stripped === '* ' || stripped === '*  ') return false;
      // Remove numbered list lines with no content
      if (/^\d+\.\s*$/.test(stripped)) return false;
      return true;
    });
    md = lines.join('\n');
    md = md.replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  function getBestResponse() {
    const selectors = RESPONSE_SELECTORS[PROVIDER] || [];
    const useShadow = PROVIDER === 'deepseek' || PROVIDER === 'mistral';

    // For shadow DOM providers (DeepSeek, Mistral)
    if (useShadow) {
      const STOP_CLASSES = /sidebar|side-bar|nav|menu|history|conversation-list|chat-list|panel-left|chat-input|search/i;

      function isInSidebar(el) {
        let p = el.parentElement;
        while (p && p !== document.body) {
          if (STOP_CLASSES.test(p.className || '') || STOP_CLASSES.test(p.id || '')) return true;
          p = p.parentElement;
        }
        return false;
      }

      for (const sel of selectors) {
        try {
          const els = queryAllDeep(sel);
          if (els.length === 0) continue;

          // Filter: must have real content, must not be in sidebar
          const valid = Array.from(els).filter(el => {
            if (isInSidebar(el)) return false;
            const text = el.textContent?.trim() || '';
            return isLikelyResponse(text);
          });
          if (valid.length === 0) continue;

          // Remove any element that is contained within another valid element
          const topLevel = valid.filter(el =>
            !valid.some(other => other !== el && other.contains(el))
          );

          // Sort in document order
          topLevel.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          });

          // Find the LAST response block
          // DeepSeek keeps all previous responses in DOM — we identify the last one
          // by finding where content stops overlapping with previous entries
          // Strategy: take the last top-level element and walk backwards to collect
          // all siblings that belong to the same message turn
          const lastEl = topLevel[topLevel.length - 1];
          const lastParent = lastEl.parentElement;

          // Collect siblings of lastEl that are also in our topLevel list
          const lastBlock = topLevel.filter(el => {
            if (el === lastEl) return true;
            // Same direct parent = same message block
            if (el.parentElement === lastParent) return true;
            // Last element contains this element
            if (lastEl.contains(el)) return true;
            return false;
          });

          if (lastBlock.length === 0) {
            return cleanResponseText(htmlToMarkdown(lastEl), PROVIDER);
          }

          lastBlock.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
          });

          const combined = lastBlock.map(el => htmlToMarkdown(el)).join('\n\n');
          return cleanResponseText(combined, PROVIDER);
        } catch (_) {}
      }
    }

    // Standard providers: find the best single element
    let bestEl = null;
    let bestLen = 0;
    for (const sel of selectors) {
      try {
        const els = Array.from(document.querySelectorAll(sel));
        const candidates = els.filter(el => {
          if (el.closest('button, input, textarea, nav, header, [class*="input"]')) return false;
          return isLikelyResponse(el.textContent?.trim() || '');
        });
        if (candidates.length > 0) {
          const last = candidates[candidates.length - 1];
          const len = last.textContent?.trim().length || 0;
          if (len > bestLen) {
            bestLen = len;
            bestEl = last;
          }
        }
      } catch (_) {}
    }
    if (!bestEl) return '';
    return cleanResponseText(htmlToMarkdown(bestEl), PROVIDER);
  }

  function cleanResponseText(text, provider) {
    if (!text) return text;
    // Remove Grok thinking indicator
    text = text.replace(/^Thought for \d+s\s*/i, '');
    // Remove Gemini tooltip text
    text = text.replace(/Click to open side panel for more information/gi, '');
    // Remove Grok "Add to chat" suffix
    text = text.replace(/\s*Add to chat\s*$/i, '');
    // Remove ChatGPT/Perplexity citation labels like "Wikipedia+1" or "britannica+1"
    text = text.replace(/\b([A-Za-z]+(?:\.com|\.org|\.net)?)(?:\+\d+)?\s*(?=[A-Z])/g, '$1 ');
    text = text.replace(/\s*[a-zA-Z]+(?:\.[a-z]+)*\+\d+/g, '');
    text = text.replace(/\s+-\d+(?:-\d+)*/g, '');
    // Remove Mistral/Meta timestamps (e.g. "5:56pm" or "22 Jun 2026")
    text = text.replace(/\s*\d{1,2}:\d{2}(?:am|pm)\s*/gi, ' ');
    text = text.replace(/\s*\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\s*/g, ' ');
    // Remove DeepSeek citation superscripts like -6, -1 (only when trailing after word)
    text = text.replace(/(?<=[a-zA-Z\d])\s*\.?-\d+(?:-\d+)*/g, '');
    // Remove stray leading digit that is a UI artefact
    text = text.replace(/^\d+\n/, '');
    // Normalize whitespace
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  function injectSaveDiaryButton(responseText) {
    var existingBtn = document.getElementById('diary-save-btn');
    if (existingBtn) existingBtn.remove();

    var btn = document.createElement('button');
    btn.id = 'diary-save-btn';
    btn.textContent = String.fromCharCode(55357,56613) + ' Save to Diary';
    btn.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'right:20px',
      'z-index:2147483640',
      'background:#F97316',
      'color:#fff',
      'border:none',
      'border-radius:10px',
      'padding:10px 18px',
      'font-size:13px',
      'font-weight:700',
      'cursor:pointer',
      'font-family:system-ui,sans-serif',
      'box-shadow:0 4px 16px rgba(249,115,22,0.4)',
      'transition:all 0.2s',
      'display:flex',
      'align-items:center',
      'gap:6px'
    ].join(';');

    btn.onmouseenter = function() { this.style.background = '#ea580c'; this.style.transform = 'translateY(-2px)'; };
    btn.onmouseleave = function() { this.style.background = '#F97316'; this.style.transform = ''; };

    btn.onclick = async function() {
      btn.textContent = 'Saving...';
      btn.disabled = true;
      try {
        var token = null;
        await new Promise(function(resolve) {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'GET_AUTH_TOKEN' } }, '*');
          var handler = function(e) {
            if (e.data && e.data.type === '__DIARY_AUTH_TOKEN__') {
              token = e.data.token;
              window.removeEventListener('message', handler);
              resolve();
            }
          };
          window.addEventListener('message', handler);
          setTimeout(resolve, 2000);
        });

        if (!token) {
          btn.textContent = 'Sign in to Diary first';
          btn.style.background = '#6B6B88';
          setTimeout(function() { btn.remove(); }, 3000);
          return;
        }

        var prompt = '';
        var PROMPT_SELECTORS = {
          chatgpt:    ['[data-message-author-role="user"] .whitespace-pre-wrap', '[data-message-author-role="user"]'],
          claude:     ['[data-testid="user-message"]', '.human-bubble', '[class*="HumanTurn"]'],
          gemini:     ['[data-message-author-role="user"]', '.user-query-bubble-with-background', '[class*="user-message"]'],
          perplexity: ['[data-testid="query-input"]', '[placeholder*="Ask"]', 'textarea[class*="search"]', '[data-testid="search-input"]', 'textarea'],
          deepseek:   ['[class*="human-message"]', '[class*="user-message"]', '[class*="question"]', '.fad8d1a', '[class*="r_a8181"]', '[data-message-author-role="user"]'],
          grok:       ['[data-testid="userMessage"]', '[class*="user"] [class*="message"]'],
          mistral:    ['[data-message-author-role="user"]', '[class*="user"] [class*="message"]'],
          meta:       ['[data-testid="user-message"]', '[class*="UserMessage"]', '[class*="HumanMessage"]', '[class*="user-message"]']
        };
        var pSelectors = PROMPT_SELECTORS[PROVIDER] || ['[data-message-author-role="user"]', '[class*="user-message"]'];
        for (var ps = 0; ps < pSelectors.length; ps++) {
          try {
            var pEls = document.querySelectorAll(pSelectors[ps]);
            if (pEls.length > 0) {
              var pText = pEls[pEls.length - 1].textContent.trim().slice(0, 500);
              // Remove common UI prefixes
              pText = pText.replace(/^You said\s*/i, '').replace(/^User:\s*/i, '').trim();
              if (pText && pText.length > 2 && !/^\d{1,2}:\d{2}/.test(pText) && !/^\d{1,2} \w+ \d{4}/.test(pText)) {
                prompt = pText;
                break;
              }
            }
          } catch(_) {}
        }

        var data = await new Promise(function(resolve, reject) {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: {
            type: 'SAVE_TO_DIARY',
            token: token,
            source: PROVIDER,
            prompt: prompt,
            content: responseText,
            url: window.location.href
          }}, '*');
          var handler = function(e) {
            if (e.data && e.data.type === '__DIARY_EXT_DATA__' && e.data.savedToDiary) {
              window.removeEventListener('message', handler);
              resolve({ success: e.data.success, error: e.data.error });
            }
          };
          window.addEventListener('message', handler);
          setTimeout(function() { reject(new Error('timeout')); }, 10000);
        });
        if (data.success) {
          btn.textContent = String.fromCharCode(10003) + ' Saved to Diary';
          btn.style.background = '#22c55e';
          setTimeout(function() { btn.remove(); }, 3000);
        } else {
          throw new Error(data.error || 'Save failed');
        }
      } catch(e) {
        btn.textContent = 'Failed — try again';
        btn.style.background = '#ef4444';
        btn.disabled = false;
        setTimeout(function() { btn.remove(); }, 4000);
      }
    };

    document.body.appendChild(btn);
    setTimeout(function() { if (btn.parentNode) btn.remove(); }, 30000);
  }

  function scheduleCapture(text) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (text && text !== lastCaptured && text.length > 30) {
        lastCaptured = text;
        console.log(`[Forge] ${PROVIDER}: captured ${text.length} chars`);
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'RESPONSE_CAPTURED', provider: PROVIDER, response: text, timestamp: Date.now(), sourceUrl: window.location.href, capturedAt: new Date().toISOString() }}, '*');
        injectSaveDiaryButton(text);
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
    if (event.data?.type !== '__DIARY_FROM_EXT__') return;
    const message = event.data.payload;
    if (message.type === 'INJECT_PROMPT') {
      injectPrompt(message.prompt).then(ok => {
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'INJECT_RESULT', ok, provider: PROVIDER }}, '*');
      });
    }
    if (message.type === 'CHECK_AUTH') {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'AUTH_RESULT', authenticated: isAuthenticated(), provider: PROVIDER }}, '*');
    }
    if (message.type === 'GET_RESPONSE') {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'RESPONSE_RESULT', response: lastCaptured, provider: PROVIDER }}, '*');
    }
  });

  // Expose direct injection function for background scripting
  window.__diaryInject = (prompt) => {
    console.log(`[Forge] ${PROVIDER}: __forgeInject called`);
    injectPrompt(prompt);
  };

  // Ask background for pending prompt via message (no storage access needed)
  function checkPendingPrompt() {
    try {
      chrome.runtime.sendMessage({ type: 'GET_PENDING_PROMPT' }, async function(r) {
        if (chrome.runtime.lastError || !r || !r.pending) return;
        const pending = r.pending;
        if (!pending.providers || !pending.providers.includes(PROVIDER)) return;
        if (Date.now() - pending.timestamp > 60000) return; // Expired after 60s
        await new Promise(res => setTimeout(res, 2000)); // Wait for page to be ready
        if (!isAuthenticated()) return;
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

  // ── Forge Control Bar ───────────────────────────────────────────────────────
  // Injects on ALL 7 provider sites — the bar travels with the user everywhere
  {
    const BAR_ID    = '__diary_control_bar__';
    const FORGE_URL = 'https://diary.projectcoachai.com';

    // All 7 providers and their real sites — all use OPEN_PROVIDER (real chatbot)
    const ALL_PROVIDERS = [
      { id: 'claude',     name: 'Claude',     color: '#d97706' },
      { id: 'chatgpt',    name: 'ChatGPT',    color: '#10b981' },
      { id: 'gemini',     name: 'Gemini',     color: '#3b82f6' },
      { id: 'mistral',    name: 'Mistral',    color: '#f97316' },
      { id: 'deepseek',   name: 'DeepSeek',   color: '#6366f1' },
      { id: 'perplexity', name: 'Perplexity', color: '#20b2aa' },
      { id: 'grok',       name: 'Grok',       color: '#e11d48' },
    ];

    // The current provider's color and display name
    const CURRENT = ALL_PROVIDERS.find(p => p.id === PROVIDER) || { color: '#ffffff', name: PROVIDER };
    // All others shown as switch targets
    const OTHERS  = ALL_PROVIDERS.filter(p => p.id !== PROVIDER);

    // Grab whatever is currently typed in the host AI's input box
    function getCurrentPrompt() {
      const selectors = INPUT_SELECTORS[PROVIDER] || ['textarea', '[contenteditable="true"]'];
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) {
            const text = getInputText(el).trim();
            if (text) return text;
          }
        } catch (_) {}
      }
      return '';
    }

    function injectForgeBar() { return; // Replaced by provider-dock.js
      if (document.getElementById(BAR_ID)) return;
      if (!isAuthenticated()) return;

      const bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'height:40px',
        'background:rgba(10,10,15,0.97)', 'backdrop-filter:blur(16px)',
        'border-bottom:1px solid rgba(255,255,255,0.1)',
        'display:flex', 'align-items:center', 'justify-content:space-between',
        'padding:0 12px', 'z-index:2147483647',
        'font-family:-apple-system,sans-serif', 'font-size:12px',
        'color:rgba(255,255,255,0.7)', 'box-sizing:border-box',
        'overflow:hidden',
      ].join(';');

      const btnStyle = (p) =>
        `background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);` +
        `border-radius:6px;padding:3px 9px;color:${p.color};font-size:11px;font-weight:600;` +
        `cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;`;

      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="font-weight:700;color:${CURRENT.color};">🔥 Forge</span>
          <span style="opacity:0.35;">|</span>
          <span style="opacity:0.55;font-size:11px;white-space:nowrap;">Using your ${CURRENT.name} subscription</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;overflow:hidden;padding:0 6px;">
          <span style="opacity:0.4;font-size:11px;white-space:nowrap;flex-shrink:0;">Switch:</span>
          ${OTHERS.map(p =>
            `<button data-switch="${p.id}" style="${btnStyle(p)}">${p.name}</button>`
          ).join('')}
          <span style="opacity:0.3;margin:0 3px;flex-shrink:0;">|</span>
          <button id="__forge_compare__" style="background:rgba(255,107,53,0.15);border:1px solid rgba(255,107,53,0.35);border-radius:6px;padding:3px 12px;color:#ff6b35;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">✦ All Perspectives</button>
        </div>`;

      document.documentElement.insertBefore(bar, document.documentElement.firstChild);
      document.documentElement.style.paddingTop = '40px';

      // Force any sticky/fixed headers on the host page to sit below the Forge bar
      const stickyFix = document.createElement('style');
      stickyFix.id = '__forge_sticky_fix__';
      stickyFix.textContent = `
        body > header[style*="position"],
        body > div > header,
        header.sticky, header[data-fixed], header[class*="sticky"], header[class*="fixed"],
        nav[class*="sticky"], nav[class*="fixed"], nav[style*="position:fixed"],
        [class*="topbar"], [class*="top-bar"], [class*="navbar"],
        [class*="AppHeader"], [class*="header--sticky"] {
          top: 40px !important;
        }
      `;
      document.head.appendChild(stickyFix);

      // All switches go to the real provider site — user gets the real chatbot
      bar.querySelectorAll('[data-switch]').forEach(btn => {
        btn.addEventListener('click', () => {
          const prompt = getCurrentPrompt();
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'OPEN_PROVIDER', provider: btn.dataset.switch, prompt }}, '*');
        });
      });

      document.getElementById('__forge_compare__').addEventListener('click', () => {
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SET_STORAGE', key: '__forge_quick_compare', value: { provider: PROVIDER, timestamp: Date.now() } }}, '*');
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'OPEN_FORGE', url: FORGE_URL + '?from=' + PROVIDER }}, '*');
      });
    }

    function tryInjectBar() {
      if (!document.getElementById(BAR_ID) && isAuthenticated()) injectForgeBar();
    }

    // Bar injection disabled - using provider-dock.js instead
    // setTimeout(tryInjectBar, 1500);
    setTimeout(tryInjectBar, 3000);
    setTimeout(tryInjectBar, 6000);
    setTimeout(tryInjectBar, 10000);

    // Watch for auth loading late
    const authObserver = new MutationObserver(() => {
      if (!document.getElementById(BAR_ID) && isAuthenticated()) injectForgeBar();
    });
    authObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => authObserver.disconnect(), 15000);

    // ── SPA navigation — re-inject bar when URL changes (claude.ai is a SPA) ──
    let _lastUrl = location.href;
    const navObserver = new MutationObserver(() => {
      if (location.href !== _lastUrl) {
        _lastUrl = location.href;
        if (!document.getElementById(BAR_ID)) {
          setTimeout(tryInjectBar, 800);
          setTimeout(tryInjectBar, 2500);
        }
      }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });
  }

})();
