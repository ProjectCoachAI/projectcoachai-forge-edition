/* home.js -- Logic for index.html */
'use strict';

let connectedProviders = new Set();
let selectedProviders  = new Set(['claude', 'chatgpt', 'gemini', 'perplexity']);
let compareResults     = {};
let synthData          = {};
let userPrompts        = [];
let isRunning          = false;
let extensionActive    = false;
let sourceMetadata     = {}; // trust layer: sourceUrl, sourceTabId, capturedAt per provider

/* -- Init ------------------------------------------------------------------- */
(async function init() {
  try { await Forge.restoreSession(); } catch(_) {}
  try {
    const _tok = Forge.getToken ? Forge.getToken() : null;
    if (_tok) {
      const _bridge = document.getElementById('__forge_bridge__');
      if (_bridge) _bridge.setAttribute('data-command', JSON.stringify({ type: 'STORE_TOKEN', token: _tok }));
      window.postMessage({ type: '__FORGE_TO_EXT__', payload: { type: 'SET_STORAGE', key: 'forge_auth_token', value: _tok } }, '*');
    }
  } catch(_) {}
  renderHeaderAuth();
  await loadConnections();
  renderProviderChips();
  if (typeof loadQuickPromptChips === 'function') loadQuickPromptChips();
  renderAdvGrid();
  renderQAList();
  updateCounter();
  checkExtensionStatus();

  // Pre-fill from URL ?prompt=
  const p = new URLSearchParams(window.location.search).get('prompt');
  if (p) { document.getElementById('promptInput').value = decodeURIComponent(p); updateCounter(); }

  // Context mode — show banner when continuing from a previous synthesis
  if (new URLSearchParams(window.location.search).get('context') === '1' && p) {
    const banner = document.createElement('div');
    banner.style.cssText = 'background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.25);border-radius:10px;padding:10px 14px;font-size:13px;color:#ff6b35;margin-bottom:12px;display:flex;align-items:center;gap:8px;';
    banner.innerHTML = '<span>&#9655;</span><span><strong>Continue with context</strong> — your previous analysis is included. Add your follow-up question and run.</span>';
    const promptWrap = document.getElementById('promptInput')?.parentElement;
    if (promptWrap) promptWrap.insertBefore(banner, promptWrap.firstChild);
  }

  if (new URLSearchParams(window.location.search).get('quickchat')) {
    setTimeout(openQA, 400);
  }
})();

function renderHeaderAuth() {
  const user = Forge.getUser();
  const el   = document.getElementById('headerAuth');
  if (!el) return;
  if (!user) {
    // Signed out state
    el.innerHTML = `
      <a href="/signin.html" class="btn btn-ghost">Sign In</a>
      <a href="/register.html" class="btn btn-primary">Start Free</a>`;
    return;
  }
  // Signed in state
  const tier = Forge.getTierInfo(user.tier || 'starter');
  el.innerHTML = `
    <div class="user-pill" onclick="location='/profile.html'" title="View profile">
      <div class="user-avatar">${user.avatar ? '<img src="'+user.avatar+'" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">' : (user.name || 'U')[0].toUpperCase()}</div>
      ${(user.name || 'Account').split(' ')[0]}
      ${tier.badge ? `<span class="tier-badge">${tier.badge}</span>` : ''}
    </div>
    <a href="/forge-feature-chooser.html" class="btn btn-primary" style="font-size:12px;">Go to workspace</a>
    <button class="btn btn-ghost" onclick="signOut()">Sign Out</button>`;
  const sb = document.getElementById('statusBar');
  if (sb) {
    sb.style.display = 'inline-flex';
    document.getElementById('statusText').textContent = `Signed in as ${user.name}. Your account is active.`;
  }
  const sp = document.getElementById('savePromptBtn');
  if (sp) sp.style.display = '';
  const rl = document.getElementById('resetLink');
  if (rl) rl.style.display = 'inline';
}

/* -- Extension status banner ----------------------------------------------- */
async function checkExtensionStatus() {
  const bar = document.getElementById('statusBar');
  const txt = document.getElementById('statusText');
  if (!bar || !txt) return;

  const available = await Forge.extension.isAvailable();
  extensionActive = available;
  bar.style.display = 'inline-flex';

  if (available) {
    renderProviderChips(); // re-render so chips show "&#10003; Ready" via extension
    renderQAList();        // re-render Quick Answer modal with correct status
    bar.style.background = 'rgba(34,197,94,.08)';
    bar.style.borderColor = 'rgba(34,197,94,.2)';
    bar.querySelector('.status-dot').style.background = '#22c55e';
    txt.textContent = 'Forge drives 8 AI engines simultaneously "” no subscriptions needed.';
  } else {
    bar.style.background = 'rgba(255,107,53,.06)';
    bar.style.borderColor = 'rgba(255,107,53,.2)';
    bar.querySelector('.status-dot').style.background = '#ff6b35';
    bar.querySelector('.status-dot').style.animation = 'none';
    txt.innerHTML = 'Forge is active -- 8 minds ready. <a href="/help.html" style="color:var(--accent)">Add the Forge Bar</a> to drive your own AI accounts.';
  }
}
window.checkExtensionStatus = checkExtensionStatus;


async function signOut() {
  await Forge.auth.signout();
  renderHeaderAuth();
  Forge.showToast('Signed out.', 'info');
}
window.signOut = signOut;

async function loadConnections() {
  if (!Forge.getToken()) return;
  const r = await Forge.connections.list();
  if (r.status === 401) { Forge.clearToken?.(); return; }
  if (r.ok && r.data.connections) {
    connectedProviders.clear();
    for (const [id, info] of Object.entries(r.data.connections)) {
      if (info.connected) connectedProviders.add(id);
    }
  }
  const pr = await Forge.prompts.list();
  if (pr.ok && pr.data?.prompts) userPrompts = pr.data.prompts;
}

