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
      // Old selector targeted [data-message-author-role="user"], an
      // attribute that no longer exists in ChatGPT's current DOM (confirmed
      // live: the real structure uses data-turn="user"/"assistant" instead
      // — see DOM_SELECTORS['chatgpt.com'] above). That mismatch meant
      // getPrompt() always returned '', which is why diary entry titles
      // were coming through blank.
      promptSelectors: ['section[data-turn="user"] .text-base'],
      getPrompt: function() {
        var els = document.querySelectorAll('section[data-turn="user"] .text-base');
        if (els.length > 0) {
          var t = (els[0].textContent||'').trim().slice(0,500); // first user message = conversation topic
          if (t.length > 2) return t;
        }
        return '';
      }
    },

    gemini: {
      promptSelectors: ['.query-text-line', '.user-query-bubble-with-background'],
      getPrompt: function() {
        // .query-text-line is the actual question text element, confirmed
        // via live DOM inspection to be a SIBLING of Gemini's "You said"
        // sr-only label — not a parent of it — so this selector avoids the
        // "You said" leak at the source rather than needing to strip it
        // afterward. .user-query-bubble-with-background kept as a fallback
        // for older/differently-structured pages, with the same regex
        // strip as a defensive backup in case that fallback path fires.
        var els = document.querySelectorAll('.query-text-line');
        if (els.length > 0) {
          var t = (els[0].textContent || '').trim();
          if (t) return t.slice(0, 500);
        }
        var fallbackEls = document.querySelectorAll('.user-query-bubble-with-background');
        return fallbackEls.length > 0 ? (fallbackEls[0].textContent||'').replace(/^You said\s*/i,'').trim().slice(0,500) : '';
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
        if (PROVIDER === 'claude') {
          // ChatGPT moved to the DOM-provider branch below (see the 'else'
          // clause) — confirmed via live evidence that ChatGPT delivers
          // responses through React Router's inline server-streaming, not
          // a fetch/XHR call the interceptor can see, on both normal and
          // "Fast answer" responses. The historySeed/interceptor path above
          // remains Claude-only.
          var currentHost = window.location.hostname;
          var threadParts = [];

          // History seed: reconstructed from claude.ai's bulk conversation-fetch
          // endpoint (see diary-interceptor.js parseHistorySeed). Covers turns
          // that were already in the conversation before this page load —
          // the streaming-delta capture below can only see turns that stream
          // in AFTER the page loads, so without this, reopening an existing
          // chat (e.g. via "Open original") would only capture new turns and
          // silently drop everything that came before.
          var seed = window.__diaryCapture && window.__diaryCapture.historySeed;
          if (seed && seed.text) {
            try {
              // Exact URL match, with tolerance for a "/new" placeholder
              // transitioning to a real conversation ID — see the
              // captureTurns filter below for the full rationale (matches
              // the same fix, applied consistently to the seed too).
              var curUrl = canonicalUrl();
              if (seed.url === curUrl || /\/new(\?|$)/.test(seed.url)) {
                threadParts.push(seed.text);
              }
            } catch(e) {}
          }

          if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length) {
            // Match turns belonging to THIS SPECIFIC conversation, not just
            // this hostname. Confirmed live: window.__diaryCapture.turns
            // persists for the whole tab's lifetime (only cleared on a true
            // page reload), and these are single-page apps — switching to a
            // DIFFERENT conversation via the app's own sidebar never
            // triggers a reload. A hostname-only filter let turns from a
            // completely different, earlier conversation silently bleed
            // into an unrelated save (confirmed: an old nursing-conversation
            // answer appeared in a save for a new retail-conversation
            // question). Exact URL match fixes this, while still tolerating
            // a "/new" placeholder URL becoming a real conversation-ID URL
            // after the first message — the one legitimate case where the
            // current URL and a turn's stored URL are expected to differ
            // within the SAME conversation.
            var captureTurns = window.__diaryCapture.turns.filter(function(t) {
              var curUrl = canonicalUrl();
              return t.url === curUrl || /\/new(\?|$)/.test(t.url);
            });
            if (captureTurns.length) {
              var prompts = PROVIDER_CONFIG._prompts || [];
              for (var ci = 0; ci < captureTurns.length; ci++) {
                // The history endpoint can refetch mid-session (not just at page
                // load), so historySeed may already contain turns that were also
                // captured live here. Skip anything already present in the seed
                // to avoid duplicating it.
                var turnText = captureTurns[ci].text.replace(/\n{3,}/g,'\n\n').trim();
                if (seed && seed.text && turnText && seed.text.includes(turnText.slice(0, 200))) {
                  continue;
                }
                if (prompts[ci]) threadParts.push('**' + prompts[ci].slice(0,2000) + '**');
                threadParts.push(turnText);
              }
            }
          }

          if (threadParts.length) {
            fullThread = threadParts.join('\n\n');
            console.log('[Diary] thread parts:', threadParts.length, '(history seed:', !!seed, ') ', fullThread.slice(0,80));
          }
        } else if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length) {
          // Same cross-conversation contamination fix as the Claude branch
          // above — see the detailed comment there for the full rationale.
          var captureTurns = window.__diaryCapture.turns.filter(function(t) {
            var curUrl = canonicalUrl();
            return t.url === curUrl || /\/new(\?|$)/.test(t.url);
          });
          if (captureTurns.length) {
            // DOM providers: merge ALL captured snapshots, not just the
            // latest one. Confirmed live on a real 6-question DeepSeek
            // conversation: the saved entry contained ONLY the last
            // question's answer, even though each individual capture's
            // console log showed correct, distinct content for every
            // single turn as it happened. The element COUNT stayed
            // constant before/after scrolling (already tested, ruling out
            // simple node-removal virtualization) — but some virtual-list
            // implementations RECYCLE the same DOM nodes, silently
            // overwriting old content with new content in place, which
            // keeps the count constant while still losing old text. Each
            // snapshot was correct AT ITS OWN TIME, so merging every
            // stored snapshot (deduped by paragraph, first-seen order)
            // recovers everything even if any single later snapshot lost
            // earlier content to this kind of recycling.
            var mergeSeen = {};
            var mergedParts = [];
            captureTurns.forEach(function(turn) {
              var paras = turn.text.split(/\n{2,}/);
              paras.forEach(function(p) {
                var trimmed = p.trim();
                if (!trimmed || trimmed.length < 10) return;
                var key = trimmed.slice(0, 80);
                if (mergeSeen[key]) return;
                mergeSeen[key] = true;
                mergedParts.push(trimmed);
              });
            });
            fullThread = mergedParts.join('\n\n');
            // Prepend the already-computed, already-verified-correct prompt
            // as a bolded first line — matching the format Claude/ChatGPT's
            // saved content always has (a bolded question, then the
            // answer). Confirmed via direct log comparison tonight: Claude
            // content always starts "**question**\n\nanswer...", while
            // DOM-provider content (Gemini, Perplexity, DeepSeek, etc.)
            // never included the question at all — straight into the
            // answer. This is a real, testable hypothesis for the
            // provider-specific title-display difference reported live:
            // if the backend's title-generation step scans saved content
            // for something like "the first bolded line" to derive/inform
            // a title, providers whose content never has one would behave
            // differently through no fault of their own data being wrong.
            // This only prepends the FIRST question (matching what `prompt`
            // already holds) — NOT full per-turn interleaving for
            // follow-up questions, which is what buildGeminiThread
            // attempted and which caused a real regression earlier
            // tonight. This is intentionally much narrower and lower-risk:
            // one string concatenation using an already-proven-correct
            // variable, no new DOM selectors or walking logic at all.
            if (prompt && fullThread && fullThread.indexOf('**' + prompt) !== 0) {
              fullThread = '**' + prompt + '**\n\n' + fullThread;
            }
            console.log('[Diary] merged', captureTurns.length, 'snapshots into', mergedParts.length, 'unique paragraphs:', fullThread.slice(0,80));
          }
        }
        // ChatGPT-specific: use ChatGPT's OWN native "Copy response" button
        // per turn, then read the clipboard — this has been 100% clean in
        // every manual test tonight (no PUA-artifact stripping needed, no
        // backend-propagation-delay risk, no virtualization risk), unlike
        // both the DOM-reading and history-fetch approaches this session,
        // which each had a real, evidenced failure mode. This is now the
        // primary method; the history-fetch-with-retry logic below remains
        // as a fallback if clipboard access fails (e.g. permission denied)
        // or a turn's copy button can't be found.
        //
        // NOTE: this temporarily overwrites the user's system clipboard —
        // we save and restore whatever was there beforehand so Save to
        // Diary doesn't have a surprising side effect on unrelated
        // copy/paste the user may be in the middle of.
        var chatgptClipboardWorked = false;
        if (PROVIDER === 'chatgpt') {
          try {
            var originalClipboard = '';
            try { originalClipboard = await navigator.clipboard.readText(); } catch(e) {}

            // ChatGPT virtualizes the conversation view — confirmed live:
            // turn counts changed after scrolling to the top. A SINGLE
            // scroll + fixed 800ms wait was NOT enough on its own — also
            // confirmed live: user-turn and assistant-turn counts came back
            // MISMATCHED (2 vs 3) even after that scroll, meaning
            // virtualization hadn't settled AND, separately, the previous
            // code paired userSections[i] with assistantSections[i] by raw
            // array index — when those two counts differ, that silently
            // pairs the wrong question with the wrong answer rather than
            // just leaving a gap, which is a worse failure mode than
            // missing content. Fixed two ways: (1) walk turns in actual
            // DOCUMENT ORDER via a single combined query, using each
            // element's own data-turn attribute, instead of pairing two
            // separately-indexed NodeLists that virtualization can make
            // inconsistent with each other, and (2) below — the polling
            // used to just wait for the DOM count to "stop changing", but
            // that's NOT the same as "correct": confirmed live, it
            // stabilized at 9 turns for a conversation that actually had
            // 10, and silently accepted that as done. Polling now compares
            // against the TRUE turn count from the history-JSON endpoint
            // (ChatGPT's actual backend record, not the rendered/
            // virtualized DOM) instead of just checking for its own
            // agreement with itself.
            //
            // The history-fetch itself can transiently fail — confirmed
            // live: diary-content.js issuing its OWN fetch() to this
            // endpoint at Save-click time reliably got a 404, while the
            // interceptor's PASSIVE capture (eavesdropping on a fetch
            // ChatGPT's own client code issues, moments earlier, on the
            // identical URL) succeeded. That's not random flakiness — our
            // own constructed request is very likely missing something
            // ChatGPT's own client attaches internally (an in-memory auth
            // token, a custom header, etc. — not something a plain fetch()
            // call replicates). Read from the interceptor's cache
            // (window.__diaryCapture.historySeed, already populated by a
            // request that's proven to succeed) instead of re-fetching
            // ourselves; only attempt our own fetch as a last resort if no
            // cache is available at all.
            var trueTurnCount = null;
            try {
              var cachedSeed = window.__diaryCapture && window.__diaryCapture.historySeed;
              if (cachedSeed && typeof cachedSeed.turnCount === 'number') {
                trueTurnCount = cachedSeed.turnCount;
                console.log('[Diary] ChatGPT true turn count from CACHED history JSON (age', Math.round((Date.now() - cachedSeed.ts) / 1000), 's):', trueTurnCount);
              } else {
                console.error('[Diary] ChatGPT no cached history JSON available yet — attempting a direct fetch as last resort (may 404)');
                var convMatchForCount = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
                if (convMatchForCount) {
                  var countResp = await fetch('/backend-api/conversation/' + convMatchForCount[1]);
                  if (countResp.ok) {
                    var countJson = await countResp.json();
                    var mapping = countJson && countJson.mapping;
                    if (mapping) {
                      trueTurnCount = 0;
                      for (var mid in mapping) {
                        var mmsg = mapping[mid] && mapping[mid].message;
                        if (mmsg && mmsg.content && mmsg.content.content_type === 'text') {
                          var mrole = mmsg.author && mmsg.author.role;
                          if (mrole === 'user' || mrole === 'assistant') trueTurnCount++;
                        }
                      }
                      console.log('[Diary] ChatGPT true turn count from direct fetch (last resort, succeeded):', trueTurnCount);
                    }
                  } else {
                    console.error('[Diary] ChatGPT last-resort direct fetch also failed, HTTP', countResp.status, '— proceeding with stability-only polling');
                  }
                }
              }
            } catch(e) {
              console.error('[Diary] ChatGPT could not determine true turn count, falling back to stability-only polling:', e);
            }

            var scrollRoot = document.querySelector('[data-scroll-root]') || document.getElementById('thread');
            if (scrollRoot) {
              scrollRoot.scrollTop = 0;
              var lastTurnCount = -1;
              for (var settleAttempt = 0; settleAttempt < 12; settleAttempt++) {
                await new Promise(function(r){ setTimeout(r, 500); });
                var curCount = document.querySelectorAll('section[data-turn="user"], section[data-turn="assistant"]').length;
                // Success condition: reached the known-true count (best
                // case), OR — if we couldn't determine a true count —
                // fall back to the old "stopped changing" heuristic, which
                // is weaker but better than nothing.
                if (trueTurnCount !== null && curCount >= trueTurnCount) { lastTurnCount = curCount; break; }
                if (trueTurnCount === null && curCount === lastTurnCount) break;
                lastTurnCount = curCount;
                scrollRoot.scrollTop = 0; // re-assert in case virtualization shifted the scroll position back
              }
              console.log('[Diary] ChatGPT scroll-settle finished, DOM turn count:', lastTurnCount, 'true turn count:', trueTurnCount);
              if (trueTurnCount !== null && lastTurnCount < trueTurnCount) {
                console.error('[Diary] ChatGPT scroll-settle NEVER reached the true turn count (', lastTurnCount, 'of', trueTurnCount, ') — the DOM is known-incomplete, skipping clipboard method entirely and falling through to the JSON-based fallback instead');
              }
            }

            // If we know the true count and the DOM never reached it, don't
            // even attempt the clipboard method — proceeding would build
            // expectedCount from the DOM's own (wrong, too-low) count,
            // which would make the all-or-nothing check "succeed" against
            // an incorrect target and silently save an incomplete result
            // again, exactly the failure this whole check exists to catch.
            var domKnownIncomplete = (trueTurnCount !== null && lastTurnCount < trueTurnCount);

            // Combined query, document order — each element carries its own
            // role via data-turn, so pairing no longer depends on two
            // separate NodeLists having matching lengths.
            var allTurnEls = domKnownIncomplete ? [] : document.querySelectorAll('section[data-turn="user"], section[data-turn="assistant"]');
            var clipParts = [];
            var expectedCount = allTurnEls.length;
            var clipSuccessCount = 0;
            var firstUserClip = ''; // used for the title, replacing the old DOM-based getPrompt() path
            var sawFirstUser = false;

            for (var ti = 0; ti < allTurnEls.length; ti++) {
              var turnEl = allTurnEls[ti];
              var role = turnEl.getAttribute('data-turn');
              var copyBtn = turnEl.querySelector('button[data-testid="copy-turn-action-button"]');
              if (!copyBtn) {
                console.error('[Diary] ChatGPT copy button not found on', role, 'turn at position', ti, '— treating whole attempt as failed');
                continue;
              }
              copyBtn.click();
              await new Promise(function(r){ setTimeout(r, 400); }); // let the clipboard write complete
              try {
                var clipText = await navigator.clipboard.readText();
                if (clipText && clipText.trim().length > 0) {
                  var ct = clipText.trim();
                  if (role === 'user') {
                    clipParts.push('**' + ct.slice(0, 2000) + '**');
                    if (!sawFirstUser) { firstUserClip = ct; sawFirstUser = true; }
                  } else {
                    clipParts.push(ct);
                  }
                  clipSuccessCount++;
                } else {
                  console.error('[Diary] ChatGPT clipboard empty on', role, 'turn at position', ti);
                }
              } catch(e) {
                console.error('[Diary] ChatGPT clipboard read failed on', role, 'turn at position', ti, e);
              }
            }

            try { if (originalClipboard) await navigator.clipboard.writeText(originalClipboard); } catch(e) {}

            // ALL-OR-NOTHING across BOTH roles: only trust this method if
            // every single turn (user AND assistant) succeeded. A partial
            // success must NOT be silently accepted — that would produce
            // exactly the kind of quietly-incomplete save this whole
            // rebuild was meant to fix, just via a different mechanism.
            // Falls through to the history-fetch fallback below instead.
            if (expectedCount > 0 && clipSuccessCount === expectedCount) {
              chatgptClipboardWorked = true;
              fullThread = clipParts.join('\n\n');
              if (firstUserClip) prompt = firstUserClip.slice(0, 500); // overrides the earlier DOM-based getPrompt() result for the title
              console.log('[Diary] ChatGPT clipboard-copy method, ALL', expectedCount, 'turns (both roles) succeeded, length:', fullThread.length, 'title:', prompt.slice(0,60));
            } else {
              console.error('[Diary] ChatGPT clipboard-copy method: only', clipSuccessCount, 'of', expectedCount, 'turns succeeded — rejecting partial result, falling back');
            }
          } catch(e) {
            console.error('[Diary] ChatGPT clipboard-copy method FAILED entirely:', e);
          }
        }
        // ChatGPT-specific FALLBACK: fetch the conversation-history endpoint
        // fresh at Save-click time and parse it with the same history-JSON
        // parser used for reload-recovery (window.__diaryParseChatGPTHistorySeed,
        // exposed by diary-interceptor.js). This replaces DOM-reading as
        // the content source for ChatGPT — DOM reading proved unreliable
        // for long responses (confirmed live: content missing from the
        // MIDDLE of a response, matching viewport virtualization dropping
        // scrolled-out-of-view content, not a timing issue at all). The
        // history endpoint reads ChatGPT's actual backend data model
        // directly — no rendering, no viewport, nothing to virtualize.
        // Runs unconditionally for chatgpt (outside the branches above), so
        // it still works even if the DOM MutationObserver never captured
        // anything at all.
        //
        // A SINGLE fetch immediately after Save is clicked is not enough —
        // confirmed live: the first save came back partial, and simply
        // returning and saving again (after time had passed) produced a
        // complete result with no code changes in between. That points to
        // a genuine backend propagation delay — ChatGPT's UI finishes
        // streaming and displays the answer before its own backend has
        // fully persisted that last message into the record this endpoint
        // reads from. Retry with a short delay, only accepting the result
        // once two consecutive fetches agree, so we don't save a
        // known-transient partial state.
        // ChatGPT-specific FALLBACK: use the cached history-JSON text from
        // the interceptor's PASSIVE capture (window.__diaryCapture.historySeed)
        // instead of fetching the endpoint ourselves — confirmed live that
        // our own fetch() to this endpoint reliably 404s at Save-click time
        // while the interceptor's eavesdropped capture of ChatGPT's own
        // client-issued fetch succeeds consistently (see trueTurnCount
        // block above for the full explanation). Only attempts a direct
        // fetch as a last resort if no cache exists at all.
        if (PROVIDER === 'chatgpt' && !chatgptClipboardWorked) {
          try {
            var cachedSeedForContent = window.__diaryCapture && window.__diaryCapture.historySeed;
            if (cachedSeedForContent && cachedSeedForContent.text && cachedSeedForContent.text.length > 50) {
              fullThread = cachedSeedForContent.text;
              console.log('[Diary] ChatGPT using CACHED history text (age', Math.round((Date.now() - cachedSeedForContent.ts) / 1000), 's), length:', fullThread.length);
            } else {
              console.error('[Diary] ChatGPT no cached history text available — attempting a direct fetch as last resort (may 404)');
              var convMatch = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
              if (convMatch && window.__diaryParseChatGPTHistorySeed) {
                var histLastText = null;
                for (var histAttempt = 0; histAttempt < 5; histAttempt++) {
                  var histResp = await fetch('/backend-api/conversation/' + convMatch[1]);
                  if (!histResp.ok) {
                    console.error('[Diary] ChatGPT last-resort history-fetch got HTTP', histResp.status, 'on attempt', histAttempt + 1);
                    histLastText = null;
                    if (histAttempt < 4) await new Promise(function(r){ setTimeout(r, 1500); });
                    continue;
                  }
                  var histJson = await histResp.json();
                  var histText = window.__diaryParseChatGPTHistorySeed(histJson);
                  console.log('[Diary] ChatGPT last-resort history-fetch attempt', histAttempt + 1, 'length:', histText.length);
                  if (histText && histText.length > 50 && histText === histLastText) {
                    fullThread = histText;
                    console.log('[Diary] ChatGPT last-resort history-fetch stable, length:', fullThread.length);
                    break;
                  }
                  histLastText = histText;
                  if (histAttempt < 4) await new Promise(function(r){ setTimeout(r, 1500); });
                }
                if (!fullThread && histLastText && histLastText.length > 50) {
                  fullThread = histLastText;
                  console.log('[Diary] ChatGPT last-resort history-fetch used last attempt (never fully stabilized), length:', fullThread.length);
                }
              }
            }
          } catch(e) {
            console.error('[Diary] ChatGPT history fallback FAILED:', e);
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
    // NOTE: no auto-removal timeout here. injectSaveDiaryButton() already
    // removes any existing button at the start before injecting a new one,
    // so a fresh turn naturally replaces a stale button — a fixed timer
    // isn't needed for cleanup and only causes real harm: it silently
    // removes the user's ability to save if they take more than the
    // timeout to read a response, think, or verify something first.
    // Confirmed live: this was firing mid-way through normal use.
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
      .replace(/^You said\s*/gim, '')
      .replace(/^Gemini said\s*/gim, '')
      .replace(/^Gemini\s*$/gm, '')
      .replace(/^(?:New York University|Encyclopedia Britannica|Live More, Travel More|Wikipedia|Britannica|BBC|CNN|Reuters|AP News|Forbes|Bloomberg|World Population Review|Texas State Historical Association|Arctic Race|Life in Norway|Guidesly|Wikivoyage|Statbel|statbel\.fgov\.be|Census Bureau|worldpopulationreview\.com|Point2Homes|Cstx\.gov|Kiddle)\s*$/gm, '')
      .replace(/Click to open side panel for more information/g, '')
      .replace(/\.\s*Source:\s*[^\n]*/g, '.')
      .replace(/^Source:\s*[^\n]*/gm, '')
      .replace(/^Open·.*$/gm, '')
      .replace(/^Closes at.*$/gm, '')
      .replace(/^\s*Source:.*$/gm, '')
      .replace(/\.\s*Source:.*$/gm, '.')
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
      response: '.markdown-container-style, [class*="markdown"], [class*="prose"], [class*="MessageContent"], [class*="assistant"] p',
      prompt: '[class*="UserMessage"], [data-testid="user-message"], [data-message-role="user"]',
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
    },
    'chatgpt.com': {
      // ChatGPT delivers responses via React Router's inline server-streaming
      // (script tags executing during page load), not a separate fetch/XHR
      // call — confirmed via DevTools: Network tab shows zero matching
      // requests for a completed response, and view-source shows
      // window.__reactRouterContext.streamController.enqueue(...)/close()
      // script tags carrying the content. The interceptor's fetch/XHR
      // patches structurally cannot see this, on ANY response (not just
      // "Fast answer" ones — confirmed on a normal long response too), so
      // DOM reading is the primary capture path here, not a fallback.
      response: 'section[data-turn="assistant"] .text-base',
      prompt: 'section[data-turn="user"] .text-base', // TODO: verify against live DOM — not yet directly confirmed
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    }
  };

  // ── Shared: HTML structure -> Markdown conversion ──────────────────────────
  // Global default per the architecture already documented at the top of
  // this file ("Shared utilities... are defaults that providers can
  // override"). Converts real rendered HTML (headers, lists, tables, bold/
  // italic, links) to markdown syntax, instead of flattening everything to
  // plain text via innerText — which is what every DOM provider did before
  // this, losing all structure. Works at the HTML-tag level (h1-h6, ul/ol/
  // li, table/tr/td, strong/em, a, code/pre) rather than per-provider
  // selectors, since markdown-rendering libraries across these products
  // all produce broadly similar standard HTML for the actual content
  // structure, even though the surrounding wrapper markup differs per site.
  // Verified via unit tests against realistic HTML (nested lists, tables,
  // headers, bold labels, links, empty/malformed elements, deep nesting)
  // before being wired in here.
  function htmlToMarkdown(el) {
    if (!el) return '';

    function walk(node, listDepth) {
      listDepth = listDepth || 0;
      if (node.nodeType === 3) { // TEXT_NODE
        // Whitespace-only text nodes are common between sibling block-level
        // elements in real HTML and carry no content — collapsing them to
        // a single space left stray artifacts in testing; drop them
        // entirely instead.
        if (/^\s*$/.test(node.textContent)) return '';
        return node.textContent.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== 1) return '';

      var tag = node.tagName.toLowerCase();
      var children = Array.from(node.childNodes);

      function childrenText(depth) {
        return children.map(function(c) { return walk(c, depth); }).join('');
      }

      switch (tag) {
        case 'h1': return '\n\n# ' + childrenText(listDepth).trim() + '\n\n';
        case 'h2': return '\n\n## ' + childrenText(listDepth).trim() + '\n\n';
        case 'h3': return '\n\n### ' + childrenText(listDepth).trim() + '\n\n';
        case 'h4': return '\n\n#### ' + childrenText(listDepth).trim() + '\n\n';
        case 'h5': return '\n\n##### ' + childrenText(listDepth).trim() + '\n\n';
        case 'h6': return '\n\n###### ' + childrenText(listDepth).trim() + '\n\n';
        case 'strong': case 'b': {
          var tb = childrenText(listDepth).trim();
          return tb ? '**' + tb + '**' : '';
        }
        case 'em': case 'i': {
          var ti = childrenText(listDepth).trim();
          return ti ? '*' + ti + '*' : '';
        }
        case 'code':
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
            return childrenText(listDepth);
          }
          return '`' + childrenText(listDepth) + '`';
        case 'pre':
          return '\n\n```\n' + node.textContent.trim() + '\n```\n\n';
        case 'a': {
          var href = node.getAttribute('href') || '';
          var text = childrenText(listDepth).trim();
          if (!href || href.indexOf('javascript:') === 0) return text;
          return '[' + text + '](' + href + ')';
        }
        case 'br': return '\n';
        case 'ul': {
          var itemsUl = children.filter(function(c) { return c.nodeType === 1 && c.tagName.toLowerCase() === 'li'; });
          var outUl = '\n';
          itemsUl.forEach(function(li) {
            var indent = '  '.repeat(listDepth);
            outUl += indent + '- ' + walkListItem(li, listDepth + 1) + '\n';
          });
          return outUl + '\n';
        }
        case 'ol': {
          var itemsOl = children.filter(function(c) { return c.nodeType === 1 && c.tagName.toLowerCase() === 'li'; });
          var outOl = '\n';
          itemsOl.forEach(function(li, i) {
            var indent = '  '.repeat(listDepth);
            outOl += indent + (i + 1) + '. ' + walkListItem(li, listDepth + 1) + '\n';
          });
          return outOl + '\n';
        }
        case 'table':
          return '\n\n' + tableToMarkdown(node) + '\n\n';
        case 'p': case 'div':
          return '\n\n' + childrenText(listDepth).trim() + '\n\n';
        default:
          return childrenText(listDepth);
      }
    }

    function walkListItem(li, depth) {
      return Array.from(li.childNodes).map(function(c) { return walk(c, depth); }).join('').trim();
    }

    function tableToMarkdown(table) {
      var rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) return '';
      var lines = [];
      rows.forEach(function(row, ri) {
        var cells = Array.from(row.querySelectorAll('th,td'));
        var cellTexts = cells.map(function(c) {
          return Array.from(c.childNodes).map(function(n) { return walk(n, 0); }).join('').trim().replace(/\|/g, '\\|');
        });
        lines.push('| ' + cellTexts.join(' | ') + ' |');
        if (ri === 0) {
          lines.push('| ' + cellTexts.map(function() { return '---'; }).join(' | ') + ' |');
        }
      });
      return lines.join('\n');
    }

    var result = walk(el, 0);
    return result.replace(/\n{3,}/g, '\n\n').trim();
  }

  function readDomResponse() {
    var host = window.location.hostname;
    var config = DOM_SELECTORS[host];
    if (!config) return null;

    var els = document.querySelectorAll(config.response);
    if (!els.length) return null;

    // Read ALL response elements joined - full conversation. Prefer
    // structured markdown (headers, lists, tables, bold/links) over plain
    // innerText, with a safe fallback: if the converter throws, or
    // produces suspiciously little output relative to the raw text (e.g.
    // less than half the length — a sign something about this element's
    // structure broke the walker), fall back to the plain-text behavior
    // that was already working, so this enhancement can only ever improve
    // on the previous baseline, never regress it.
    var seen = {};
    var parts = Array.from(els).map(function(el) {
      var plain = (el.innerText || el.textContent || '').trim();
      try {
        var md = (config.htmlToMarkdown ? config.htmlToMarkdown(el) : htmlToMarkdown(el)).trim();
        if (md && md.length >= plain.length * 0.5) return md;
      } catch (e) {
        console.error('[Diary] htmlToMarkdown failed, falling back to plain text:', e);
      }
      return plain;
    }).filter(function(t) {
      if (t.length < 20) return false;
      var key = t.slice(0, 50);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    if (!parts.length) return null;
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

// Shared by all DOM-capture triggers (webRequest signal, window-property
  // poll, and the chatgpt.com MutationObserver) — reads the DOM, dedupes
  // against the last captured turn, and pushes into window.__diaryCapture.
  function captureDomTurn(logLabel) {
    var text = readDomResponse();
    if (!text || text.length <= 50) return;
    if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
    var turns = window.__diaryCapture.turns;
    var last = turns.length ? turns[turns.length - 1] : null;
    var tooSoon = last && (Date.now() - last.ts < 2000);
    if (!tooSoon) {
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
      turns.push({ text: text, url: canonicalUrl(), ts: Date.now(), images: imgUrls });
      console.log('[Diary DOM]', logLabel || 'Captured:', text.slice(0, 80));
    }
    window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
      detail: { url: canonicalUrl() }
    }));
  }

