/**
 * forge-api.js -- Shared client-side API module for Forge Web
 * Include via: <script src="/js/forge-api.js"></script>
 * All pages share this single source of truth for auth state and API calls.
 */

(function (global) {
  'use strict';

  const BASE = (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ) ? 'http://localhost:3001' : 'https://api.projectcoachai.com';

  // -- Storage helpers ----------------------------------------------------------
  const TOKEN_KEY = 'forge_token';
  const USER_KEY  = 'forge_user';

  function getToken()       { try { return localStorage.getItem(TOKEN_KEY); }       catch(_){ return null; } }
  function setToken(t)      { try { localStorage.setItem(TOKEN_KEY, t); }           catch(_){} }
  function clearToken()     { try { localStorage.removeItem(TOKEN_KEY); }           catch(_){} }
  function getUser()        { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch(_){ return null; } }
  function setUser(u)       { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch(_){} }
  function clearUser()      { try { localStorage.removeItem(USER_KEY); }            catch(_){} }
  function isAuthenticated(){ return Boolean(getToken() && getUser()); }

  // -- Core request -------------------------------------------------------------
  async function request(method, path, body, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.headers) Object.assign(headers, opts.headers);

    // Site-level language injection — applies to every POST request automatically
    let finalBody = body;
    if (method === 'POST' && body != null && typeof body === 'object') {
      const lang = (function(){ try { return localStorage.getItem('forge_language') || 'en'; } catch(_){ return 'en'; } })();
      finalBody = { language: lang, ...body }; // explicit body.language always wins
    }

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: finalBody != null ? JSON.stringify(finalBody) : undefined,
      signal: opts.signal,
    });

    // Handle 401 -- session expired
    if (res.status === 401 && !opts.skipAuthRedirect) {
      clearToken(); clearUser();
      // Dispatch event so pages can react without a hard redirect
      window.dispatchEvent(new CustomEvent('forge:auth-expired'));
    }

    let data;
    try { data = await res.json(); } catch (_) { data = {}; }
    return { ok: res.ok, status: res.status, data };
  }

  // -- Auth ---------------------------------------------------------------------
  const auth = {
    async signin(email, password, twofaCode) {
      const body = { email, password };
      if (twofaCode) body.twofa_code = twofaCode;
      const r = await request('POST', '/api/auth/signin', body);
      if (r.ok && r.data.user) {
        // Use token if provided, otherwise use userId as session key
        const token = r.data.token || r.data.user.userId;
        setToken(token);
        setUser(r.data.user);
        try {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SET_STORAGE', key: 'diary_token', value: token } }, '*');
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage('momenmcgdmceejapigodolpekonmaedd', { type: 'SET_TOKEN_BG', token: token }, function(){});
          }
        } catch(_) {}
        // Send token to Diary extension
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage('momenmcgdmceejapigodolpekonmaedd', { type: 'SET_TOKEN_BG', token: token }, function(){});
          }
        } catch(_) {}
      }
      return r;
    },
    async register(name, email, password) {
      const r = await request('POST', '/api/auth/register', { name, email, password });
      if (r.ok && r.data.user) {
        const token = r.data.token || r.data.user.userId;
        setToken(token);
        setUser(r.data.user);
        try {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SET_STORAGE', key: 'diary_token', value: token } }, '*');
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage('momenmcgdmceejapigodolpekonmaedd', { type: 'SET_TOKEN_BG', token: token }, function(){});
          }
        } catch(_) {}
        // Send token to Diary extension
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage('momenmcgdmceejapigodolpekonmaedd', { type: 'SET_TOKEN_BG', token: token }, function(){});
          }
        } catch(_) {}
      }
      return r;
    },
    async google(credential) {
      const r = await request('POST', '/api/auth/google', { credential });
      if (r.ok && r.data.user) {
        const token = r.data.token || r.data.user.userId;
        setToken(token);
        setUser(r.data.user);
        try {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SET_STORAGE', key: 'diary_token', value: token } }, '*');
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage('momenmcgdmceejapigodolpekonmaedd', { type: 'SET_TOKEN_BG', token: token }, function(){});
          }
        } catch(_) {}
      }
      return r;
    },
    async signout() {
      try { await request('POST', '/api/auth/signout'); } catch(_) {}
      clearToken(); clearUser();
      // Clear all session storage and local state
      try { sessionStorage.clear(); } catch(_) {}
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('forge'));
        keys.forEach(k => localStorage.removeItem(k));
      } catch(_) {}
      window.dispatchEvent(new CustomEvent('forge:signout'));
      // Hard redirect to signin — clears all in-memory state
      setTimeout(() => { window.location.href = '/signin.html'; }, 100);
    },
    async me() {
      const r = await request('GET', '/api/auth/me', null, { skipAuthRedirect: true, skipConsoleError: true });
      if (r.ok && r.data.user) { setUser(r.data.user); return r.data.user; }
      if (r.status === 401) { clearToken(); clearUser(); return null; }
      // 404 means route doesn't exist on this backend version -- trust localStorage
      if (r.status === 404) { return getUser(); }
      return getUser();
    },
    async requestPasswordReset(email) {
      return request('POST', '/api/auth/password-reset/request', { email });
    },
    async confirmPasswordReset(email, token, newPassword) {
      return request('POST', '/api/auth/password-reset/confirm', { email, token, newPassword });
    },
  };

  // -- Connections --------------------------------------------------------------
  const connections = {
    async list()                    { return request('GET',    '/api/connections'); },
    async save(provider, apiKey)    { return request('POST',   `/api/connections/${provider}`, { apiKey }); },
    async remove(provider)          { return request('DELETE', `/api/connections/${provider}`); },
    async test(provider)            { return request('GET',    `/api/connections/test/${provider}`); },
  };

  // -- Compare ------------------------------------------------------------------
  const compare = {
    async run(prompt, models, options = {}) {
      return request('POST', '/api/compare', { prompt, models, ...options });
    },
  };

  // -- Synthesize ---------------------------------------------------------------
  const synthesize = {
    async run(mode, prompt, responses, options) {
      const synthesisMode = (options && options.synthesisMode) ? options.synthesisMode : 'best-answer';
      const customInstruction = (options && options.customInstruction) ? options.customInstruction : '';
      const imageData = (options && options.imageData) ? options.imageData : null;
      return request('POST', '/api/synthesize', { mode, prompt, responses, synthesisMode, customInstruction, imageData });
    },
  };

  // -- Usage ---------------------------------------------------------------------
  const usage = {
    get: () => request('GET', '/api/auth/usage'),
  };

  // -- Prompts ------------------------------------------------------------------
  const prompts = {
    async list(filters = {}) {
      const qs = new URLSearchParams(filters).toString();
      return request('GET', `/api/prompts${qs ? '?' + qs : ''}`);
    },
    async create(text, options = {}) {
      return request('POST', '/api/prompts', { text, ...options });
    },
    async update(id, changes) {
      return request('PATCH', `/api/prompts/${id}`, changes);
    },
    async remove(id) {
      return request('DELETE', `/api/prompts/${id}`);
    },
    async recordUse(id, provider) {
      return request('POST', `/api/prompts/${id}/use`, { provider });
    },
  };

  // -- Provider metadata --------------------------------------------------------
  const PROVIDERS = [
    { id: 'claude',     name: 'Claude',     color: '#d97706', rgb: '217,119,6',   abbr: 'CL', docsUrl: 'https://console.anthropic.com/settings/keys' },
    { id: 'chatgpt',   name: 'ChatGPT',    color: '#10b981', rgb: '16,185,129',  abbr: 'GP', docsUrl: 'https://platform.openai.com/api-keys' },
    { id: 'gemini',    name: 'Gemini',     color: '#3b82f6', rgb: '59,130,246',  abbr: 'GM', docsUrl: 'https://aistudio.google.com/app/apikey' },
    { id: 'mistral',   name: 'Mistral',    color: '#f59e0b', rgb: '245,158,11',  abbr: 'MS', docsUrl: 'https://console.mistral.ai/api-keys/' },
    { id: 'deepseek',  name: 'DeepSeek',   color: '#6366f1', rgb: '99,102,241',  abbr: 'DS', docsUrl: 'https://platform.deepseek.com/api_keys' },
    { id: 'perplexity',name: 'Perplexity', color: '#14b8a6', rgb: '20,184,166',  abbr: 'PX', docsUrl: 'https://www.perplexity.ai/settings/api' },
    { id: 'grok',      name: 'Grok',       color: '#ec4899', rgb: '236,72,153',  abbr: 'GK', docsUrl: 'https://console.x.ai/' },
    { id: 'meta',      name: 'Meta AI',    color: '#0866FF', rgb: '8,102,255',   abbr: 'MA', docsUrl: 'https://www.meta.ai' },
  ];

  function getProvider(id)      { return PROVIDERS.find(p => p.id === id) || null; }
  function getProviderColor(id) { return getProvider(id)?.color || '#6b6b88'; }
  function getProviderName(id)  { return getProvider(id)?.name  || id; }

  // -- Tier helpers (from stripe-config) ----------------------------------------
  const TIER_LIMITS = {
    starter:      { synthesesPerMonth: 30,  label: 'Free',              badge: '' },
    creator:      { synthesesPerMonth: 100, label: 'Decide Faster',     badge: 'Decide Faster' },
    lite:         { synthesesPerMonth: 100, label: 'Decide Faster',     badge: 'Decide Faster' },
    pro:          { synthesesPerMonth: 300, label: 'Work Like a Pro',   badge: 'Pro' },
    professional: { synthesesPerMonth: 300, label: 'Work Like a Pro',   badge: 'Pro' },
    team:         { synthesesPerMonth: -1,  label: 'Run a Team',        badge: 'Team' },
    enterprise:   { synthesesPerMonth: -1,  label: 'Enterprise',   badge: 'Enterprise' },
  };
  function getTierInfo(tier) { return TIER_LIMITS[tier] || TIER_LIMITS.starter; }

  // -- Session storage helpers (compare â†' synthesis handoff) --------------------
  const session = {
    saveComparison(data) {
      try { sessionStorage.setItem('forgeComparisonData', JSON.stringify(data)); } catch(_) {}
    },
    loadComparison() {
      try { return JSON.parse(sessionStorage.getItem('forgeComparisonData') || 'null'); } catch(_) { return null; }
    },
    clearComparison() {
      try { sessionStorage.removeItem('forgeComparisonData'); } catch(_) {}
    },
  };

  // -- UI utilities -------------------------------------------------------------
  let _toastContainer = null;
  function _getToastContainer() {
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  function showToast(msg, type = 'info', duration = 3500) {
    const c   = _getToastContainer();
    const el  = document.createElement('div');
    const bg  = type === 'success' ? 'rgba(34,197,94,0.15)'  :
                type === 'error'   ? 'rgba(239,68,68,0.15)'   :
                type === 'warn'    ? 'rgba(245,158,11,0.15)'  : 'rgba(255,255,255,0.06)';
    const bc  = type === 'success' ? 'rgba(34,197,94,0.4)'   :
                type === 'error'   ? 'rgba(239,68,68,0.4)'    :
                type === 'warn'    ? 'rgba(245,158,11,0.4)'   : 'rgba(255,255,255,0.12)';
    const icon = type === 'success' ? 'OK' : type === 'error' ? 'âš ' : type === 'warn' ? '!' : 'i';
    el.style.cssText = `background:${bg};border:1px solid ${bc};border-radius:10px;padding:11px 16px;font-size:13px;display:flex;align-items:center;gap:9px;color:#1B2A4A;font-family:'Inter',sans-serif;max-width:340px;animation:forgeToastIn .2s ease;box-shadow:0 4px 20px rgba(0,0,0,0.12);`;
    el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, duration);
  }

  // Inject toast keyframe once
  if (!document.getElementById('forge-toast-style')) {
    const s = document.createElement('style');
    s.id = 'forge-toast-style';
    s.textContent = '@keyframes forgeToastIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}';
    document.head.appendChild(s);
  }

  /**
   * requireAuth -- redirect to signin if not logged in.
   * Call at the top of any page that needs authentication.
   * Returns true if authenticated, false + redirects if not.
   */
  function requireAuth(returnUrl) {
    if (!isAuthenticated()) {
      const url = returnUrl || window.location.pathname;
      window.location.href = `/signin.html?return=${encodeURIComponent(url)}`;
      return false;
    }
    return true;
  }

  /**
   * restoreSession -- call on every page load.
   * Validates the stored token with the backend and refreshes the user object.
   * Returns the user object or null.
   */
  async function restoreSession() {
    if (!getToken()) return null;
    // Refresh user from backend to get latest data including avatar
    try {
      const r = await request('GET', '/api/auth/me', null, { skipAuthRedirect: true, skipConsoleError: true });
      if (r.ok && r.data.user) { setUser(r.data.user); return r.data.user; }
        try { var _t = getToken(); if (_t) window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SET_STORAGE', key: 'diary_token', value: _t } }, '*'); } catch(_) {}
      if (r.status === 401) { clearToken(); clearUser(); return null; }
    } catch(_) {}
    return getUser();
  }

  // -- Markdown renderer (lightweight, no deps) ---------------------------------
  function renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/^[-*•]\s*$/gm, '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      // NOTE: image rule added — confirmed live this renderer had NO
      // handling for markdown image syntax at all, ever, across every
      // one of its existing rules (bold, italic, headers, tables,
      // lists). A "![alt](url)" line simply fell through unrecognized
      // to the generic paragraph-wrapping rule further below, showing
      // up as literal, raw text rather than a displayed image — this
      // was the actual, definitive cause of every "raw image syntax"
      // complaint seen across multiple providers, not something
      // provider-specific at all. Placed early, right after HTML-
      // escaping (so a URL's own "&" in a query string is correctly
      // escaped to "&amp;" for the resulting <img> attribute, same as
      // any other HTML attribute value) and before every other rule, so
      // an image is already a real <img> tag by the time the later
      // paragraph-wrapping rule runs — that rule then harmlessly wraps
      // it in a <p>, same as it does for a table or a list. Verified via
      // direct simulation, alongside existing bold-text formatting still
      // working correctly, before applying here.
      //
      // NOTE: size capped (max-width/max-height:320px) and click-to-zoom
      // wired in — confirmed live that without a size cap, an image
      // could render far larger than intended, since max-width:100% on
      // its own just fills whatever container it's in; and the existing
      // click-to-zoom lightbox (openImageZoom(), defined in
      // diary-web/app.html, not this shared file) only ever covered the
      // separate thumbnail-strip display, never these newly-rendered
      // inline images, since they're two genuinely different rendering
      // paths. Guarded with a window.openImageZoom existence check
      // rather than calling it directly, since this shared renderer is
      // also used in contexts where that function doesn't exist at all
      // (e.g. the Word-export popup window) — clicking there now safely
      // does nothing instead of throwing.
      // NOTE: gallery-grouping rule added, runs BEFORE the single-image
      // caption rule below. Confirmed live (full audit, both the raw
      // stored data and the rendering code checked out correct) that a
      // multi-image response was never actually duplicated, reordered,
      // or split apart — that symptom traced back to a genuine, separate
      // architectural gap instead: markdown text has no concept of
      // "these N images belong together as one set", so even correct
      // data always rendered as N separate, full-width, vertically
      // stacked blocks — nothing like the compact, horizontal thumbnail
      // row most chat UIs (including the one this was captured from)
      // show for a multi-image answer. This detects TWO OR MORE
      // consecutive image+caption pairs (the same per-image shape the
      // single-image rule below already recognizes) and groups them into
      // one horizontal, scrollable strip instead — deliberately NOT
      // attempting to pixel-match any specific provider's own gallery
      // layout, per explicit product decision: a lightweight, Diary-
      // styled strip that reads as "these came from one exchange" is far
      // more tractable than replicating eight different providers' grids
      // for comparatively little visual payoff. A single, standalone
      // image (no adjacent sibling) is deliberately left unmatched here,
      // falling through untouched to the existing single-image rule
      // below. Verified via direct simulation of both a real four-image
      // group and a genuine standalone image before applying here.
      .replace(/(?:!\[[^\]]*\]\(https?:\/\/[^)\s]+\)\n\n[^\n#*!\-].+\n\n){2,}/g, function(fullMatch) {
        var items = [];
        var unitRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\n\n([^\n#*!\-].+)/g;
        var m;
        while ((m = unitRegex.exec(fullMatch)) !== null) {
          items.push({ alt: m[1], url: m[2], caption: m[3] });
        }
        var imgsHtml = items.map(function(it) {
          return '<div style="flex:0 0 auto;width:150px;">' +
            '<img src="' + it.url + '" alt="' + it.alt + '" style="width:150px;height:150px;object-fit:cover;border-radius:8px;cursor:zoom-in;display:block;" onerror="this.parentElement.style.display=\'none\'" onclick="if(window.openImageZoom)window.openImageZoom(this.src)"/>' +
            '<div style="font-size:11px;color:#9E9890;margin-top:2px;">' + it.caption + '</div>' +
            '</div>';
        }).join('');
        return '<div style="display:flex;gap:10px;overflow-x:auto;padding:8px 0;">' + imgsHtml + '</div>\n\n';
      })
      // NOTE: second, sibling gallery rule added — confirmed live via
      // direct user report that ChatGPT's own multi-image responses have
      // NO caption line at all between consecutive images (just bare
      // "![Image](url)" repeated back to back), unlike Gemini's pattern
      // the rule above was built for. Without this, those images fell
      // through entirely to the standalone-image rule below, explaining
      // both reported symptoms at once: full-width, vertically-stacked
      // images (320px instead of the compact 150px gallery size) and no
      // grouping at all, even though all of them genuinely belonged to
      // one answer. Runs AFTER the caption-based rule above (so any
      // group that DOES have real captions is still correctly consumed
      // by that more specific rule first) and requires two or more
      // consecutive images with nothing but blank lines between them —
      // a genuinely different, non-overlapping shape from the rule
      // above, which specifically requires a non-empty caption line.
      // Verified via direct simulation of a caption-less run, a
      // captioned run, and a lone standalone image, confirming each
      // case is handled by the correct rule (or none at all) before
      // applying here.
      .replace(/(?:!\[[^\]]*\]\(https?:\/\/[^)\s]+\)\n\n){2,}/g, function(fullMatch) {
        var items = [];
        var unitRegex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
        var m;
        while ((m = unitRegex.exec(fullMatch)) !== null) {
          items.push({ alt: m[1], url: m[2] });
        }
        var imgsHtml = items.map(function(it) {
          return '<div style="flex:0 0 auto;width:150px;">' +
            '<img src="' + it.url + '" alt="' + it.alt + '" style="width:150px;height:150px;object-fit:cover;border-radius:8px;cursor:zoom-in;display:block;" onerror="this.parentElement.style.display=\'none\'" onclick="if(window.openImageZoom)window.openImageZoom(this.src)"/>' +
            '</div>';
        }).join('');
        return '<div style="display:flex;gap:10px;overflow-x:auto;padding:8px 0;">' + imgsHtml + '</div>\n\n';
      })
      // NOTE: caption rule added, runs BEFORE the standalone-image rule
      // below — confirmed live that Gemini's own text pattern commonly
      // puts a short descriptive line directly beneath an image (e.g.
      // "Daytime view from Champ de Mars. Source: Wikipedia"), which was
      // rendering as full-size body text, not a distinct caption. Only
      // matches when a non-empty line genuinely follows the image
      // immediately (excluding lines starting with #, *, !, or - so a
      // header, bold text, another image, or a list item never gets
      // mistaken for a caption) — an image with no such line falls
      // through untouched to the standalone rule further below.
      // Verified via direct simulation of both cases (an image with a
      // real caption line, and one without) before applying here.
      // NOTE: fixed to require TWO newlines between an image and its
      // caption, not one — confirmed live via direct inspection of the
      // real, actual stored text that Turndown/the extension always
      // separates block-level elements (an image and the paragraph
      // right after it) with a full blank line, i.e. "\n\n", the normal
      // markdown paragraph-break convention — never a single "\n". Both
      // this rule and the gallery rule just above it were originally
      // built and verified against a hand-written test string that used
      // a single "\n", which never matched the real data at all — this
      // was caught by testing the FULL, exact, real content end-to-end
      // through the actual pipeline, not a simplified approximation of
      // it, after which neither rule was actually firing on real
      // entries. Re-verified against the exact real Eiffel Tower content
      // string, correctly extracting all four real captions with their
      // real text, before landing on this fix.
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\n\n([^\n#*!\-].+)/g, '<img src="$2" alt="$1" style="max-width:320px;max-height:320px;border-radius:8px;margin:8px 0 2px 0;display:block;cursor:zoom-in;" onerror="this.style.display=\'none\'" onclick="if(window.openImageZoom)window.openImageZoom(this.src)"/><div style="font-size:11px;color:#9E9890;margin-bottom:8px;max-width:320px;">$3</div>')
      .replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img src="$2" alt="$1" style="max-width:320px;max-height:320px;border-radius:8px;margin:8px 0;display:block;cursor:zoom-in;" onerror="this.style.display=\'none\'" onclick="if(window.openImageZoom)window.openImageZoom(this.src)"/>')
      // NOTE: citation pill rule — matches how Claude's own page shows a
      // small, rounded tag with the source name rather than a bare
      // number. Uses a private-use Unicode delimiter sequence emitted by
      // stripCitations() in the extension, now carrying FOUR fields —
      // pill label, full title, url, favicon/logo url
      // (⟦E000⟧pill⟦E003⟧title⟦E001⟧url⟦E004⟧favicon⟦E002⟧) —
      // deliberately distinct from real markdown [label](url) syntax, so
      // a citation pill is never confused with a genuine link. Runs
      // BEFORE the generic markdown-link rule below, since this uses
      // different, non-conflicting delimiters entirely.
      //
      // NOTE: hover popup added — confirmed via direct, side-by-side
      // comparison against Claude's own page that hovering a citation
      // there also surfaces a small card with the full title, source
      // name, and a small logo — added the same idea here: a hidden
      // <div>, toggled via onmouseover/onmouseout on a wrapping <span>
      // (consistent with how this codebase already handles other
      // inline, dynamic behavior, e.g. image zoom, rather than
      // introducing a separate stylesheet). Each popup gets a genuinely
      // unique id from a module-level counter, since Math.random() could
      // theoretically collide across many renders on the same page.
      // Logo rendering is entirely optional — providers other than
      // Claude never supply a favicon at all, so the <img> is simply
      // omitted rather than shown broken. Widened from 260px to 320px
      // and added a small margin between adjacent pills — confirmed via
      // direct user feedback that two citations sitting immediately
      // next to each other in the text (no space between them) had
      // hover zones that visually overlapped/misaligned, and that
      // longer titles needed more room to read comfortably. Changed from
      // max-width to a genuinely FIXED width (with box-sizing:border-box
      // so padding doesn't push it past 320px) — confirmed live via
      // direct user feedback that max-width alone let each popup shrink
      // to fit its own content, producing a different, inconsistent
      // size per pill rather than one uniform size across all of them.
      //
      // NOTE: pill itself given a fixed max-width (180px, matching
      // Claude's own max-w-[180px]) with overflow:hidden and
      // text-overflow:ellipsis, after removing the earlier server-side
      // truncation per direct user request to keep the full label in
      // the saved data. Confirmed live this was the actual root cause
      // of the hover misalignment: an untruncated, wide label (e.g. two
      // full "Global Market Insights" pills back to back) could no
      // longer fit on one line and visually wrapped like any other
      // inline element, shifting the hover zone away from where the
      // pill actually rendered. Truncating visually here, rather than
      // in the saved text, keeps the full label intact in storage while
      // matching Claude's own compact, single-line appearance.
      // NOTE: rewritten to no longer generate a per-citation popup <div>
      // nested inside the response text at all — confirmed live this
      // was structurally unfixable, since .entry-content's own implicit
      // overflow-x:auto (a real, separate CSS quirk, the same one
      // already documented once before for the entry-card checkbox)
      // clips any absolutely-positioned descendant regardless of how
      // its own anchor side is set. Now emits ONLY the pill itself, with
      // its title/site-name/favicon stored as data-* attributes rather
      // than rendered inline — a single, shared #citePopup element
      // (attached directly to <body>, outside any scrollable ancestor)
      // reads those attributes and positions itself with page-level
      // fixed coordinates at hover time. See __showCitePopup/
      // __hideCitePopup in app.html for the full rationale.
      .replace(/\uE000([^\uE003]*)\uE003([^\uE001]*)\uE001([^\uE004]*)\uE004([^\uE002]*)\uE002/g, function(full, pill, title, url, favicon) {
        return '<a href="' + url + '" target="_blank" rel="noopener" ' +
          'data-cite-pill="' + pill.replace(/"/g, '&quot;') + '" ' +
          'data-cite-title="' + title.replace(/"/g, '&quot;') + '" ' +
          'data-cite-favicon="' + favicon.replace(/"/g, '&quot;') + '" ' +
          'onmouseover="if(window.__showCitePopup)window.__showCitePopup(this)" ' +
          'onmouseout="if(window.__hideCitePopup)window.__hideCitePopup(this)" ' +
          'style="display:inline-flex;align-items:center;font-size:11px;padding:1px 8px;margin:0 3px 0 1px;border-radius:999px;background:#F2EFE9;color:#6B655C;text-decoration:none;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;transition:background-color 0.15s,color 0.15s;">' + pill + '</a>';
      })
      // NOTE: markdown link support added — confirmed this renderer had
      // no handling for [text](url) at all, same gap images had before
      // today's earlier fix, meaning any inline citation link or the
      // Sources footer's own entries (now emitted as real markdown
      // links — see stripCitations() in the extension) showed up as
      // plain, unclickable text. Runs AFTER both image rules above, so
      // by this point any genuine ![]() image syntax has already been
      // consumed — the (?<!!) lookbehind is kept anyway as cheap,
      // defensive insurance in case an image URL ever contains a
      // character (like a space) that doesn't match the image rules'
      // own URL pattern and so slips through unconverted.
      .replace(/(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^\n*]+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm,  '<h2>$1</h2>')
      .replace(/^# (.+)$/gm,   '<h1>$1</h1>')
      .replace(/^---$/gm, '<hr/>')
      .replace(/^\|(.+)\|$/gm, (row) => {
        const cells = row.slice(1,-1).split('|').map(c => c.trim());
        return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
      })
      .replace(/(<tr>.*<\/tr>\n?)+/g, s => {
        const rows = s.trim().split('\n');
        const filtered = rows.filter(r => !r.match(/<td>[-: ]+<\/td>/));
        if (!filtered.length) return s;
        const [head, ...body] = filtered;
        const th = head.replace(/<td>/g,'<th>').replace(/<\/td>/g,'<\/th>');
        return '<table><thead>' + th + '<\/thead><tbody>' + body.join('') + '<\/tbody><\/table>';
      })
      .replace(/^\d+\.\s*$/gm, '')
      .replace(/^[-*•] (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li data-ol>$1</li>')
      // NOTE: fixed a genuine, confirmed bug — the earlier grouping
      // rules only tolerated a single, optional trailing newline (\n?)
      // between consecutive <li> tags. The bare-bullet/numbered
      // stripping rules above (removing a line that's just "* " or
      // "1. " with nothing after it — confirmed live: this pattern
      // exists in real, captured AI responses) leave a blank line
      // behind where that stripped line used to be, which broke this
      // adjacency check: two items that should have formed ONE list
      // instead each got wrapped in their own, separate <ul>/<ol>,
      // reading as visually broken/disconnected. Widened to \n* (zero
      // or more) so a leftover blank line no longer breaks grouping,
      // and any blank lines still present INSIDE a matched group are
      // now explicitly collapsed before wrapping — without that
      // second part, the leftover blank line would otherwise survive
      // inside the wrapped <ul>/<ol> and get corrupted into a <p> tag
      // nested illegally between two <li> elements by the paragraph
      // rule below, which runs after this one and has no awareness
      // that this newline is now inside a list.
      //
      // Also fixed a second, separate, previously-latent bug found
      // while verifying the above: the ordered-list safety check
      // (previously s.includes('<ol>')) inspected only the matched
      // <li> sequence itself, which can never actually contain the
      // <ol> wrapper surrounding it — confirmed live this let an
      // already-ordered list get a second, incorrectly nested <ul>
      // wrapped around it too. Fixed by deliberately NOT stripping the
      // data-ol marker until after both grouping rules have run: the
      // unordered rule's own <li> (no attributes) pattern then
      // structurally cannot match an already-ordered <li data-ol> item
      // at all, which is more robust than re-inspecting matched text
      // for a tag that was never actually present in it.
      //
      // Verified via direct simulation across five cases before
      // applying here: the originally-reported broken-bullet-list case,
      // a normal bullet list (no regression), two genuinely separate
      // lists with real prose between them (correctly NOT merged), the
      // newly-found numbered-list double-wrap bug, and a normal
      // numbered list (no regression).
      .replace(/(<li data-ol>[\s\S]*?<\/li>\n*)+/g, s => `<ol>${s.replace(/\n{2,}/g, '\n')}</ol>`)
      .replace(/(<li>[\s\S]*?<\/li>\n*)+/g, s => `<ul>${s.replace(/\n{2,}/g, '\n')}</ul>`)
      .replace(/ data-ol/g, '')
      .replace(/\n\n/g, '</p><p>')
      // NOTE: fixed a genuine, confirmed bug found while independently
      // re-verifying the fix above (its own claimed "5 test cases"
      // turned out to still fail case 1, the very case it was meant to
      // fix — confirmed via direct, step-by-step tracing, not assumed
      // from the comment). The \n\n→'</p><p>' rule directly above
      // removes the real newline between text and an immediately
      // following list/table/pre block, replacing it with inline HTML
      // text instead — so by the time the general p-wrapping rule
      // below runs its line-by-line check, "Header text:</p><p><ul>..."
      // is one single line that does NOT start with '<', and the whole
      // line — including the already-correct <ul> HTML embedded in it —
      // gets wrapped in another, illegal, nested <p>. Ensures a
      // block-level tag always starts (and, symmetrically, ends) on its
      // own real line, regardless of what the paragraph-break rule just
      // did to the newline that used to separate them. Verified against
      // 7 cases before applying: the originally-reported broken bullet
      // list, a normal bullet list, two separate lists with prose
      // between, the numbered-list double-wrap case, a normal numbered
      // list, a table immediately after prose, and a combined
      // table-then-list-then-prose sequence — all producing clean,
      // correctly nested HTML with no stray tags.
      .replace(/([^\n])(<(?:ul|ol|table|pre)>)/g, '$1\n$2')
      .replace(/(<\/(?:ul|ol|table|pre)>)([^\n])/g, '$1\n$2')
      // NOTE: fixed a second, separate, genuinely pre-existing bug,
      // confirmed present even before today's other changes (tested
      // directly against the last-committed version): this rule's
      // negative lookahead `[hupra\/]` was missing 'l' (<li>) and 'o'
      // (<ol>) entirely — meaning EVERY multi-item list, with or
      // without the blank-line issue above, already had its 2nd and
      // later <li> lines incorrectly wrapped in an extra, illegal <p>
      // tag nested inside the list. This was the dominant, more
      // impactful cause of the originally reported "broken markdown"
      // symptom — the blank-line fix above was real but secondary.
      // Rather than add more letters to an enumerated set (which would
      // still miss others, e.g. <table>, itself not covered either),
      // widened to exclude any line starting with '<' at all: by this
      // point in the pipeline, a literal '<' can only ever be
      // already-generated HTML from an earlier rule, never raw input
      // text, since raw '<' was already HTML-escaped to '&lt;' near
      // the very start of this same function — making a full-tag
      // enumeration unnecessary and inherently fragile to the next new
      // tag this function ever learns to generate.
      .replace(/^(?!<|$)(.+)$/gm, m => `<p>${m}</p>`)
      .replace(/<p><\/p>/g, '')
      .replace(/(<strong>)(Agreement|Disagreement|Consensus|Key Risk|Warning|Critical|Note|Important|Recommendation)(<\/strong>)/g,
        '<strong style="color:#E8652A">$2</strong>');
  }


  // -- Extension bridge ---------------------------------------------------------
  // Communicates with the Forge Chrome extension (ID set below).
  // The extension runs content scripts inside AI provider tabs and
  // captures responses from the user's own signed-in sessions.

  // Forge extension IDs -- tries each until one responds (works across machines)
  const EXTENSION_IDS = [
    'onlaamgggkmmnpbkcllnhdpecaidfpml', // Windows desktop
    'niodlddcipfajmpinpemgbchpbojiepi', // MacBook Pro (forge-extension-clean)
    'pijmpocahbecpaoimapldcbcgfbcmdin', // MacBook Pro (forge-extension-v2)
  ];
  let EXTENSION_ID = EXTENSION_IDS[0]; // active ID, resolved at runtime

  const extension = {
    // Check if extension is installed via DOM bridge element
    // forge-main.js content script creates __forge_bridge__ div when extension is active
    async isAvailable() {
      // Try each known extension ID and use the first that responds
      for (const id of EXTENSION_IDS) {
        try {
          const alive = await new Promise(resolve => {
            chrome.runtime.sendMessage(id, { type: 'PING' }, r => {
              resolve(!chrome.runtime.lastError && r?.ok);
            });
          });
          if (alive) { EXTENSION_ID = id; break; }
        } catch(_) {}
      }
      // Fall through to bridge check
      if (window.__forgeExtensionInstalled) return true;

      // Check if bridge already exists
      if (document.getElementById('__forge_bridge__')?.getAttribute('data-ext-present') === '1') {
        window.__forgeExtensionInstalled = true;
        return true;
      }

      // Wait up to 3s for content script to inject the bridge
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 3000);
        const mo = new MutationObserver(() => {
          if (document.getElementById('__forge_bridge__')?.getAttribute('data-ext-present') === '1') {
            clearTimeout(timeout);
            mo.disconnect();
            window.__forgeExtensionInstalled = true;
            resolve(true);
          }
        });
        mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      });
    },

    // Get connection status for all providers
    async getStatus() {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(EXTENSION_ID, { type: 'GET_STATUS' }, (r) => {
            if (chrome.runtime.lastError) { resolve({}); return; }
            resolve(r?.status || {});
          });
        } catch(_) { resolve({}); }
      });
    },

    // Open a provider tab (for connecting)
    openProvider(providerId) {
      chrome.runtime.sendMessage(EXTENSION_ID, { type: 'OPEN_PROVIDER', provider: providerId });
    },

    // Send a prompt to selected providers via the extension
    // Returns a promise that resolves with { responses: { claude: {content}, chatgpt: {content}, ... } }
    async sendPrompt(prompt, providers) {
      return new Promise((resolve) => {
        const responses = {};
        const pending   = new Set(providers);
        let   settled   = false;

        const timeout = setTimeout(() => {
          if (!settled) { settled = true; resolve({ ok: true, responses }); }
        }, 90000);

        // Listen for responses forwarded from background via __FORGE_EXT_DATA__
        function onMessage(event) {
          if (event.source !== window) return;
          const d = event.data;
          if (d?.type !== '__FORGE_EXT_DATA__') return;
          if (d?.provider && d?.response && pending.has(d.provider)) {
            responses[d.provider] = { content: d.response, provider: d.provider };
            pending.delete(d.provider);
          }
          if (d?.type === 'NOT_SIGNED_IN') pending.delete(d.provider);
          if (pending.size === 0) {
            clearTimeout(timeout);
            window.removeEventListener('message', onMessage);
            if (!settled) { settled = true; resolve({ ok: true, responses }); }
          }
        }
        window.addEventListener('message', onMessage);

        // Send command via DOM bridge element
        const bridge = document.getElementById('__forge_bridge__');
        if (!bridge) {
          clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          resolve({ ok: false, error: 'Extension bridge not found' });
          return;
        }
        // Small delay to ensure forge-isolated.js observer is ready
        setTimeout(() => {
          bridge.setAttribute('data-command', JSON.stringify({
            type: 'SEND_PROMPT', prompt, providers
          }));
        }, 100);
      });
    },
  };

  // -- Expose public API --------------------------------------------------------
  global.Forge = {
    BASE,
    // Auth state
    getToken, setToken, clearToken,
    getUser,  setUser,  clearUser,
    isAuthenticated,
    // Modules
    auth,
    connections,
    compare,
    synthesize,
    usage,
    prompts,
    // Provider metadata
    PROVIDERS,
    getProvider,
    getProviderColor,
    getProviderName,
    // Tier
    getTierInfo,
    // Session storage
    session,
    // UI
    showToast,
    requireAuth,
    restoreSession,
    renderMarkdown,
    // Extension bridge
    extension,
    EXTENSION_ID,
    // Misc
    request,
  };

}(window));