/* -- Provider chips --------------------------------------------------------- */
function renderProviderChips() {
  const el     = document.getElementById('providerChips');
  const isAuth = Forge.isAuthenticated();
  const live   = Forge.PROVIDERS.map(p => p.id).filter(id => selectedProviders.has(id));
  el.innerHTML = live.map(id => {
    const p      = Forge.getProvider(id);
    const isSel  = selectedProviders.has(id);
    const isConn = true; // All providers available via Forge backend API
    // Click always toggles selection -- extension handles connection automatically
    const clickHandler = `toggleProvider('${id}')`;
    return `<div class="provider-chip${isSel ? ' selected' : ''}${isAuth && !isConn ? ' not-connected-chip' : ''}" style="color:${p.color};" onclick="${clickHandler}" title="${isAuth && !isConn ? 'Open ' + p.name + ' in a tab and sign in, then compare' : ''}">
      <div class="chip-dot"></div>
      ${p.name}
      ${isAuth ? `<span class="chip-status${isConn ? '' : ' disconnected'}">${isConn ? '&#10003; Ready' : 'Open tab to use'}</span>` : ''}
    </div>`;
  }).join('');
}

function getProviderLimit() {
  try {
    const user = Forge.getUser ? Forge.getUser() : null;
    const tier = (user && user.tier) ? user.tier : 'starter';
    const LIMITS = {
      starter: 3, student: 5, liteUnlimited: 6,
      creator: 8, 'creator-yearly': 8,
      professional: 8, 'professional-yearly': 8,
      team: 8, 'team-yearly': 8, enterprise: 8,
    };
    return LIMITS[tier] !== undefined ? LIMITS[tier] : 3;
  } catch(e) { return 3; }
}

function toggleProvider(id) {
  const limit = getProviderLimit();
  if (selectedProviders.has(id)) {
    if (selectedProviders.size > 1) selectedProviders.delete(id);
  } else {
    if (selectedProviders.size >= limit) {
      // No toast — just pulse the counter upgrade link gently
      const bar = document.getElementById('counterBar');
      if (bar) {
        bar.style.transition = 'color 0.15s';
        bar.style.color = 'var(--orange)';
        setTimeout(() => { bar.style.color = ''; }, 600);
      }
      return;
    }
    selectedProviders.add(id);
  }
  renderProviderChips();
  renderAdvGrid();
  updateCounter();
}

function resetToDefault() {
  const limit = getProviderLimit();
  const defaults = ['claude', 'chatgpt', 'gemini', 'perplexity', 'mistral', 'deepseek', 'grok', 'meta'];
  selectedProviders = new Set(defaults.slice(0, Math.min(limit, 4)));
  renderProviderChips();
  renderAdvGrid();
  updateCounter();
}
window.resetToDefault = resetToDefault;

function updateCounter() {
  const n   = selectedProviders.size;
  const hasPrompt = (document.getElementById('promptInput')?.value?.trim() || '').length > 0;
  const ok  = n >= 2 && hasPrompt;
  const btn = document.getElementById('compareBtn');
  const bar = document.getElementById('counterBar');
  btn.disabled = !ok || isRunning;
  const limit = getProviderLimit();
  if (!Forge.isAuthenticated()) {
    bar.innerHTML = ok
      ? `<span class="counter-ok">8 minds ready — free to try</span>`
      : `<span class="counter-warn">Select at least 2 providers to compare</span>`;
  } else if (limit < 8) {
    bar.innerHTML = ok
      ? `<span class="counter-ok">Selected: ${n} of ${limit} — <a href="/pricing.html" style="color:var(--orange);text-decoration:none;font-weight:600">Upgrade for all 8 →</a></span>`
      : `<span class="counter-warn">Select at least 2 providers to compare</span>`;
  } else {
    bar.innerHTML = ok
      ? `<span class="counter-ok">Selected: ${n} of 8 — all AIs active</span>`
      : `<span class="counter-warn">Select at least 2 providers to compare</span>`;
  }
}

/* -- Advanced grid ---------------------------------------------------------- */
function renderAdvGrid() {
  const el = document.getElementById('advGrid');
  const limit = getProviderLimit();
  const atLimit = selectedProviders.size >= limit;
  el.innerHTML = Forge.PROVIDERS.map(p => {
    const isSel   = selectedProviders.has(p.id);
    const isLive  = ['claude', 'chatgpt', 'gemini', 'mistral', 'deepseek', 'perplexity', 'grok', 'meta'].includes(p.id);
    const isLocked = !isSel && atLimit && limit < 8;
    const chipColor = isLocked ? 'rgba(148,148,170,0.35)' : p.color;
    const lockTitle = isLocked ? 'Unlock with Decide Faster — $14.95/month for all 8 AIs' : '';
    return `<div class="adv-chip${isSel ? ' selected' : ''}${!isLive ? ' coming-soon' : ''}${isLocked ? ' provider-locked' : ''}"
      style="color:${chipColor};${isLocked ? 'cursor:pointer;' : ''}" 
      onclick="${isLive ? `toggleProvider('${p.id}')` : ''}"
      title="${lockTitle}">
      <div style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></div>
      ${p.name}
      ${isLocked ? '<span style="font-size:9px;opacity:0.6;margin-left:2px" title="Unlock with Decide Faster">✦</span>' : ''}
      ${!isLive ? '<span class="coming-badge">Soon</span>' : ''}
    </div>`;
  }).join('');
}

/* -- Advanced toggle -------------------------------------------------------- */
function toggleAdvanced() {
  document.getElementById('advPanel').classList.toggle('open');
  document.getElementById('advToggle').classList.toggle('open');
  renderAdvGrid();
}
window.toggleAdvanced = toggleAdvanced;

/* -- Mode selector ---------------------------------------------------------- */
function setMode(mode) {
  document.querySelectorAll('.mode-tab').forEach((t, i) => t.classList.toggle('active', i === ['compare','rank','synthesize'].indexOf(mode)));
  if (mode === 'synthesize') location.href = '/synthesis.html';
  if (mode === 'rank') Forge.showToast('Rank mode -- coming soon!', 'info');
}
window.setMode = setMode;

/* -- Prompt starters -------------------------------------------------------- */
function fillStarter(el) {
  document.getElementById('promptInput').value = el.textContent; updateCounter();
  document.getElementById('promptInput').focus();
}
window.fillStarter = fillStarter;