// ── ChatGPT: MutationObserver-based capture ────────────────────────────────
  // No network signal exists for ChatGPT (see DOM_SELECTORS comment above),
  // so unlike every other DOM provider, capture here is triggered by
  // watching the DOM directly for new assistant-turn sections appearing,
  // rather than a webRequest completion event.
  //
  // A fixed debounce after the last mutation is NOT sufficient — confirmed
  // live: on a long, table-heavy response, mutations paused (likely while
  // an image carousel's images were still loading over the network) long
  // enough for a fixed 3s timer to fire early, capturing a mid-render DOM
  // state: a truncated table, missing list items, and a raw unresolved
  // "image_group{...}" marker that only fully hydrates moments later.
  // Instead, poll until the extracted text is genuinely stable across
  // repeated checks AND contains no raw image_group/entity markers, with a
  // ceiling so a response that never fully settles still gets captured
  // eventually rather than waiting forever.
  if (window.location.hostname === 'chatgpt.com') {
    var _chatgptSettleTimer = null;
    var _chatgptLastText = null;
    var _chatgptStableCount = 0;
    var _chatgptWaitCount = 0;

    function _chatgptResetPoll() {
      _chatgptLastText = null;
      _chatgptStableCount = 0;
      _chatgptWaitCount = 0;
    }

    function _chatgptCheckStable() {
      var text = readDomResponse();
      var hasRawMarker = text && /image_group|entity[\uE000-\uF8FF\[]/.test(text);
      _chatgptWaitCount++;
      if (text && text === _chatgptLastText && !hasRawMarker) {
        _chatgptStableCount++;
        if (_chatgptStableCount >= 2) {
          captureDomTurn('ChatGPT captured:');
          _chatgptResetPoll();
          return;
        }
      } else {
        _chatgptLastText = text;
        _chatgptStableCount = 0;
      }
      if (_chatgptWaitCount > 15) {
        captureDomTurn('ChatGPT captured (timeout, may be incomplete):');
        _chatgptResetPoll();
        return;
      }
      _chatgptSettleTimer = setTimeout(_chatgptCheckStable, 2000);
    }

    var _chatgptObserver = new MutationObserver(function() {
      if (_chatgptSettleTimer) clearTimeout(_chatgptSettleTimer);
      _chatgptResetPoll();
      _chatgptSettleTimer = setTimeout(_chatgptCheckStable, 2000);
    });
    var _chatgptObserveTarget = document.getElementById('thread') || document.body;
    // characterData:true is essential — without it, in-place text updates
    // within existing nodes (as opposed to whole node insertion/removal)
    // never fire a mutation event, so the stability poll can wrongly
    // conclude the response is "done" while some list items are still
    // silently populating. Confirmed live: two list items ("Navigation",
    // "Weather") were missing from an otherwise-complete capture under the
    // childList-only config. characterData alone was STILL insufficient on
    // a later long-response test (confirmed via console: it captured via
    // the normal "stable" branch, not the timeout fallback, yet was still
    // missing content) — adding attributes:true to also catch
    // attribute-driven rendering changes (e.g. aria/data-state toggles used
    // to reveal already-present-but-hidden content).
    _chatgptObserver.observe(_chatgptObserveTarget, { childList: true, subtree: true, characterData: true, attributes: true });
  }

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
        var tooSoon = last && (Date.now() - last.ts < 2000);
        if (!tooSoon) {
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
        }
        window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
          detail: { url: canonicalUrl() }
        }));
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
    // Poll until readDomResponse() returns text LONGER than the last stored
    // Poll until readDomResponse() has genuinely SETTLED — two consecutive
    // reads returning the identical result — instead of requiring it to be
    // LONGER than the previously stored turn. Confirmed live this was a
    // real, more serious gap: Gemini can hit the same DOM node-recycling
    // behavior already confirmed for DeepSeek, where the total visible
    // content can legitimately stay flat or even shrink for a genuinely
    // NEW response, not just fail to grow — the old "must be longer" check
    // would then poll all 8 attempts, never see growth, and store NOTHING
    // for that turn at all (worse than DeepSeek's bug, which at least
    // stored something incomplete). Since the save-time logic already
    // merges every stored snapshot to recover full history (see the
    // DOM-providers save branch), the poll no longer needs to guarantee
    // growth — only that each snapshot it stores is a genuinely settled,
    // non-mid-render read. On ceiling timeout without settling, still
    // stores the last read (as long as it's not an exact duplicate of the
    // last stored turn) rather than discarding it — an unstable-but-real
    // read is still better than storing nothing.
    if (_domSettleTimer) clearTimeout(_domSettleTimer);
    var _domPollAttempts = 0;
    var _domLastRead = null;
    function _domPollCheck() {
      _domPollAttempts++;
      var text = readDomResponse();
      var settled = text && text === _domLastRead;
      if (!settled && _domPollAttempts < 8) {
        _domLastRead = text;
        _domSettleTimer = setTimeout(_domPollCheck, 1000);
        return;
      }
      if (text && text.length > 50) {
        // Store in __diaryCapture.turns same as interceptor
        if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
        var turns = window.__diaryCapture.turns;
        var last = turns.length ? turns[turns.length - 1] : null;
        var tooSoon = last && (Date.now() - last.ts < 2000);
        var sameAsLast = last && text === last.text;
        if (!tooSoon && !sameAsLast) {
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
          console.log('[Diary DOM] Captured (after', _domPollAttempts, 'attempt(s),', settled ? 'settled' : 'ceiling', '):', text.slice(0, 80));
        } else if (sameAsLast) {
          console.log('[Diary DOM] Settled read matched last stored turn exactly — genuinely nothing new, skipping');
        }
        window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
          detail: { url: canonicalUrl() }
        }));
      }
    }
    _domSettleTimer = setTimeout(_domPollCheck, 1000);
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