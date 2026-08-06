// Diary Extension — Content Script v2
// Provider-registry architecture: each provider is isolated.
// Shared utilities (htmlToMarkdown, cleanText) are defaults that providers can override.
// Bug fix to a default = one edit, reaches all. Behaviour change = provider override only.

(function () {
  'use strict';

  if (window.__diaryProviderActive) return;
  window.__diaryProviderActive = true;

  // ── Provider detection ─────────────────────────────────────────────────────
  const h = window.location.hostname;
  // Canonical URL - strips query params that change per-request (e.g. Grok's ?rid=...)
  function canonicalUrl() {
    return window.location.origin + window.location.pathname;
  }

  const PROVIDER_ID =
    h.includes('claude.ai')        ? 'claude'      :
    h.includes('chatgpt.com')       ? 'chatgpt'     :
    h.includes('gemini.google.com') ? 'gemini'      :
    h.includes('perplexity.ai')     ? 'perplexity'  :
    h.includes('deepseek.com')      ? 'deepseek'    :
    h.includes('x.ai') || h.includes('grok.com') ? 'grok' :
    h.includes('mistral.ai')        ? 'mistral'     :
    h.includes('meta.ai')           ? 'meta'        :
    null;

  console.log('[Diary content] PROVIDER_ID:', PROVIDER_ID, 'host:', h);
  if (!PROVIDER_ID) return;
  const PROVIDER = PROVIDER_ID; // alias for legacy infrastructure

  // ── Shared utilities (defaults) ────────────────────────────────────────────

// ── Provider registry ──────────────────────────────────────────────────────
  // Each provider: responseSelectors, promptSelectors, clean (optional override),
  // htmlToMarkdown (optional override), useShadow, reloadUrl (for Phase 3)

  const registry = {
    claude: {
      _prompts: [], _hooked: false,
      _hookInput: function() {
        var self = registry.claude; if(self._hooked) return; self._hooked = true;
        document.addEventListener('keydown', function(e) {
          if(e.key==='Enter'&&!e.shiftKey){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2)self._prompts.push(t);}}
        }, true);
        document.addEventListener('click', function(e) {
          var btn=e.target.closest('button[aria-label*="Send"],button[type="submit"]');if(btn){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2)self._prompts.push(t);}}
        }, true);
      },
      getPrompt: function() {
        registry.claude._hookInput();
        return (registry.claude._prompts && registry.claude._prompts[0]) || '';
      }
    },
    chatgpt: {
      promptSelectors: ['[data-message-author-role="user"] .whitespace-pre-wrap','[data-message-author-role="user"]'],
      getPrompt: function() {
        var sels = ['[data-message-author-role="user"] .whitespace-pre-wrap','[data-message-author-role="user"]'];
        for (var i = 0; i < sels.length; i++) {
          var els = document.querySelectorAll(sels[i]);
          if (els.length > 0) { var t = (els[0].textContent||'').trim().slice(0,500); if(t.length>2) return t; }
        }
        return '';
      }
    },
    gemini: {
      promptSelectors: ['.user-query-bubble-with-background'],
      getPrompt: function() {
        var els = document.querySelectorAll('.user-query-bubble-with-background');
        return els.length > 0 ? (els[0].textContent||'').trim().slice(0,500) : '';
      }
    },
    perplexity: {
      promptSelectors: ['[data-testid="user-message"]','.my-md-query'],
      getPrompt: function() {
        var sels = ['[data-testid="user-message"]','.my-md-query'];
        for (var i = 0; i < sels.length; i++) {
          var els = document.querySelectorAll(sels[i]);
          if (els.length > 0) { var t = (els[0].textContent||'').trim().slice(0,500); if(t.length>2) return t; }
        }
        return '';
      }
    },
    deepseek: {
      _prompts: [],
      getPrompt: function() {
        var self = registry.deepseek;
        var sels = ['[class*="_9663006"]','[class*="human-turn"]','[class*="user-message"]'];
        for (var i = 0; i < sels.length; i++) {
          try {
            var els = queryAllDeep(sels[i]);
            if (els.length > 0) {
              self._prompts = Array.from(els).map(function(el){return(el.textContent||'').trim();}).filter(function(t){return t.length>2&&t.length<2000;});
              if (self._prompts.length > 0) return self._prompts[0];
            }
          } catch(_) {}
        }
        return '';
      }
    },
    grok: {
      _prompts: [], _hooked: false,
      _hookInput: function() {
        var self = registry.grok; if(self._hooked) return; self._hooked = true;
        document.addEventListener('keydown', function(e) {
          if(e.key==='Enter'&&!e.shiftKey){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2)self._prompts.push(t);}}
        }, true);
        document.addEventListener('click', function(e) {
          var btn=e.target.closest('button[type="submit"]');if(btn){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2)self._prompts.push(t);}}
        }, true);
      },
      getPrompt: function() { registry.grok._hookInput(); return (registry.grok._prompts&&registry.grok._prompts[0])||''; }
    },
    mistral: {
      promptSelectors: ['[data-message-role="user"] p','[class*="UserMessage"]'],
      getPrompt: function() {
        var sels = ['[data-message-role="user"] p','[class*="UserMessage"]'];
        for (var i = 0; i < sels.length; i++) {
          var els = document.querySelectorAll(sels[i]);
          if (els.length > 0) { var t = (els[0].textContent||'').trim().replace(/\s*\d{1,2}:\d{2}(?:am|pm)?\s*/gi,'').slice(0,500); if(t.length>2) return t; }
        }
        return '';
      }
    },
    meta: {
      _prompts: [], _hooked: false,
      _hookInput: function() {
        var self = registry.meta; if(self._hooked) return; self._hooked = true;
        document.addEventListener('keydown', function(e) {
          if(e.key==='Enter'&&!e.shiftKey){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2)self._prompts.push(t);}}
        }, true);
        document.addEventListener('click', function(e) {
          var btn=e.target.closest('button[type="submit"],button[aria-label*="Send"]');if(btn){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2)self._prompts.push(t);}}
        }, true);
      },
      getPrompt: function() { registry.meta._hookInput(); return (registry.meta._prompts&&registry.meta._prompts[0])||''; }
    }
  };

  const PROVIDER_CONFIG = registry[PROVIDER_ID];

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
  



  

  // Collect image URLs from response DOM, send to background for fetch+upload
  async function captureResponseImages(token) {
    try {
      const selectors = PROVIDER_CONFIG.responseSelectors || [];
      let bestEl = null, bestLen = 0;
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        const last = els.filter(el => el.textContent.trim().length > 30).pop();
        if (last && last.textContent.trim().length > bestLen) {
          bestLen = last.textContent.trim().length;
          bestEl = last;
        }
      }
      if (!bestEl) return [];

      // Look in response element first, then fall back to provider-specific image containers
      var imgEls = Array.from(bestEl.querySelectorAll('img'));
      
      // Claude: web search images are outside the response container
      if (PROVIDER === 'claude' && imgEls.length === 0) {
        imgEls = Array.from(document.querySelectorAll('img.absolute, img[class*="object-cover"]'));
      }
      // Gemini: search result images
      if (PROVIDER === 'gemini' && imgEls.length === 0) {
        imgEls = Array.from(document.querySelectorAll('img[src*="googleapis"], img[src*="gstatic"]'));
      }
      // Perplexity: search result images
      if (PROVIDER === 'perplexity' && imgEls.length === 0) {
        imgEls = Array.from(document.querySelectorAll('img[src*="pplx"], img[class*="result"]'));
      }

      const imgUrls = imgEls.map(function(img) {
        return img.src || '';
      }).filter(function(src) {
        if (!src || src.startsWith('data:image/svg') || src.startsWith('data:image/gif') || src.startsWith('data:image/png;base64')) return false;
        if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) return false;
        return true;
      }).slice(0, 5);

      if (!imgUrls.length) return [];

      // Send to background script which bypasses CORS restrictions
      return await new Promise(function(resolve) {
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: {
          type: 'UPLOAD_IMAGES',
          token: token,
          urls: imgUrls
        }}, '*');
        var handler = function(e) {
          if (e.data && e.data.type === '__DIARY_IMAGES_UPLOADED__') {
            window.removeEventListener('message', handler);
            resolve(e.data.urls || []);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(function() { window.removeEventListener('message', handler); resolve([]); }, 30000);
      });
    } catch(e) {
      console.warn('[Diary] captureResponseImages error:', e.message);
      return [];
    }
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
        // Use provider getPrompt override if available
        if (PROVIDER_CONFIG.getPrompt) {
          try { prompt = PROVIDER_CONFIG.getPrompt() || ''; } catch(_) {}
        }
        // Otherwise use registry promptSelectors
        if (!prompt) {
          var pSelectors = PROVIDER_CONFIG.promptSelectors || ['[data-message-author-role="user"]', '[class*="user-message"]'];
          for (var ps = 0; ps < pSelectors.length; ps++) {
            try {
              var pEls = document.querySelectorAll(pSelectors[ps]);
              if (pEls.length > 0) {
                var pText = pEls[0].textContent.trim().slice(0, 500);
                pText = pText.replace(/^You said\s*/i,'').replace(/^User:\s*/i,'').trim();
                // Strip timestamps appended to question text
                pText = pText.replace(/\s*\d{1,2}:\d{2}(?:am|pm)/gi, '').trim();
                if (pText && pText.length > 2 && !/^\d{1,2}:\d{2}/.test(pText) && !/^\d{1,2} \w+ \d{4}/.test(pText)) {
                  prompt = pText;
                  break;
                }
              }
            } catch(_) {}
          }
        }

        // Collect images from all captured turns (DOM path stores images per turn)
        var images = [];
        if (window.__diaryCapture && window.__diaryCapture.turns) {
          window.__diaryCapture.turns.forEach(function(t) {
            if (t.images) images = images.concat(t.images);
          });
        }
        if (images.length === 0 && ['claude','chatgpt','gemini','perplexity'].includes(PROVIDER)) {
          images = await captureResponseImages(token);
        }
        images = images.filter(function(s,i,a){ return a.indexOf(s)===i; }); // dedupe
        // Use interceptor-captured turns (clean API text, no DOM artifacts)
        var fullThread = null;
        if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length) {
          var currentHost = window.location.hostname;
          // Match all turns from this hostname — handles SPA navigation (e.g. claude.ai/new -> claude.ai/chat/UUID)
          var captureTurns = window.__diaryCapture.turns.filter(function(t) {
            try { return new URL(t.url).hostname === currentHost; } catch(e) { return false; }
          });
          if (captureTurns.length) {
            // Build prompts array for bubbles - use _prompts (hook-based) or read all DOM elements
            var prompts = [];
            if (PROVIDER_CONFIG._prompts && PROVIDER_CONFIG._prompts.length) {
              prompts = PROVIDER_CONFIG._prompts;
            } else {
              // Read ALL prompt elements from DOM at save time
              var pSels = PROVIDER_CONFIG.promptSelectors || [];
              for (var si = 0; si < pSels.length; si++) {
                var pEls = document.querySelectorAll(pSels[si]);
                if (pEls.length > 0) {
                  prompts = Array.from(pEls).map(function(el) {
                    return (el.textContent||'').trim()
                      .replace(/^You said\s*/i,'')
                      .replace(/\s*\d{1,2}:\d{2}(?:am|pm)?\s*/gi,'')
                      .trim();
                  }).filter(function(t) { return t.length > 2; });
                  break;
                }
              }
              if (!prompts.length && prompt) prompts = [prompt];
            }
            var threadParts = [];
            for (var ci = 0; ci < captureTurns.length; ci++) {
              if (prompts[ci]) threadParts.push('**' + prompts[ci].slice(0,2000) + '**');
              threadParts.push(captureTurns[ci].text.replace(/\n{3,}/g,'\n\n').trim());
            }
            fullThread = threadParts.join('\n\n');
            console.log('[Diary] interceptor turns:', captureTurns.length, fullThread.slice(0,80));
          }
        }
        var contentToSave = fullThread;
        console.log('[Diary] contentToSave preview:', contentToSave.slice(0,300));
        // saveUrl: use most specific URL available
        var saveUrl = canonicalUrl();
        if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length) {
          var turnUrls = window.__diaryCapture.turns
            .map(function(t) { return t.url ? t.url.split('?')[0] : ''; })
            .filter(function(u) { return u.length > saveUrl.length; });
          if (turnUrls.length) {
            turnUrls.sort(function(a, b) { return b.length - a.length; });
            saveUrl = turnUrls[0];
          }
        }

                var data = await new Promise(function(resolve, reject) {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: {
            type: 'SAVE_TO_DIARY',
            token: token,
            source: PROVIDER,
            prompt: prompt,
            content: contentToSave,
            append: false, // always send complete conversation snapshot
            url: saveUrl,
            images: images
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




  // ── Listen for messages from background (via isolated relay) ───────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== '__DIARY_FROM_EXT__') return;
    const message = event.data.payload;
    if (message.type === 'INJECT_PROMPT' || message.type === 'INJECT_PENDING_PROMPT') {
      injectPrompt(message.prompt).then(ok => {
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'INJECT_RESULT', ok, provider: PROVIDER }}, '*');
      });
    }
    if (message.type === 'CHECK_AUTH') {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'AUTH_RESULT', authenticated: isAuthenticated(), provider: PROVIDER }}, '*');
    }
  });

  // Expose direct injection function for background scripting
  window.__diaryInject = (prompt) => {
    console.log(`[Forge] ${PROVIDER}: __forgeInject called`);
    injectPrompt(prompt);
  };


  // For providers that need submit-time prompt capture, hook inputs early
  if (PROVIDER_CONFIG._hookInput) {
    setTimeout(function() { PROVIDER_CONFIG._hookInput(); }, 1500);
    setTimeout(function() { PROVIDER_CONFIG._hookInput(); }, 5000);
  }

  // Listen for pending prompt pushed from background via isolated world bridge
  (function() {
    window.addEventListener('message', function(ev) {
      if (!ev.data) return;
      // Support both direct injection and __DIARY_FROM_EXT__ wrapper
      var prompt = null;
      if (ev.data.type === '__DIARY_FROM_EXT__' && ev.data.payload && ev.data.payload.type === 'INJECT_PENDING_PROMPT') {
        prompt = ev.data.payload.prompt;
      } else if (ev.data.type === '__DIARY_INJECT_PROMPT__') {
        prompt = ev.data.prompt;
      }
      if (!prompt) return;
      if (!prompt) return;
      console.log('[Forge] Injecting pending prompt:', prompt.slice(0,40));
      setTimeout(function() {
        var inp = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
        if (!inp) return;
        if (inp.tagName === 'TEXTAREA') {
          inp.value = prompt;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          inp.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, prompt);
        }
        inp.focus();
        console.log('[Forge] Prompt injected');
      }, 500);
    });
  })();

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


  // ── DOM reader for providers not captured by fetch interceptor ───────────────
  // Triggered by webRequest completion signal from background.js
  // Reads fully-rendered DOM text after a settle delay

  // Global DOM text cleaner - same artifacts as interceptor cleanText
  function stripEntityArtifacts(s) {
    var out = ''; var i = 0;
    while (i < s.length) {
      if (s.slice(i, i+7) === 'entity[') {
        var depth = 0; var j = i + 7;
        while (j < s.length) {
          if (s[j] === '[') depth++;
          else if (s[j] === ']') { if (depth === 0) { j++; break; } depth--; }
          j++;
        }
        var inner = s.slice(i + 7, j - 1);
        var parts = inner.match(/"([^"]*)"/g) || [];
        out += parts.length >= 2 ? parts[1].replace(/"/g, '') : '';
        i = j;
      } else if (s.slice(i, i+12) === 'image_group{') {
        var depth = 0; var j = i + 12;
        while (j < s.length) {
          if (s[j] === '{') depth++;
          else if (s[j] === '}') { if (depth === 0) { j++; break; } depth--; }
          j++;
        }
        i = j;
      } else { out += s[i]; i++; }
    }
    return out;
  }

  function cleanDomText(text) {
    return stripEntityArtifacts(text)
      .replace(/[-\u2013]\s*(?:\d+\s+)+[-\u2013]/g, '')
      .replace(/\[\d+\]/g, '')
      .replace(/^Recognized .{0,100}$/gm, '')
      .replace(/^Searched the web$/gm, '')
      .replace(/^Read \d+ web pages?$/gm, '')
      .replace(/^Worked for \d+s$/gm, '')
      .replace(/maps\.apple[^\s]*/g, '')
      .replace(/\+\d+\s*$/gm, '')
      .replace(/^[A-Z][a-zA-Z]+(\.[a-z]+)?\s*$/gm, '')
      .replace(/\u2060[^\s]*/g, '')
      .replace(/Click to open side panel for more information/g, '')
      .replace(/^Open·.*$/gm, '')
      .replace(/^Closes at.*$/gm, '')
      .replace(/^\d+\s+sources?\s*$/gm, '')
      .replace(/\d+\s+sources?$/gm, '')
      .replace(/^wikipedia\s*$/gim, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  var DOM_SELECTORS = {
    'gemini.google.com': {
      response: 'message-content .markdown',
      prompt: 'user-query-text',
      clean: function(text) {
        return text.replace(/^Sources?\n[\s\S]*?(?=\n\n|$)/m, '')
                   .replace(/\[\d+\]/g, '')
                   .replace(/\n{3,}/g, '\n\n')
                   .trim();
      }
    },
    'www.perplexity.ai': {
      response: '.prose',
      prompt: '[data-testid="user-message"]',
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'chat.deepseek.com': {
      response: '.ds-markdown',
      prompt: '[class*="user-message"], .fbb737a4',
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'chat.mistral.ai': {
      response: '.markdown-container-style:not(.text-muted)',
      prompt: '[class*="UserMessage"], [data-testid="user-message"]',
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'grok.com': {
      response: '.message-bubble',
      prompt: '[data-testid="user-message"], .user-message',
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'www.meta.ai': {
      response: '[class*="assistant"] [class*="content"]',
      prompt: '[class*="user"] [class*="content"]',
      clean: function(text) {
        return text.replace(/Here\'s the map.*$/m, '')
                   .replace(/\n{3,}/g, '\n\n')
                   .trim();
      }
    }
  };

  function readDomResponse() {
    var host = window.location.hostname;
    var config = DOM_SELECTORS[host];
    if (!config) return null;

    // Read ALL response elements - complete conversation snapshot
    var els = document.querySelectorAll(config.response);
    if (!els.length) return null;

    var parts = Array.from(els).map(function(el) {
      return (el.innerText || el.textContent || '').trim();
    }).filter(function(t) { return t.length > 20; });

    if (!parts.length) return null;

    // If provider has prompt selector, interleave prompts with responses
    if (config.prompt) {
      var promptEls = document.querySelectorAll(config.prompt);
      var prompts = Array.from(promptEls).map(function(el) {
        return (el.innerText || el.textContent || '').trim();
      }).filter(function(t) { return t.length > 0; });

      var interleaved = [];
      for (var i = 0; i < parts.length; i++) {
        if (prompts[i]) interleaved.push('**' + prompts[i] + '**');
        interleaved.push(parts[i]);
      }
      return cleanDomText(config.clean(interleaved.join('\n\n')));
    }

    return cleanDomText(config.clean(parts.join('\n\n')));
  }

  function readLastPrompt() {
    var host = window.location.hostname;
    var config = DOM_SELECTORS[host];
    if (!config || !config.prompt) return null;
    var els = document.querySelectorAll(config.prompt);
    if (!els.length) return null;
    return (els[els.length - 1].innerText || els[els.length - 1].textContent || '').trim().slice(0, 500);
  }

  // Listen for AI response completion signal from background.js
  var _domSettleTimer = null;
  var _lastAICompleteTs = 0;

  // Poll window.__diaryAIComplete as fallback for when postMessage is blocked by module context
  setInterval(function() {
    var sig = window.__diaryAIComplete;
    if (!sig || sig.ts === _lastAICompleteTs) return;
    _lastAICompleteTs = sig.ts;
    // Skip DOM read if interceptor already captured this turn
    if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length > 0) {
      var lastTurn = window.__diaryCapture.turns[window.__diaryCapture.turns.length - 1];
      if (Date.now() - lastTurn.ts < 5000) return; // interceptor fired recently
    }
    console.log('[Diary content] AI complete via window property');
    if (_domSettleTimer) clearTimeout(_domSettleTimer);
    _domSettleTimer = setTimeout(function() {
      var text = readDomResponse();
      if (text && text.length > 50) {
        if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
        var turns = window.__diaryCapture.turns;
        var last = turns.length ? turns[turns.length - 1] : null;
        if (!last || last.text.slice(0, 50) !== text.slice(0, 50)) {
          var turnText = text; // Full conversation snapshot from readDomResponse
          // Capture images from response DOM
          var host = window.location.hostname;
          var config = DOM_SELECTORS[host];
          var imgUrls = [];
          if (config) {
            var els = document.querySelectorAll(config.response);
            var el = els[els.length - 1];
            if (el) {
              imgUrls = Array.from(el.querySelectorAll('img'))
                .map(function(img) { return img.src || ''; })
                .filter(function(src) { return src && src.startsWith('http') && !src.includes('svg'); });
            }
          }
          turns.push({ text: turnText, url: canonicalUrl(), ts: Date.now(), images: imgUrls });
          console.log('[Diary DOM] Captured:', text.slice(0, 80));
          window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
            detail: { url: canonicalUrl() }
          }));
        }
      }
    }, 3000);
  }, 500);
  window.addEventListener('message', function(event) {
    if (!event.data) return;
    if (event.data.type) console.log('[Diary content] message received:', event.data.type);
    if (event.data.type !== 'AI_RESPONSE_COMPLETE') return;
    var msg = event.data;
    // Skip DOM read if interceptor already captured this turn
    if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length > 0) {
      var lastTurn = window.__diaryCapture.turns[window.__diaryCapture.turns.length - 1];
      if (Date.now() - lastTurn.ts < 5000) return;
    }
    // Debounce - wait for DOM to fully settle after stream completes
    if (_domSettleTimer) clearTimeout(_domSettleTimer);
    _domSettleTimer = setTimeout(function() {
      var text = readDomResponse();
      if (text && text.length > 50) {
        // Store in __diaryCapture.turns same as interceptor
        if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
        // Only add if not duplicate of last turn
        var turns = window.__diaryCapture.turns;
        var last = turns.length ? turns[turns.length - 1] : null;
        if (!last || last.text.slice(0, 50) !== text.slice(0, 50)) {
          var turnText = text; // Full conversation snapshot from readDomResponse
          // Capture images from response DOM
          var host = window.location.hostname;
          var config = DOM_SELECTORS[host];
          var imgUrls = [];
          if (config) {
            var els = document.querySelectorAll(config.response);
            var el = els[els.length - 1];
            if (el) {
              imgUrls = Array.from(el.querySelectorAll('img'))
                .map(function(img) { return img.src || ''; })
                .filter(function(src) { return src && src.startsWith('http') && !src.includes('svg'); });
            }
          }
          turns.push({ text: turnText, url: canonicalUrl(), ts: Date.now(), images: imgUrls });
          console.log('[Diary DOM] Captured:', text.slice(0, 80));
          window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
            detail: { url: canonicalUrl() }
          }));
        }
      }
    }, 3000);
  });

    // Global helper: send message to background via isolated world and await response
  // Uses unique msgId to prevent cross-contamination between concurrent requests
  // Cache auth token globally when received - avoids race condition at save time
  var _cachedDiaryToken = null;
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === '__DIARY_AUTH_TOKEN__' && e.data.token) {
      _cachedDiaryToken = e.data.token;
    }
  });
  // Request token proactively on page load
  window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'GET_AUTH_TOKEN' } }, '*');

  // Listen for interceptor capture — show save button when response captured
    window.addEventListener('__diaryInterceptorCapture', function() {
      injectSaveDiaryButton('intercepted');
    });

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

})()