/* -- Save / Load prompt ----------------------------------------------------- */
document.getElementById('savePromptBtn')?.addEventListener('click', async () => {
  // Don't save follow-up questions
  const promptText = document.getElementById('promptInput')?.value?.trim() || '';
  if (promptText.includes('| Follow-up:')) {
    Forge.showToast('Follow-up questions are not saved to library', 'warn');
    return;
  }
  const text = document.getElementById('promptInput').value.trim();
  if (!text) { Forge.showToast('Enter a prompt first.', 'warn'); return; }

  // Auto-categorise prompt
  function autoCategory(t) {
    const lower = t.toLowerCase();
    if (/\?$|^(what|who|where|when|why|how|is|are|can|does|do|will)/.test(lower)) return 'Questions';
    if (/(review|edit|improve|fix|check|proofread|correct|refine)/.test(lower)) return 'Review';
    if (/(analys|evaluat|assess|compar|research|investigat|explor)/.test(lower)) return 'Analysis';
    if (/(write|draft|create|generate|compose|summar)/.test(lower)) return 'Writing';
    if (/(strateg|plan|decide|should|recommend|advise|suggest)/.test(lower)) return 'Strategy';
    return null;
  }

  const category = autoCategory(text);
  const r = await Forge.prompts.create(text, category ? { category } : {});
  if (r.ok) { userPrompts.unshift(r.data.prompt); Forge.showToast('Saved to Prompt Library!', 'success'); }
});

document.getElementById('loadPromptBtn').addEventListener('click', openPL);

/* -- Prompt Library Modal --------------------------------------------------- */
function openPL() { document.getElementById('plModal').classList.add('show'); renderPLList(userPrompts); }
function closePL() { document.getElementById('plModal').classList.remove('show'); }
window.closePL = closePL;

function renderPLList(list) {
  const el = document.getElementById('plList');
  if (!Forge.isAuthenticated()) {
    el.innerHTML = `<div class="pl-empty"><a href="/signin.html" style="color:var(--accent)">Sign in</a> to use your Prompt Library.</div>`;
    return;
  }
  if (!list.length) { el.innerHTML = `<div class="pl-empty">No saved prompts yet. Use &#128190; to save prompts.</div>`; return; }
  el.innerHTML = '';
  list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pl-item';
    div.innerHTML = `${p.favorite ? '&#11088; ' : ''}${p.text.slice(0, 90)}${p.text.length > 90 ? '...' : ''}
      <div class="pl-meta">Used ${p.usedCount || 0}x${p.category && p.category !== 'Other' ? ' · ' + p.category : ''}</div>`;
    div.addEventListener('click', () => loadPromptText(p.text, p.id));
    el.appendChild(div);
  });
}

function filterPL() {
  const q = document.getElementById('plSearch').value.toLowerCase();
  renderPLList(userPrompts.filter(p => p.text.toLowerCase().includes(q)));
}
window.filterPL = filterPL;

async function loadPromptText(text, id) {
  document.getElementById('promptInput').value = text; updateCounter();
  closePL();
  if (id) Forge.prompts.recordUse(id);
  Forge.showToast('Prompt loaded!', 'success');
  document.getElementById('promptInput').focus();
}
window.loadPromptText = loadPromptText;

/* -- Auth gate ------------------------------------------------------------- */
function showAuthModal() {
  document.getElementById('__authModal')?.remove();
  const m = document.createElement('div');
  m.id = '__authModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  m.innerHTML = `
    <div style="background:#111118;border:1px solid #2a2a3e;border-radius:16px;padding:32px;max-width:380px;width:90%;text-align:center;font-family:-apple-system,sans-serif;">
      <div style="font-size:28px;margin-bottom:12px;">&#128293;</div>
      <div style="font-size:20px;font-weight:700;color:#e8e8f0;margin-bottom:8px;">Sign in to Forge</div>
      <div style="font-size:14px;color:#6b6b88;margin-bottom:6px;line-height:1.5;">One question. Eight minds. One decision.</div>
      <div style="font-size:13px;color:#6b6b88;margin-bottom:24px;">Sign in to get all perspectives.</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a href="/signin.html?return=${encodeURIComponent(window.location.pathname)}" style="background:linear-gradient(135deg,#ff6b35,#ff9a56);color:#fff;padding:12px 24px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;display:block;">Sign In</a>
        <a href="/register.html" style="background:transparent;color:#ff6b35;padding:10px 24px;border-radius:10px;font-weight:600;font-size:14px;text-decoration:none;border:1px solid rgba(255,107,53,0.3);display:block;">Create Free Account</a>
        <button onclick="document.getElementById('__authModal').remove()" style="background:transparent;border:none;color:#6b6b88;font-size:13px;cursor:pointer;margin-top:4px;">Maybe later</button>
      </div>
    </div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
}

/* -- Quick Answer Modal ----------------------------------------------------- */
document.getElementById('quickBtn')?.addEventListener('click', openQA);
async function openQA() {
  // Ensure session is restored before checking auth
  if (!Forge.isAuthenticated()) {
    await Forge.restoreSession();
  }
  if (!Forge.isAuthenticated()) { showAuthModal(); return; }

  // Detect browser
  const ua = navigator.userAgent;
  const isChrome  = /Chrome/.test(ua) && !/Edg/.test(ua) && !/OPR/.test(ua);
  const isEdge    = /Edg\//.test(ua);
  const isOpera   = /OPR\//.test(ua);
  const isSafari  = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isFirefox = /Firefox/.test(ua);

  const el = document.getElementById('qaList');
  if (!extensionActive) {
    let installHTML = '';
    if (isChrome) {
      installHTML = `
        <a href="https://chromewebstore.google.com/detail/forge/onlaamgggkmmnpbkcllnhdpecaidfpml"
           target="_blank"
           style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#ff6b35;border-radius:10px;color:#fff;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:12px">
          ⚡ Install for Chrome — Free
        </a>
        <div style="font-size:11px;color:#6b6b88">Already installed? <span style="color:#ff6b35;cursor:pointer" onclick="location.reload()">Refresh the page</span></div>`;
    } else if (isEdge) {
      installHTML = `
        <a href="https://chromewebstore.google.com/detail/forge/onlaamgggkmmnpbkcllnhdpecaidfpml"
           target="_blank"
           style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#ff6b35;border-radius:10px;color:#fff;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:12px">
          ⚡ Install for Edge — Free
        </a>
        <div style="font-size:11px;color:#6b6b88">Edge supports Chrome extensions — installs in one click.</div>`;
    } else if (isOpera) {
      installHTML = `
        <a href="https://chromewebstore.google.com/detail/forge/onlaamgggkmmnpbkcllnhdpecaidfpml"
           target="_blank"
           style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#ff6b35;border-radius:10px;color:#fff;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:12px">
          ⚡ Install for Opera — Free
        </a>
        <div style="font-size:11px;color:#6b6b88">Opera supports Chrome extensions — installs in one click.</div>`;
    } else if (isSafari || isFirefox) {
      installHTML = `
        <div style="font-size:12px;color:#6b6b88;margin-bottom:16px;line-height:1.6">
          The Forge extension is currently available for Chrome, Edge, and Opera.<br>
          For the best experience, open Forge in Chrome.
        </div>
        <a href="https://www.google.com/chrome/" target="_blank"
           style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#ff6b35;border-radius:10px;color:#fff;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:12px">
          Open in Chrome
        </a>
        <div style="font-size:11px;color:#6b6b88">Safari &amp; Firefox extensions coming soon.</div>`;
    } else {
      installHTML = `
        <a href="https://chromewebstore.google.com/detail/forge/onlaamgggkmmnpbkcllnhdpecaidfpml"
           target="_blank"
           style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#ff6b35;border-radius:10px;color:#fff;font-size:13px;font-weight:600;text-decoration:none;margin-bottom:12px">
          ⚡ Install Forge Extension — Free
        </a>`;
    }

    el.innerHTML = `
      <div style="padding:16px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">🔥</div>
        <div style="font-size:14px;font-weight:600;color:#e8e8f0;margin-bottom:8px">Install the Forge extension first</div>
        <div style="font-size:12px;color:#6b6b88;margin-bottom:16px;line-height:1.6">
          Quick Answer opens your AI directly and brings you back to Forge automatically.<br>
          The extension makes this seamless — one click, no copy-pasting.
        </div>
        ${installHTML}
      </div>`;
    document.getElementById('qaModal').classList.add('show');
    return;
  }

  renderQAList();
  document.getElementById('qaModal').classList.add('show');
}
function closeQA() { document.getElementById('qaModal').classList.remove('show'); }
window.closeQA = closeQA;

