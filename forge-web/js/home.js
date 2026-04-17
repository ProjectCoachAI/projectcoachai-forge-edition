/* home.js — Logic for index.html */
'use strict';

let connectedProviders = new Set();
let selectedProviders  = new Set(['claude', 'chatgpt', 'gemini']);
let compareResults     = {};
let synthData          = {};
let userPrompts        = [];
let isRunning          = false;
let extensionActive    = false;

/* ── Init ─────────────────────────────────────────────────────────────────── */
(async function init() {
  try { await Forge.restoreSession(); } catch(_) {}
  renderHeaderAuth();
  await loadConnections();
  renderProviderChips();
  renderAdvGrid();
  renderQAList();
  updateCounter();
  checkExtensionStatus();

  // Pre-fill from URL ?prompt=
  const p = new URLSearchParams(window.location.search).get('prompt');
  if (p) document.getElementById('promptInput').value = decodeURIComponent(p);

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
      <div class="user-avatar">${(user.name || 'U')[0].toUpperCase()}</div>
      ${user.name?.split(' ')[0] || 'Account'}
      ${tier.badge ? `<span class="tier-badge">${tier.badge}</span>` : ''}
    </div>
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

/* ── Extension status banner ─────────────────────────────────────────────── */
async function checkExtensionStatus() {
  const bar = document.getElementById('statusBar');
  const txt = document.getElementById('statusText');
  if (!bar || !txt) return;

  const available = await Forge.extension.isAvailable();
  extensionActive = available;
  bar.style.display = 'inline-flex';

  if (available) {
    renderProviderChips(); // re-render so chips show "✓ Ready" via extension
    renderQAList();        // re-render Quick Answer modal with correct status
    bar.style.background = 'rgba(34,197,94,.08)';
    bar.style.borderColor = 'rgba(34,197,94,.2)';
    bar.querySelector('.status-dot').style.background = '#22c55e';
    txt.textContent = 'Forge is active — driving your AI accounts simultaneously across 7 engines.';
  } else {
    bar.style.background = 'rgba(255,107,53,.06)';
    bar.style.borderColor = 'rgba(255,107,53,.2)';
    bar.querySelector('.status-dot').style.background = '#ff6b35';
    bar.querySelector('.status-dot').style.animation = 'none';
    txt.innerHTML = 'Forge is active — 7 AI engines ready. <a href="/help.html" style="color:var(--accent)">Add the Forge Bar</a> to drive your own AI accounts.';
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

/* ── Provider chips ───────────────────────────────────────────────────────── */
function renderProviderChips() {
  const el     = document.getElementById('providerChips');
  const isAuth = Forge.isAuthenticated();
  const live   = ['claude', 'chatgpt', 'gemini', 'mistral', 'deepseek', 'perplexity', 'grok'];
  el.innerHTML = live.map(id => {
    const p      = Forge.getProvider(id);
    const isSel  = selectedProviders.has(id);
    const isConn = !isAuth || connectedProviders.has(id) || extensionActive;
    // Click always toggles selection — extension handles connection automatically
    const clickHandler = `toggleProvider('${id}')`;
    return `<div class="provider-chip${isSel ? ' selected' : ''}${isAuth && !isConn ? ' not-connected-chip' : ''}" style="color:${p.color};" onclick="${clickHandler}" title="${isAuth && !isConn ? 'Open ' + p.name + ' in a tab and sign in, then compare' : ''}">
      <div class="chip-dot"></div>
      ${p.name}
      ${isAuth ? `<span class="chip-status${isConn ? '' : ' disconnected'}">${isConn ? '✓ Ready' : 'Open tab to use'}</span>` : ''}
    </div>`;
  }).join('');
}

function toggleProvider(id) {
  if (selectedProviders.has(id)) {
    if (selectedProviders.size > 1) selectedProviders.delete(id);
  } else {
    selectedProviders.add(id);
  }
  renderProviderChips();
  renderAdvGrid();
  updateCounter();
}

function resetToDefault() {
  selectedProviders = new Set(['claude', 'chatgpt', 'gemini']);
  renderProviderChips();
  renderAdvGrid();
  updateCounter();
}
window.resetToDefault = resetToDefault;

function updateCounter() {
  const n   = selectedProviders.size;
  const ok  = n >= 2;
  const btn = document.getElementById('compareBtn');
  const bar = document.getElementById('counterBar');
  btn.disabled = !ok || isRunning;
  bar.innerHTML = ok
    ? `<span class="counter-ok">Connected: ${connectedProviders.size || n}/2 minimum · Selected: ${n}</span>`
    : `<span class="counter-warn">Select at least 2 providers to compare</span>`;
}

/* ── Advanced grid ────────────────────────────────────────────────────────── */
function renderAdvGrid() {
  const el = document.getElementById('advGrid');
  el.innerHTML = Forge.PROVIDERS.map(p => {
    const isSel  = selectedProviders.has(p.id);
    const isLive = ['claude', 'chatgpt', 'gemini', 'mistral', 'deepseek', 'perplexity', 'grok'].includes(p.id);
    return `<div class="adv-chip${isSel ? ' selected' : ''}${!isLive ? ' coming-soon' : ''}"
      style="color:${p.color};" onclick="${isLive ? `toggleProvider('${p.id}')` : ''}">
      <div style="width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;"></div>
      ${p.name}
      ${!isLive ? '<span class="coming-badge">Soon</span>' : ''}
    </div>`;
  }).join('');
}

/* ── Advanced toggle ──────────────────────────────────────────────────────── */
function toggleAdvanced() {
  document.getElementById('advPanel').classList.toggle('open');
  document.getElementById('advToggle').classList.toggle('open');
  renderAdvGrid();
}
window.toggleAdvanced = toggleAdvanced;

/* ── Mode selector ────────────────────────────────────────────────────────── */
function setMode(mode) {
  document.querySelectorAll('.mode-tab').forEach((t, i) => t.classList.toggle('active', i === ['compare','rank','synthesize'].indexOf(mode)));
  if (mode === 'synthesize') location.href = '/synthesis.html';
  if (mode === 'rank') Forge.showToast('Rank mode — coming soon!', 'info');
}
window.setMode = setMode;

/* ── Prompt starters ──────────────────────────────────────────────────────── */
function fillStarter(el) {
  document.getElementById('promptInput').value = el.textContent;
  document.getElementById('promptInput').focus();
}
window.fillStarter = fillStarter;

/* ── Save / Load prompt ───────────────────────────────────────────────────── */
document.getElementById('savePromptBtn')?.addEventListener('click', async () => {
  const text = document.getElementById('promptInput').value.trim();
  if (!text) { Forge.showToast('Enter a prompt first.', 'warn'); return; }
  const r = await Forge.prompts.create(text);
  if (r.ok) { userPrompts.unshift(r.data.prompt); Forge.showToast('Saved to Prompt Library!', 'success'); }
});

document.getElementById('loadPromptBtn').addEventListener('click', openPL);

/* ── Prompt Library Modal ─────────────────────────────────────────────────── */
function openPL() { document.getElementById('plModal').classList.add('show'); renderPLList(userPrompts); }
function closePL() { document.getElementById('plModal').classList.remove('show'); }
window.closePL = closePL;

function renderPLList(list) {
  const el = document.getElementById('plList');
  if (!Forge.isAuthenticated()) {
    el.innerHTML = `<div class="pl-empty"><a href="/signin.html" style="color:var(--accent)">Sign in</a> to use your Prompt Library.</div>`;
    return;
  }
  if (!list.length) { el.innerHTML = `<div class="pl-empty">No saved prompts yet. Use 💾 to save prompts.</div>`; return; }
  el.innerHTML = '';
  list.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pl-item';
    div.innerHTML = `${p.favorite ? '⭐ ' : ''}${p.text.slice(0, 90)}${p.text.length > 90 ? '…' : ''}
      <div class="pl-meta">Used ${p.usedCount || 0}x · ${p.category || ''}</div>`;
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
  document.getElementById('promptInput').value = text;
  closePL();
  if (id) Forge.prompts.recordUse(id);
  Forge.showToast('Prompt loaded!', 'success');
  document.getElementById('promptInput').focus();
}
window.loadPromptText = loadPromptText;

/* ── Auth gate ───────────────────────────────────────────────────────────── */
function showAuthModal() {
  document.getElementById('__authModal')?.remove();
  const m = document.createElement('div');
  m.id = '__authModal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  m.innerHTML = `
    <div style="background:#111118;border:1px solid #2a2a3e;border-radius:16px;padding:32px;max-width:380px;width:90%;text-align:center;font-family:-apple-system,sans-serif;">
      <div style="font-size:28px;margin-bottom:12px;">🔥</div>
      <div style="font-size:20px;font-weight:700;color:#e8e8f0;margin-bottom:8px;">Sign in to Forge</div>
      <div style="font-size:14px;color:#6b6b88;margin-bottom:6px;line-height:1.5;">One question. Seven minds. One decision.</div>
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

/* ── Quick Answer Modal ───────────────────────────────────────────────────── */
document.getElementById('quickBtn').addEventListener('click', openQA);
async function openQA() {
  // Ensure session is restored before checking auth
  if (!Forge.isAuthenticated()) {
    await Forge.restoreSession();
  }
  if (!Forge.isAuthenticated()) { showAuthModal(); return; }
  document.getElementById('qaModal').classList.add('show');
}
function closeQA() { document.getElementById('qaModal').classList.remove('show'); }
window.closeQA = closeQA;

function renderQAList() {
  const el     = document.getElementById('qaList');
  const isAuth = Forge.isAuthenticated();
  el.innerHTML = Forge.PROVIDERS.map(p => {
    const isConn = extensionActive || !isAuth || connectedProviders.has(p.id);
    return `<div class="qa-row" onclick="goQuickChat('${p.id}')">
      <div class="qa-dot" style="background:${p.color}"></div>
      <span class="qa-name">${p.name}</span>
      <span class="qa-status${isConn ? ' ok' : ''}">${isConn ? '● Ready' : 'Not connected'}</span>
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
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    var EXT_IDS = ['niodlddcipfajmpinpemgbchpbojiepi','jjfinkdpgicfhcmackebkpbchpgpcjan'];
    var activeId = EXT_IDS[0];
    (function tryNext(i) {
      if (i >= EXT_IDS.length) return;
      chrome.runtime.sendMessage(EXT_IDS[i], { type: 'PING' }, function(r) {
        if (!chrome.runtime.lastError && r && r.ok) activeId = EXT_IDS[i];
      });
    })(0);
    chrome.runtime.sendMessage(
      activeId,
      { type: 'OPEN_PROVIDER', provider: id, prompt: '' }
    );
  } else {
    window.location.href = PROVIDER_URLS[id] || 'https://claude.ai/new';
  }
}
window.goQuickChat = goQuickChat;

/* ── Keyboard shortcut ────────────────────────────────────────────────────── */
document.getElementById('promptInput').addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') runCompare();
});
document.getElementById('compareBtn').addEventListener('click', runCompare);

/* ── Perspectives ──────────────────────────────────────────────────────────── */
async function runCompare() {
  if (!Forge.isAuthenticated()) { showAuthModal(); return; }
  const prompt = document.getElementById('promptInput').value.trim();
  if (!prompt)                      { Forge.showToast('Enter a prompt first.', 'warn'); return; }
  if (selectedProviders.size < 2)   { Forge.showToast('Select at least 2 providers.', 'warn'); return; }
  if (isRunning)                     return;

  isRunning = true;
  compareResults = {}; synthData = {};
  const models = [...selectedProviders];

  const section = document.getElementById('resultsSection');
  section.style.display = '';
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  document.getElementById('resultsHeading').textContent = '⟳ Incoming responses';
  document.getElementById('resultsSub').textContent     = `Collecting from ${models.length} AIs…`;
  document.getElementById('synthStrip').style.display   = 'none';
  document.getElementById('continueRow').style.display  = 'none';
  document.getElementById('progressFill').style.width   = '12%';

  renderLoadingCards(models);
  updateCounter();

  // Use extension if available (user's own sessions), otherwise fall back to API
  const extAvailable = await Forge.extension.isAvailable();
  let responses = {};

  if (extAvailable) {
    document.getElementById('resultsSub').textContent = `Using your AI subscriptions via Forge extension…`;
    const ext = await Forge.extension.sendPrompt(prompt, models);
    if (ext.ok) {
      responses = ext.responses;
    } else {
      Forge.showToast('Extension failed — falling back to Forge keys.', 'warn');
    }
  }

  // Fall back to backend API — SSE streaming for fast card rendering
  if (!extAvailable || Object.keys(responses).length === 0) {
    const streamUrl = (Forge.API_BASE || 'https://api.projectcoachai.com') + '/api/compare';
    let streamSuccess = false;
    try {
      const resp = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream',
                   'Authorization': `Bearer ${Forge.getToken?.() || ''}` },
        body: JSON.stringify({ prompt, models })
      });
      if (resp.ok && resp.headers.get('content-type')?.includes('text/event-stream')) {
        streamSuccess = true;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedCount = 0;
        renderLoadingCards(models);
        document.getElementById('resultsSection').style.display = '';
        document.getElementById('synthStrip').style.display = '';
        document.getElementById('synthSub').textContent = '\u29f3 Waiting for responses...';
        document.getElementById('continueRow').style.display = 'flex';
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
                document.getElementById('resultsHeading').textContent = `\u29f3 ${receivedCount} of ${models.length} responses received...`;
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
                document.getElementById('resultsHeading').textContent = `\u2705 ${ok} of ${models.length} responses ready`;
                document.getElementById('resultsSub').textContent = '';
                Forge.session.saveComparison({ prompt, responses: compareResults, models, timestamp: Date.now() });
                Forge.showToast(`${ok} response${ok !== 1 ? 's' : ''} received`, 'success');
                document.getElementById('promptInput').value = '';
                isRunning = false; updateCounter();
              }
            } catch(_) {}
          }
        }
      }
    } catch(streamErr) { console.warn('SSE failed, falling back:', streamErr.message); }

    if (!streamSuccess) {
      const r = await Forge.compare.run(prompt, models);
      if (!r.ok) { Forge.showToast(r.data?.error || 'Perspectives failed.', 'error'); isRunning = false; updateCounter(); return; }
      compareResults = r.data.responses || {};
      synthData = r.data;
      renderResultCards(models, compareResults);
      const ok = Object.values(compareResults).filter(v => v?.content).length;
      document.getElementById('progressFill').style.width = '100%';
      document.getElementById('resultsHeading').textContent = `\u2705 ${ok} of ${models.length} responses ready`;
      document.getElementById('resultsSub').textContent = '';
      document.getElementById('synthStrip').style.display = '';
      document.getElementById('synthSub').textContent = 'Responses synthesised into one decision-ready answer.';
      document.getElementById('continueRow').style.display = 'flex';
      showSynthesisStrip(r.data);
      Forge.session.saveComparison({ prompt, responses: compareResults, models, timestamp: Date.now() });
      Forge.showToast(`${ok} response${ok !== 1 ? 's' : ''} received`, 'success');
      document.getElementById('promptInput').value = '';
      isRunning = false; updateCounter();
    }
    return;
  }
  // Extension path — build results from captured responses
  document.getElementById('progressFill').style.width = '100%';
  compareResults = responses;
  synthData = { responses };

  renderResultCards(models, compareResults);

  const ok = Object.values(compareResults).filter(v => v?.content).length;
  document.getElementById('resultsHeading').textContent = `✅ ${ok} of ${models.length} responses ready`;
  document.getElementById('resultsSub').textContent = '';

  showSynthesisStrip({ responses: compareResults });

  Forge.session.saveComparison({ prompt, responses: compareResults, models, timestamp: Date.now() });
  Forge.showToast(`${ok} response${ok !== 1 ? 's' : ''} received via your subscriptions`, 'success');
  document.getElementById('promptInput').value = '';
  isRunning = false; updateCounter();
}

function renderLoadingCards(models) {
  document.getElementById('responsesGrid').innerHTML = models.map(id => {
    const p = Forge.getProvider(id);
    return `<div class="response-card">
      <div class="card-hdr">
        <div class="card-provider" style="color:${p.color}"><div class="card-dot"></div>${p.name}</div>
        <span class="card-badge badge-loading">Thinking…</span>
      </div>
      <div class="card-body empty">
        <div class="shimmer"></div><div class="shimmer"></div><div class="shimmer"></div><div class="shimmer"></div>
      </div>
    </div>`;
  }).join('');
}

function renderResultCards(models, results) {
  document.getElementById('responsesGrid').innerHTML = models.map((id, i) => {
    const p       = Forge.getProvider(id);
    const r       = results[id] || {};
    const ok      = r.content && !r.error;
    const preview = r.content ? r.content.slice(0, 300) + (r.content.length > 300 ? '…' : '') : '';
    const elapsed = r.elapsed ? `⏱ ${(r.elapsed / 1000).toFixed(1)}s` : '';
    return `<div class="response-card" style="animation-delay:${i * .05}s">
      <div class="card-hdr">
        <div class="card-provider" style="color:${p.color}"><div class="card-dot"></div>${p.name}</div>
        <span class="card-badge ${ok ? 'badge-done' : 'badge-error'}">${ok ? 'Received' : 'Failed'}</span>
      </div>
      <div class="card-body${ok ? '' : ' empty'}">
        ${ok
          ? `<div class="md">${Forge.renderMarkdown(preview)}</div>`
          : `<span style="color:#ef4444;font-size:13px;">⚠ ${r.error || 'No response'}</span>`}
      </div>
      ${ok ? `<div class="card-ftr">
        <span class="card-time">${elapsed}</span>
        <div class="card-actions">
          <button class="icon-btn" onclick="copyResp('${id}')">&#128203; Copy</button>
          <button class="icon-btn" onclick="expandResp('${id}')">⤢ Expand</button>
        </div>
      </div>` : `<div class="card-ftr"><button class="icon-btn" onclick="retryProvider('${id}')" style="color:#ff6b35">↺ Retry</button></div>`}
    </div>`;
  }).join('');
}

function retryProvider(id) {
  if (!lastPrompt) { Forge.showToast('No prompt to retry.', 'warn'); return; }
  compareResults[id] = null;
  updateCard(id, null);
  runSingleProvider(id, lastPrompt);
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
      .map(q => `<div class="followup-chip" onclick="refillPrompt(${JSON.stringify(q)})">${q.replace(/[#*`_~>]/g,'').trim()}</div>`).join('');
  }
  document.getElementById('continueRow').style.display = 'flex';
}

function refillPrompt(q) {
  document.getElementById('promptInput').value = q;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('promptInput').focus();
}
window.refillPrompt = refillPrompt;
function submitFollowup() {
  const input = document.getElementById('followupInput');
  const q = input?.value?.trim();
  if (!q) return;
  input.value = '';
  document.getElementById('promptInput').value = q;
  Forge.showToast('Running follow-up with all AIs...', 'success');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => runCompare(), 300);
}
window.submitFollowup = submitFollowup;

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

function expandResp(id) {
  const r = compareResults[id]; const p = Forge.getProvider(id);
  if (!r?.content) return;
  const w = window.open('', '_blank', 'width=720,height=640');
  w.document.write(`<!DOCTYPE html><html><head><title>${p.name}</title>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400&display=swap" rel="stylesheet"/>
  <style>body{background:#0a0a0f;color:#e8e8f0;font-family:'DM Sans',sans-serif;padding:32px;line-height:1.75;max-width:680px;margin:0 auto;}
  h1,h2,h3{font-family:'Syne',sans-serif;font-weight:700;margin:.8em 0 .3em;}
  code{background:rgba(255,255,255,.08);padding:2px 5px;border-radius:4px;}pre{background:rgba(255,255,255,.04);padding:14px;border-radius:8px;overflow:auto;}
  strong{font-weight:600;}ul,ol{padding-left:1.4em;margin-bottom:.8em;}li{margin-bottom:.3em;}
  .provider{color:${p.color};font-family:'Syne',sans-serif;font-weight:800;font-size:18px;margin-bottom:20px;}
  </style></head><body><div class="provider">⬤ ${p.name}</div>${Forge.renderMarkdown(r.content)}</body></html>`);
}
window.expandResp = expandResp;

// ── Provider Login Popup ──────────────────────────────────────────────────────
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
    Forge.showToast('Popup blocked — please allow popups for this site.', 'warn');
    return;
  }

  Forge.showToast(`Sign in to ${p?.name || providerId} in the popup window…`, 'info', 6000);

  // Poll for popup close — when user closes it, refresh connection status
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


// ── Provider Picker (Add Tool panel) ─────────────────────────────────────────
let pickerOpen = false;

function togglePicker() {
  const panel = document.getElementById('providerPicker');
  const btn   = document.getElementById('addToolBtn');
  pickerOpen  = !pickerOpen;
  if (pickerOpen) {
    renderPicker();
    panel.style.display = '';
    btn.textContent = '✕ Close';
  } else {
    panel.style.display = 'none';
    btn.textContent = '+ Add tool';
  }
}
window.togglePicker = togglePicker;

function renderPicker() {
  const panel = document.getElementById('providerPicker');
  const isAuth = Forge.isAuthenticated();

  const items = Forge.PROVIDERS.map(p => {
    const isSelected = selectedProviders.has(p.id);
    const isSoon = !['claude','chatgpt','gemini','mistral','deepseek','perplexity','grok'].includes(p.id);
    if (isSoon) {
      return `<div class="picker-item picker-soon" style="color:${p.color}">
        <span class="picker-dot"></span>${p.name}
        <span class="picker-soon-badge">Soon</span>
      </div>`;
    }
    return `<div class="picker-item${isSelected ? ' picker-active' : ''}"
      style="color:${p.color}" onclick="pickerToggle('${p.id}')">
      <span class="picker-dot"></span>${p.name}
      ${isSelected ? '<span style="margin-left:auto;font-size:11px;opacity:.7">✓ On</span>' : ''}
    </div>`;
  }).join('');

  const footer = isAuth
    ? `<div class="picker-footer">Powered by Forge. <a href="/profile.html#connections">Use your own keys →</a></div>`
    : `<div class="picker-footer">Powered by Forge. <a href="/register.html">Sign up free →</a></div>`;

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

