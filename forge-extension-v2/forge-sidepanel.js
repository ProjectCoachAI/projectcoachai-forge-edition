const PROVIDERS = [
  { id: 'claude',     label: 'Claude',     color: '#d97706', url: 'https://claude.ai/new' },
  { id: 'chatgpt',   label: 'ChatGPT',    color: '#10a37f', url: 'https://chatgpt.com' },
  { id: 'gemini',    label: 'Gemini',     color: '#4285f4', url: 'https://gemini.google.com' },
  { id: 'mistral',   label: 'Mistral',    color: '#f59e0b', url: 'https://chat.mistral.ai' },
  { id: 'deepseek',  label: 'DeepSeek',   color: '#6366f1', url: 'https://chat.deepseek.com' },
  { id: 'perplexity',label: 'Perplexity', color: '#22c55e', url: 'https://www.perplexity.ai' },
  { id: 'grok',      label: 'Grok',       color: '#ec4899', url: 'https://grok.com' }
];

let selectedProvider = null;
let lastResponse = {};
let lastPrompt = {};
let history = []; // accumulated Q&A pairs per session

// Render provider chips
const chipsEl = document.getElementById('spProviders');
PROVIDERS.forEach(p => {
  const chip = document.createElement('button');
  chip.className = 'sp-chip';
  chip.style.setProperty('--c', p.color);
  chip.dataset.id = p.id;
  const dot = document.createElement('span');
  dot.className = 'sp-chip-dot';
  dot.style.background = p.color;
  chip.appendChild(dot);
  chip.appendChild(document.createTextNode(p.label));
  chip.addEventListener('click', () => selectProvider(p));
  chipsEl.appendChild(chip);
});

function selectProvider(p) {
  selectedProvider = p;
  document.querySelectorAll('.sp-chip').forEach(c => c.classList.remove('active'));
  const chip = document.querySelector(`.sp-chip[data-id="${p.id}"]`);
  if (chip) chip.classList.add('active');
  document.getElementById('spStatus').textContent = `Connected to ${p.label}`;
  // If history is empty and no response cached, show empty state
  if (history.length === 0 && !lastResponse[p.id]) {
    const resp = document.getElementById('spResponse');
    resp.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'sp-empty';
    const dot = document.createElement('div');
    dot.className = 'sp-empty-icon';
    dot.style.color = p.color;
    dot.textContent = '◎';
    const txt = document.createElement('div');
    txt.className = 'sp-empty-text';
    txt.textContent = `Ask ${p.label} anything — your conversation history will appear here.`;
    empty.appendChild(dot);
    empty.appendChild(txt);
    resp.appendChild(empty);
  }
}

function addToHistory(p, text, prompt) {
  history.push({ provider: p, text, prompt, time: new Date() });
  renderHistory();
}

function renderHistory() {
  const resp = document.getElementById('spResponse');
  resp.innerHTML = '';
  history.forEach(item => {
    const wrap = document.createElement('div');
    wrap.className = 'sp-history-item';

    // Question bubble
    if (item.prompt) {
      const q = document.createElement('div');
      q.className = 'sp-question';
      q.style.setProperty('--q-color', item.provider.color);
      q.textContent = item.prompt;
      wrap.appendChild(q);
    }

    // Provider label
    const label = document.createElement('div');
    label.className = 'sp-provider-label';
    const dot = document.createElement('span');
    dot.className = 'sp-provider-dot';
    dot.style.background = item.provider.color;
    const name = document.createElement('span');
    name.style.color = item.provider.color;
    name.textContent = item.provider.label;
    label.appendChild(dot);
    label.appendChild(name);
    wrap.appendChild(label);

    // Response text
    const textEl = document.createElement('div');
    textEl.className = 'sp-response-text';
    textEl.textContent = item.text.replace(/^\d+\n/, '').trim();
    wrap.appendChild(textEl);

    // Trust strip
    const trust = document.createElement('div');
    trust.className = 'sp-trust';
    const tdot = document.createElement('span');
    tdot.className = 'sp-trust-dot';
    tdot.style.background = item.provider.color;
    const ttime = item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    trust.appendChild(tdot);
    trust.appendChild(document.createTextNode(`Answered via Forge · ${item.provider.label} · ${ttime}`));
    wrap.appendChild(trust);

    resp.appendChild(wrap);
  });
  // Scroll to bottom so latest answer is visible
  resp.scrollTop = resp.scrollHeight;
}

function showResponse(p, text, prompt) {
  // For backward compat — adds to history
  addToHistory(p, text, prompt);
}

// Listen for captured responses from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FORGE_TO_PAGE' && msg.data?.type === 'RESPONSE_CAPTURED') {
    const { provider, response } = msg.data;
    lastResponse[provider] = response;
    if (selectedProvider?.id === provider) {
      showResponse(selectedProvider, response, lastPrompt[provider]);
      document.getElementById('spStatus').textContent = `${selectedProvider.label} responded · just now`;
    }
  }
});

// Send button
document.getElementById('spSend').addEventListener('click', sendPrompt);
document.getElementById('spInput').addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendPrompt();
});

const API_BASE = 'https://api.projectcoachai.com';

function sendPrompt() {
  if (!selectedProvider) {
    document.getElementById('spStatus').textContent = 'Select a provider first';
    return;
  }
  const prompt = document.getElementById('spInput').value.trim();
  if (!prompt) return;
  lastPrompt[selectedProvider.id] = prompt;

  document.getElementById('spSend').disabled = true;
  document.getElementById('spStatus').textContent = `Asking ${selectedProvider.label}...`;

  const resp = document.getElementById('spResponse');
  resp.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'sp-empty';
  const icon = document.createElement('div');
  icon.className = 'sp-empty-icon';
  icon.style.color = selectedProvider.color;
  icon.textContent = '⟳';
  const txt = document.createElement('div');
  txt.className = 'sp-empty-text';
  txt.textContent = `Waiting for ${selectedProvider.label}...`;
  empty.appendChild(icon);
  empty.appendChild(txt);
  resp.appendChild(empty);

  fetch(`${API_BASE}/api/split`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, provider: selectedProvider.id })
  })
  .then(r => r.json())
  .then(data => {
    document.getElementById('spSend').disabled = false;
    if (data.success) {
      lastResponse[selectedProvider.id] = data.content;
      showResponse(selectedProvider, data.content, prompt);
      document.getElementById('spStatus').textContent = `${selectedProvider.label} responded`;
    } else if (data.fallback) {
      // Provider API not configured — show helpful message
      document.getElementById('spStatus').textContent = `${selectedProvider.label} · using tab capture`;
      const resp = document.getElementById('spResponse');
      resp.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'sp-empty';
      empty.innerHTML = `<div class="sp-empty-icon" style="color:${selectedProvider.color}">●</div><div class="sp-empty-text">${data.error}</div>`;
      resp.appendChild(empty);
      // Still dispatch to the tab so capture picks it up
      chrome.runtime.sendMessage({ type: 'SEND_PROMPT', prompt, providers: [selectedProvider.id] });
    } else {
      document.getElementById('spStatus').textContent = `Error: ${data.error}`;
      document.getElementById('spSend').disabled = false;
    }
  })
  .catch(err => {
    document.getElementById('spSend').disabled = false;
    document.getElementById('spStatus').textContent = `Request failed: ${err.message}`;
  });
}