function renderQAList() {
  const el     = document.getElementById('qaList');
  const isAuth = Forge.isAuthenticated();
  el.innerHTML = Forge.PROVIDERS.map(p => {
    const isConn = true; // All providers available via Forge backend API
    return `<div class="qa-row" onclick="goQuickChat('${p.id}')">
      <div class="qa-dot" style="background:${p.color}"></div>
      <span class="qa-name">${p.name}</span>
      <span class="qa-status${isConn ? ' ok' : ''}">${isConn ? '&#9679; Ready' : 'Not connected'}</span>
    </div>`;
  }).join('');
}

function goQuickChat(id) {
  closeQA();
  const PROVIDER_URLS = {
    claude:      'https://claude.ai/new',
    chatgpt:     'https://chatgpt.com',
    gemini:      'https://gemini.google.com',
    mistral:     'https://chat.mistral.ai',
    deepseek:    'https://chat.deepseek.com',
    perplexity:  'https://www.perplexity.ai',
    grok:        'https://grok.com',
  };
  // Open in same tab "” Forge bar stays active, user navigates back via extension
  window.location.href = PROVIDER_URLS[id] || 'https://claude.ai/new';
}
window.goQuickChat = goQuickChat;

/* -- Keyboard shortcut ------------------------------------------------------ */
document.getElementById('promptInput').addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runCompare();
});
document.getElementById('compareBtn').addEventListener('click', runCompare);
document.getElementById('promptInput')?.addEventListener('input', updateCounter);
// quickBtn removed from UI "” kept for backwards compat
document.getElementById('quickBtn')?.addEventListener('click', openQA);

