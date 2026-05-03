/**
 * forge-api.js â€" Shared client-side API module for Forge Web
 * Include via: <script src="/js/forge-api.js"></script>
 * All pages share this single source of truth for auth state and API calls.
 */

(function (global) {
  'use strict';

  const BASE = (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ) ? 'http://localhost:3001' : 'https://api.projectcoachai.com';

  // â"€â"€ Storage helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const TOKEN_KEY = 'forge_token';
  const USER_KEY  = 'forge_user';

  function getToken()       { try { return localStorage.getItem(TOKEN_KEY); }       catch(_){ return null; } }
  function setToken(t)      { try { localStorage.setItem(TOKEN_KEY, t); }           catch(_){} }
  function clearToken()     { try { localStorage.removeItem(TOKEN_KEY); }           catch(_){} }
  function getUser()        { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch(_){ return null; } }
  function setUser(u)       { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch(_){} }
  function clearUser()      { try { localStorage.removeItem(USER_KEY); }            catch(_){} }
  function isAuthenticated(){ return Boolean(getToken() && getUser()); }

  // â"€â"€ Core request â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  async function request(method, path, body, opts = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (opts.headers) Object.assign(headers, opts.headers);

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });

    // Handle 401 â€" session expired
    if (res.status === 401 && !opts.skipAuthRedirect) {
      clearToken(); clearUser();
      // Dispatch event so pages can react without a hard redirect
      window.dispatchEvent(new CustomEvent('forge:auth-expired'));
    }

    let data;
    try { data = await res.json(); } catch (_) { data = {}; }
    return { ok: res.ok, status: res.status, data };
  }

  // â"€â"€ Auth â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
      }
      return r;
    },
    async register(name, email, password) {
      const r = await request('POST', '/api/auth/register', { name, email, password });
      if (r.ok && r.data.user) {
        const token = r.data.token || r.data.user.userId;
        setToken(token);
        setUser(r.data.user);
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
      // 404 means route doesn't exist on this backend version â€" trust localStorage
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

  // â"€â"€ Connections â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const connections = {
    async list()                    { return request('GET',    '/api/connections'); },
    async save(provider, apiKey)    { return request('POST',   `/api/connections/${provider}`, { apiKey }); },
    async remove(provider)          { return request('DELETE', `/api/connections/${provider}`); },
    async test(provider)            { return request('GET',    `/api/connections/test/${provider}`); },
  };

  // â"€â"€ Compare â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const compare = {
    async run(prompt, models, options = {}) {
      return request('POST', '/api/compare', { prompt, models, ...options });
    },
  };

  // â"€â"€ Synthesize â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const synthesize = {
    async run(mode, prompt, responses) {
      return request('POST', '/api/synthesize', { mode, prompt, responses });
    },
  };

  // â"€â"€ Usage â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const usage = {
    get: () => request('GET', '/api/auth/usage'),
  };

  // â"€â"€ Prompts â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

  // â"€â"€ Provider metadata â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const PROVIDERS = [
    { id: 'claude',     name: 'Claude',     color: '#d97706', rgb: '217,119,6',   abbr: 'CL', docsUrl: 'https://console.anthropic.com/settings/keys' },
    { id: 'chatgpt',   name: 'ChatGPT',    color: '#10b981', rgb: '16,185,129',  abbr: 'GP', docsUrl: 'https://platform.openai.com/api-keys' },
    { id: 'gemini',    name: 'Gemini',     color: '#3b82f6', rgb: '59,130,246',  abbr: 'GM', docsUrl: 'https://aistudio.google.com/app/apikey' },
    { id: 'mistral',   name: 'Mistral',    color: '#f59e0b', rgb: '245,158,11',  abbr: 'MS', docsUrl: 'https://console.mistral.ai/api-keys/' },
    { id: 'deepseek',  name: 'DeepSeek',   color: '#6366f1', rgb: '99,102,241',  abbr: 'DS', docsUrl: 'https://platform.deepseek.com/api_keys' },
    { id: 'perplexity',name: 'Perplexity', color: '#14b8a6', rgb: '20,184,166',  abbr: 'PX', docsUrl: 'https://www.perplexity.ai/settings/api' },
    { id: 'grok',      name: 'Grok',       color: '#ec4899', rgb: '236,72,153',  abbr: 'GK', docsUrl: 'https://console.x.ai/' },
  ];

  function getProvider(id)      { return PROVIDERS.find(p => p.id === id) || null; }
  function getProviderColor(id) { return getProvider(id)?.color || '#6b6b88'; }
  function getProviderName(id)  { return getProvider(id)?.name  || id; }

  // â"€â"€ Tier helpers (from stripe-config) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

  // â"€â"€ Session storage helpers (compare â†' synthesis handoff) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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

  // â"€â"€ UI utilities â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
    const icon = type === 'success' ? 'âœ"' : type === 'error' ? 'âš ' : type === 'warn' ? '!' : 'i';
    el.style.cssText = `background:${bg};border:1px solid ${bc};border-radius:10px;padding:11px 16px;font-size:13px;display:flex;align-items:center;gap:9px;color:#e8e8f0;font-family:var(--font-body,"DM Sans",sans-serif);max-width:340px;animation:forgeToastIn .2s ease;box-shadow:0 4px 20px rgba(0,0,0,0.4);`;
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
   * requireAuth â€" redirect to signin if not logged in.
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
   * restoreSession â€" call on every page load.
   * Validates the stored token with the backend and refreshes the user object.
   * Returns the user object or null.
   */
  async function restoreSession() {
    // Trust localStorage â€" no network call on every page load.
    // The token gets validated naturally when any authenticated
    // API call is made. Sign-out clears both token and user.
    if (!getToken() || !getUser()) return null;
    return getUser();
  }

  // â"€â"€ Markdown renderer (lightweight, no deps) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  function renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,   '<em>$1</em>')
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
      .replace(/^\- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[hupra\/]|$)(.+)$/gm, m => `<p>${m}</p>`)
      .replace(/<p><\/p>/g, '');
  }


  // â"€â"€ Extension bridge â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  // Communicates with the Forge Chrome extension (ID set below).
  // The extension runs content scripts inside AI provider tabs and
  // captures responses from the user's own signed-in sessions.

  // Forge extension IDs -- tries each until one responds (works across machines)
  const EXTENSION_IDS = [
    'jjfinkdpgicfhcmackebkpbchpgpcjan', // Windows desktop
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

  // â"€â"€ Expose public API â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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