/* -- Perspectives ------------------------------------------------------------ */
async function runCompare() {
  if (!Forge.isAuthenticated()) { showAuthModal(); return; }
  const cleanPrompt = document.getElementById('promptInput').value.trim();
  const prompt = cleanPrompt + (typeof perspFileContext !== 'undefined' ? perspFileContext : '');
  const _lang = typeof _selectedLang !== 'undefined' ? _selectedLang : (localStorage.getItem('forge_language') || 'en');
  if (!cleanPrompt)                 { Forge.showToast('Please enter a question or prompt first.', 'warn'); return; }
  if (selectedProviders.size < 2)   { Forge.showToast('Select at least 2 providers.', 'warn'); return; }
  if (isRunning)                     return;



  isRunning = true;
  compareResults = {}; synthData = {};
  const _provLimit = getProviderLimit();
  const models = [...selectedProviders].slice(0, _provLimit);
  // Signal synthesis to reset if this is a NEW different prompt
  const _lastSynthPrompt = sessionStorage.getItem('synth_last_prompt');
  if (_lastSynthPrompt && _lastSynthPrompt !== prompt) {
    sessionStorage.removeItem('synth_last_prompt');
  }

  const section = document.getElementById('resultsSection');
  section.style.display = '';
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  document.getElementById('resultsHeading').textContent = 'Incoming responses';
  document.getElementById('resultsSub').textContent     = `Collecting from ${models.length} AIs...`;
  document.getElementById('synthStrip').style.display   = 'none';
  document.getElementById('continueRow').style.display  = 'none';
  document.getElementById('progressFill').style.width   = '12%';

  renderLoadingCards(models);
  updateCounter();

  // Always use backend API with SSE streaming "” fastest and most reliable
  document.getElementById('resultsSub').textContent = 'Getting perspectives...';
  const streamUrl = (Forge.API_BASE || 'https://api.projectcoachai.com') + '/api/compare';
  let streamSuccess = false;
    try {
      const resp = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream',
                   'Authorization': `Bearer ${Forge.getToken?.() || ''}` },
        body: JSON.stringify({ prompt, models, language: localStorage.getItem('forge_language') || 'en', imageData: (typeof perspImageData !== 'undefined' ? perspImageData : null) })
      });
      if (resp.ok && (resp.headers.get('content-type')?.includes('text/event-stream') || resp.headers.get('content-type')?.includes('text/plain'))) {
        streamSuccess = true;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedCount = 0;
        renderLoadingCards(models);
        document.getElementById('resultsSection').style.display = '';
        document.getElementById('synthStrip').style.display = '';
        document.getElementById('synthSub').textContent = '\u29f3 Waiting for responses...';
        document.getElementById('continueRow').style.display = 'none';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.type === 'response') {
                compareResults[event.model] = { content: event.content, error: event.error, elapsed: event.elapsed };
                if (event.content) receivedCount++;
                renderResultCards(models, compareResults);
                document.getElementById('resultsHeading').textContent = receivedCount === models.length ? `${receivedCount} of ${models.length} responses received` : `${receivedCount} of ${models.length} responses received...`;
                document.getElementById('progressFill').style.width = `${(receivedCount / models.length) * 80}%`;
              }
              if (event.type === 'synthesizing') {
                document.getElementById('synthSub').textContent = '\u29f3 Preparing best answer...';
              }
              if (event.type === 'synthesis') {
                synthData = { responses: compareResults, synthesis: event.synthesis, ranking: event.ranking, confidence: event.confidence, suggestedQuestions: event.suggestedQuestions };
                document.getElementById('synthSub').textContent = 'Responses synthesised into one decision-ready answer.';
                showSynthesisStrip(synthData);
                Forge.showToast('Best Answer ready \u2726', 'success');
              }
              if (event.type === 'done') {
                const ok = Object.values(compareResults).filter(v => v?.content).length;
                document.getElementById('progressFill').style.width = '100%';
                document.getElementById('resultsHeading').textContent = `${ok} of ${models.length} responses ready`;
                document.getElementById('resultsSub').textContent = '';
                Forge.session.saveComparison({ prompt: cleanPrompt, responses: compareResults, models, timestamp: Date.now(), imageData: (typeof perspImageData !== 'undefined' ? perspImageData : null) });
                Forge.showToast(`${ok} response${ok !== 1 ? 's' : ''} received`, 'success');
                // Keep prompt visible for follow-up context
                isRunning = false; updateCounter();
              }
            } catch(_) {}
          }
        }
      }
      // Stream ended — ensure state is reset
      isRunning = false;
    } catch(streamErr) {
      console.warn('SSE failed, falling back to standard request:', streamErr.message);
      isRunning = false;
    }

    if (!streamSuccess) {
      const r = await Forge.compare.run(prompt, models);
      if (!r.ok) { Forge.showToast(r.data?.error || 'Perspectives failed.', 'error'); isRunning = false; updateCounter(); return; }
      compareResults = r.data.responses || {};
      synthData = r.data;
      renderResultCards(models, compareResults);
      const ok = Object.values(compareResults).filter(v => v?.content).length;
      document.getElementById('progressFill').style.width = '100%';
      document.getElementById('resultsHeading').textContent = `${ok} of ${models.length} responses ready`;
      document.getElementById('resultsSub').textContent = '';
      document.getElementById('synthStrip').style.display = '';
      document.getElementById('synthSub').textContent = 'Responses synthesised into one decision-ready answer.';
      document.getElementById('continueRow').style.display = 'flex';

      showSynthesisStrip(r.data);
      Forge.session.saveComparison({ prompt: cleanPrompt, responses: compareResults, models, timestamp: Date.now(), imageData: (typeof perspImageData !== 'undefined' ? perspImageData : null) });
      Forge.showToast(`${ok} response${ok !== 1 ? 's' : ''} received`, 'success');
      // Keep prompt visible for follow-up context
      isRunning = false; updateCounter();
    }
    return;
  }

function renderLoadingCards(models) {
  document.getElementById('responsesGrid').innerHTML = models.map(id => {
    const p = Forge.getProvider(id);
    return `<div class="response-card">
      <div class="card-hdr">
        <div class="card-provider" style="color:${p.color}"><div class="card-dot"></div>${p.name}</div>
        <span class="card-badge badge-loading">Thinking...</span>
      </div>
      <div class="card-body empty">
        <div class="shimmer"></div><div class="shimmer"></div><div class="shimmer"></div><div class="shimmer"></div>
      </div>
    </div>`;
  }).join('');
}

function renderResultCards(models, results, isDone = false) {
  document.getElementById('responsesGrid').innerHTML = models.map((id, i) => {
    const p       = Forge.getProvider(id);
    const r       = results[id] || {};
    const ok      = r.content && !r.error;
    const pending = !r.content && !r.error && !isDone;
    const failed  = !r.content && (r.error || isDone);
    const preview = r.content ? r.content.slice(0, 300) + (r.content.length > 300 ? '...' : '') : '';
    const elapsed = r.elapsed ? `${(r.elapsed / 1000).toFixed(1)}s` : '';
    const meta    = sourceMetadata[id];
    const trustTime = meta?.capturedAt
      ? new Date(meta.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return `<div class="response-card" style="animation-delay:${i * .05}s">
      <div class="card-hdr">
        <div class="card-provider" style="color:${p.color}"><div class="card-dot"></div>${p.name}</div>
        <span class="card-badge ${ok ? 'badge-done' : pending ? 'badge-loading' : 'badge-error'}">
          ${ok ? 'Received' : pending ? 'Receiving...' : 'Failed'}
        </span>
      </div>
      <div class="card-body${ok ? '' : ' empty'}">
        ${ok
          ? `<div class="md">${Forge.renderMarkdown(preview)}</div>`
          : pending
            ? `<div class="shimmer"></div><div class="shimmer"></div><div class="shimmer"></div>`
            : `<span style="color:#ef4444;font-size:13px;">&#9888; ${r.error || 'No response received'}</span>`}
      </div>
      ${ok && extensionActive ? `<div class="card-trust">
        <span class="trust-dot" style="background:${p.color}"></span>
        <span>Captured live from ${p.name}</span>
        <span class="trust-sep">·</span>
        <span>${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
        <span class="trust-sep">·</span>
        <button class="trust-link" onclick="viewInProvider('${id}')">View in ${p.name} &#8594;</button>
      </div>` : ''}
      ${ok ? `<div class="card-ftr">
        <span class="card-time">${elapsed}</span>
        <div class="card-actions">
          <button class="icon-btn" onclick="copyResp('${id}')" title="Copy">&#128203; Copy</button>
          <button class="icon-btn" onclick="expandResp('${id}')" title="Expand">&#10530; Expand</button>
          <button class="icon-btn" onclick="rateResp('${id}','up',this)" title="Good response">&#128077;</button>
          <button class="icon-btn" onclick="rateResp('${id}','down',this)" title="Poor response">&#128078;</button>
          <button class="icon-btn" onclick="readAloud('${id}')" title="Read aloud">&#128266;</button>
        </div>
      </div>` : pending ? '' : `<div class="card-ftr"><button class="icon-btn" onclick="retryProvider('${id}')" style="color:#ff6b35">&#8635; Retry</button></div>`}
    </div>`;
  }).join('');
}

async function retryProvider(id) {
  const prompt = document.getElementById('promptInput')?.value?.trim() ||
                 (Forge.session.loadComparison()?.prompt || '');
  if (!prompt) { Forge.showToast('No prompt to retry.', 'warn'); return; }
  // Retry single provider only
  const card = document.getElementById(`rcard-${id}`) || document.querySelector(`[data-id="${id}"]`);
  compareResults[id] = { content: null, error: null, loading: true };
  renderResultCards([...selectedProviders], compareResults);
  try {
    const r = await Forge.compare.run(prompt, [id]);
    if (r.ok && r.data.responses?.[id]) {
      compareResults[id] = r.data.responses[id];
    } else {
      compareResults[id] = { content: null, error: 'Retry failed' };
    }
  } catch(e) {
    compareResults[id] = { content: null, error: e.message };
  }
  renderResultCards([...selectedProviders], compareResults);
  Forge.showToast(`${id} response updated`, 'success');
}
window.retryProvider = retryProvider;

function showSynthesisStrip(data) {
  document.getElementById('synthStrip').style.display = '';
  if (data.confidence) {
    document.getElementById('confBlock').style.display = 'flex';
    document.getElementById('confScore').textContent   = data.confidence.score + '%';
    document.getElementById('confFill').style.width    = data.confidence.score + '%';
    document.getElementById('synthSub').textContent   = data.confidence.explanation || 'Synthesis complete.';
  }
  if (data.suggestedQuestions?.length) {
    document.getElementById('followupChips').innerHTML = data.suggestedQuestions.slice(0, 3)
      .map(q => `<div class="followup-chip" onclick="submitChip(${JSON.stringify(q)})">${q.replace(/[#*`_~>]/g,'').trim()}</div>`).join('');
  }
  document.getElementById('continueRow').style.display = 'flex';

}

function submitChip(q) {
  const input = document.getElementById('promptInput');
  if (!input) return;
  input.value = q;
  input.focus();
  // Clear file context so old attachment doesn't contaminate new question
  if (typeof perspFileContext !== 'undefined') perspFileContext = '';
  // Scroll to top then run after scroll settles
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    // Verify prompt is still set (defensive)
    if (!input.value.trim()) input.value = q;
    runCompare();
  }, 400);
}
window.submitChip = submitChip;

function refillPrompt(q) {
  document.getElementById('promptInput').value = q;
  updateCounter();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('promptInput').focus();
}
window.refillPrompt = refillPrompt;
function submitFollowup() {
  const input = document.getElementById('followupInput');
  const q = input?.value?.trim();
  if (!q) return;
  input.value = '';
  // Use original question as base "” avoid appending chains that hit char limits
  const originalPrompt = compareResults && Object.keys(compareResults).length > 0
    ? (Forge.session.loadComparison()?.prompt || document.getElementById('promptInput').value.trim())
    : document.getElementById('promptInput').value.trim();
  // Keep it concise: original context + new question only
  const basePrompt = originalPrompt.split(' | Follow-up:')[0].trim(); // strip any prior follow-ups
  const combined = basePrompt ? basePrompt + ' | Follow-up: ' + q : q;
  // Cap at 500 chars to prevent API limit issues
  const capped = combined.length > 500 ? basePrompt.slice(0, 200) + '... | Follow-up: ' + q : combined;
  Forge.showToast('Running follow-up...', 'info');
  setTimeout(() => {
    document.getElementById('promptInput').value = capped;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    runCompare();
  }, 100);
}
window.submitFollowup = submitFollowup;

// ── File Attachment (Perspectives) ───────────────────────────────────────────
var perspFileContext = '';
var perspImageData = null; // base64 image data for vision models


function clearPerspFile() {
  perspFileContext = '';
  perspImageData = null;
  const pi = document.getElementById('promptInput');
  if (pi) pi.placeholder = "I’m deciding between two job offers — one pays more, one has more growth potential. What should I consider?";
  var fi = document.getElementById('perspFileInput');
  if (fi) fi.value = '';
  var tag = document.getElementById('perspFileTag');
  if (tag) tag.style.display = 'none';
  var fn = document.getElementById('perspFileName');
  if (fn) fn.textContent = '';
}

async function handlePerspFile(input) {
  var file = input.files[0];
  if (!file) return;
  var fn = document.getElementById('perspFileName');
  var tag = document.getElementById('perspFileTag');
  if (fn) fn.textContent = file.name;
  if (tag) tag.style.display = 'inline-block';
  Forge.showToast('Reading file...', 'info');
  try {
    var ext = file.name.split('.').pop().toLowerCase();
    if (file.type.startsWith('image/')) {
      // Read image as base64 for vision-capable models
      const reader = new FileReader();
      reader.onload = function(e) {
        const base64 = e.target.result; // data:image/jpeg;base64,...
        perspFileContext = '\n\n[Attached image: ' + file.name + ']';
        perspImageData = { base64: base64, mimeType: file.type, name: file.name };
        Forge.showToast('Image ready — ask your question!', 'success');
        document.getElementById('promptInput').placeholder = 'Image attached — what would you like to know about it?';
        document.getElementById('promptInput').focus();
      };
      reader.readAsDataURL(file);
      return; // early return — toast shown in onload
    } else if (ext === 'docx') {
      var arrayBuffer = await file.arrayBuffer();
      var mammoth = await loadMammothLib();
      var result = await mammoth.extractRawText({ arrayBuffer });
      perspFileContext = '\n\n[Attached document: ' + file.name + ']\n' + result.value.slice(0, 50000);
    } else if (ext === 'pdf') {
      var pdfText = await extractPdfTextPersp(file);
      perspFileContext = '\n\n[Attached PDF: ' + file.name + ']\n' + pdfText.slice(0, 50000);
    } else if (['txt','csv','md','json'].includes(ext)) {
      var text = await new Promise(function(res, rej) {
        var r = new FileReader(); r.onload = function(e) { res(e.target.result); }; r.onerror = rej; r.readAsText(file);
      });
      perspFileContext = '\n\n[Attached file: ' + file.name + ']\n' + text.slice(0, 50000);
    } else {
      Forge.showToast('Unsupported file type. Use TXT, CSV, DOCX, or PDF.', 'warn');
      clearPerspFile(); return;
    }
    Forge.showToast('File ready — ask your question!', 'success');
    document.getElementById('promptInput').placeholder = 'File attached — what would you like to know about it?';
    document.getElementById('promptInput').focus();
  } catch(e) {
    Forge.showToast('Could not read file: ' + e.message, 'error');
    clearPerspFile();
  }
}

async function loadMammothLib() {
  if (window.mammoth) return window.mammoth;
  await new Promise(function(res, rej) {
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.mammoth;
}

async function extractPdfTextPersp(file) {
  if (!window.pdfjsLib) {
    await new Promise(function(res, rej) {
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  var arrayBuffer = await file.arrayBuffer();
  var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  var text = '';
  for (var i = 1; i <= Math.min(pdf.numPages, 20); i++) {
    var page = await pdf.getPage(i);
    var pageContent = await page.getTextContent();
    text += pageContent.items.map(function(s) { return s.str; }).join(' ') + '\n';
  }
  return text;
}
window.handlePerspFile = handlePerspFile;

// ── Language toggle ───────────────────────────────────────────
var _selectedLang = localStorage.getItem('forge_language') || 'en';
var _langFlags = { en:'🇬🇧', de:'🇩🇪', fr:'🇫🇷', it:'🇮🇹' };

function toggleLangMenu() {
  var m = document.getElementById('langMenu');
  if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
}

function selectLang(lang, flag) {
  _selectedLang = lang;
  localStorage.setItem('forge_language', lang);
  var btn = document.getElementById('langToggle');
  if (btn) btn.textContent = flag;
  var m = document.getElementById('langMenu');
  if (m) m.style.display = 'none';
  Forge.showToast('Language set to ' + flag, 'success');
}

// Close lang menu on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('#langToggle') && !e.target.closest('#langMenu')) {
    var m = document.getElementById('langMenu');
    if (m) m.style.display = 'none';
  }
});

// Init flag from saved language
(function() {
  var saved = localStorage.getItem('forge_language') || 'en';
  _selectedLang = saved;
  setTimeout(function() {
    var btn = document.getElementById('langToggle');
    if (btn) btn.textContent = _langFlags[saved] || '🇬🇧';
  }, 300);
})();

window.toggleLangMenu = toggleLangMenu;
window.selectLang = selectLang;

// Synthesis format mode is managed on the Synthesis page — not Perspectives
document.addEventListener('DOMContentLoaded', function() {
  // Trim default selection to user's provider limit and re-render UI
  var _limit = getProviderLimit();
  if (selectedProviders.size > _limit) {
    var _arr = Array.from(selectedProviders).slice(0, _limit);
    selectedProviders = new Set(_arr);
  }
  renderProviderChips();
  renderAdvGrid();
  updateCounter();
});
window.clearPerspFile = clearPerspFile;

function clearResults() {
  document.getElementById('resultsSection').style.display = 'none';
  compareResults = {}; synthData = {};
  Forge.session.clearComparison();
}
window.clearResults = clearResults;

function copyResp(id) {
  const c = compareResults[id]?.content;
  if (c) navigator.clipboard?.writeText(c);
  Forge.showToast('Copied!', 'success');
}
window.copyResp = copyResp;

function rateResp(id, rating, btn) {
  const r = compareResults[id];
  if (!r) return;
  btn.style.opacity = '1';
  btn.style.color = rating === 'up' ? '#22c55e' : '#ef4444';
  // Save rating to profile
  try {
    Forge.request('POST', '/api/track', { event: 'response_rated', provider: id, rating, prompt: document.getElementById('promptInput')?.value?.slice(0,100) }).catch(()=>{});
  } catch(_) {}
  Forge.showToast(rating === 'up' ? 'Marked as helpful!' : 'Thanks for the feedback', 'success');
}
window.rateResp = rateResp;

function readAloud(id) {
  const r = compareResults[id];
  if (!r?.content) return;
  if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); return; }
  const utt = new SpeechSynthesisUtterance(r.content.replace(/[#*`_~>]/g, '').slice(0, 3000));
  utt.rate = 1.0; utt.pitch = 1.0;
  window.speechSynthesis.speak(utt);
  Forge.showToast('Reading aloud — click again to stop', 'info');
}
window.readAloud = readAloud;

function expandResp(id) {
  const r = compareResults[id]; const p = Forge.getProvider(id);
  if (!r?.content) return;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  const box = document.createElement('div');
  box.style.cssText = 'background:#111118;border:1px solid #2a2a3e;border-radius:16px;padding:24px;width:90%;max-width:720px;max-height:85vh;overflow-y:auto';
  box.innerHTML = '<div style="font-weight:700;font-size:15px;margin-bottom:12px;color:' + p.color + '">' + p.name + '</div><div class="md">' + Forge.renderMarkdown(r.content) + '</div>';
  const btn = document.createElement('button');
  btn.textContent = 'Close';
  btn.style.cssText = 'margin-top:16px;padding:8px 20px;border-radius:8px;background:rgba(255,255,255,0.06);border:1px solid #2a2a3e;color:#9494aa;cursor:pointer;font-size:13px;width:100%';
  btn.onclick = () => overlay.remove();
  box.appendChild(btn); overlay.appendChild(box); document.body.appendChild(overlay);
}
window.expandResp = expandResp;

// -- View in Provider "” trust layer tab switch ---------------------------------
function viewInProvider(id) {
  const meta = sourceMetadata[id];
  if (!meta) return;
  // Try extension FOCUS_SOURCE_TAB first, fall back to window.postMessage, then direct open
  try {
    window.postMessage({
      type: '__FORGE_TO_EXT__',
      payload: { type: 'FOCUS_SOURCE_TAB', tabId: meta.sourceTabId, url: meta.sourceUrl }
    }, '*');
    // Give extension 400ms to switch, then open directly if nothing happened
    setTimeout(() => {
      // If page is still focused (extension didn't switch us away), open directly
      if (document.hasFocus() && meta.sourceUrl) {
        window.open(meta.sourceUrl, '_blank');
      }
    }, 400);
  } catch(_) {
    if (meta?.sourceUrl) window.open(meta.sourceUrl, '_blank');
  }
}
window.viewInProvider = viewInProvider;

// -- Provider Login Popup ------------------------------------------------------
const PROVIDER_LOGIN_URLS = {
  claude:      'https://claude.ai',
  chatgpt:     'https://chatgpt.com',
  gemini:      'https://gemini.google.com',
  mistral:     'https://console.mistral.ai',
  deepseek:    'https://platform.deepseek.com',
  perplexity:  'https://www.perplexity.ai',
  grok:        'https://x.ai',
};

let loginPopup = null;
let loginPollInterval = null;

function openProviderLogin(providerId) {
  const url = PROVIDER_LOGIN_URLS[providerId];
  if (!url) return;

  // Close any existing popup
  if (loginPopup && !loginPopup.closed) loginPopup.close();
  clearInterval(loginPollInterval);

  const p = Forge.getProvider(providerId);
  const w = 520, h = 680;
  const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
  const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);

  loginPopup = window.open(url, `forge_login_${providerId}`,
    `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`);

  if (!loginPopup) {
    Forge.showToast('Popup blocked -- please allow popups for this site.', 'warn');
    return;
  }

  Forge.showToast(`Sign in to ${p?.name || providerId} in the popup window...`, 'info', 6000);

  // Poll for popup close -- when user closes it, refresh connection status
  loginPollInterval = setInterval(async () => {
    if (!loginPopup || loginPopup.closed) {
      clearInterval(loginPollInterval);
      loginPopup = null;
      // Refresh connection list after user has signed in
      await loadConnections();
      renderProviderChips();
      Forge.showToast(`${p?.name || providerId} connection refreshed.`, 'success');
    }
  }, 800);
}
window.openProviderLogin = openProviderLogin;


// -- Provider Picker (Add Tool panel) -----------------------------------------
var pickerOpen = false;

function togglePicker() {
  const panel = document.getElementById('providerPicker');
  const btn   = document.getElementById('addToolBtn');
  const isOpen = panel.style.display !== 'none' && panel.style.display !== '';
  if (!isOpen) {
    renderPicker();
    panel.style.display = 'block';
    btn.innerHTML = '&#10005; Close';
    pickerOpen = true;
  } else {
    panel.style.display = 'none';
    btn.innerHTML = '+ Add more minds';
    pickerOpen = false;
  }
}
window.togglePicker = togglePicker;

function renderPicker() {
  const panel = document.getElementById('providerPicker');
  const isAuth = Forge.isAuthenticated();

  const items = Forge.PROVIDERS.map(p => {
    const isSelected = selectedProviders.has(p.id);
    const isSoon = !['claude','chatgpt','gemini','mistral','deepseek','perplexity','grok','meta'].includes(p.id);
    if (isSoon) {
      return `<div class="picker-item picker-soon" style="color:${p.color}">
        <span class="picker-dot"></span>${p.name}
        <span class="picker-soon-badge">Soon</span>
      </div>`;
    }
    return `<div class="picker-item${isSelected ? ' picker-active' : ''}"
      style="color:${p.color}" onclick="pickerToggle('${p.id}')">
      <span class="picker-dot"></span>${p.name}
      ${isSelected ? '<span style="margin-left:auto;font-size:11px;opacity:.7">&#10003; On</span>' : ''}
    </div>`;
  }).join('');

  const footer = '';

  panel.innerHTML = items + footer;
}

function pickerToggle(id) {
  if (selectedProviders.has(id)) {
    if (selectedProviders.size > 2) selectedProviders.delete(id);
    else { Forge.showToast('Keep at least 2 providers selected.', 'warn'); return; }
  } else {
    selectedProviders.add(id);
  }
  renderProviderChips();
  renderPicker(); // re-render to update active states
}
window.pickerToggle = pickerToggle;


async function inviteColleague() {
  const user = Forge.getUser();
  if (!user) { window.location.href = '/signin.html?return=/index.html'; return; }
  try {
    const r = await Forge.request('POST', '/api/invite/generate');
    if (r.ok && r.data?.url) {
      await navigator.clipboard?.writeText(r.data.url);
      Forge.showToast('Invite link copied! Share it with a colleague.', 'success');
    }
  } catch(_) {
    Forge.showToast('Could not generate invite link.', 'error');
  }
}
window.inviteColleague = inviteColleague;

// -- Trust Layer CSS -----------------------------------------------------------
(function injectTrustCSS() {
  const s = document.createElement('style');
  s.textContent = `
    .card-trust {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 6px 14px;
      border-top: 1px solid rgba(255,255,255,0.05);
      font-size: 11px;
      color: #52526a;
      flex-wrap: wrap;
    }
    .trust-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .trust-sep { color: #2a2a3e; }
    .trust-link {
      background: none;
      border: none;
      color: #52526a;
      font-size: 11px;
      cursor: pointer;
      padding: 0;
      font-family: inherit;
      transition: color .15s;
    }
    .trust-link:hover { color: #f97316; }
  `;
  document.head.appendChild(s);
})();

// -- Trust Layer "” capture source metadata from extension responses ---------
window.addEventListener('message', function(event) {
  if (!event.data) return;
  // forge-isolated.js spreads message.data so the message arrives with type:'RESPONSE_CAPTURED' directly
  if (event.data.type === 'RESPONSE_CAPTURED' && event.data.provider && event.data.sourceUrl) {
    sourceMetadata[event.data.provider] = {
      sourceUrl:   event.data.sourceUrl,
      sourceTabId: event.data.sourceTabId || null,
      capturedAt:  event.data.capturedAt  || new Date().toISOString()
    };
    console.log(`[Forge Trust] Metadata stored for ${event.data.provider}:`, sourceMetadata[event.data.provider]);
    // Re-render cards now that trust metadata is available
    if (Object.keys(compareResults).length > 0) {
      renderResultCards([...selectedProviders], compareResults);
    }
  }
  // Also handle FORGE_TO_PAGE wrapper format (future-proofing)
  if (event.data.type === 'FORGE_TO_PAGE') {
    const data = event.data.data;
    if (data?.type === 'RESPONSE_CAPTURED' && data.provider && data.sourceUrl) {
      sourceMetadata[data.provider] = {
        sourceUrl:   data.sourceUrl,
        sourceTabId: data.sourceTabId || null,
        capturedAt:  data.capturedAt  || new Date().toISOString()
      };
      console.log(`[Forge Trust] Metadata stored for ${data.provider}:`, sourceMetadata[data.provider]);
    }
  }
});

