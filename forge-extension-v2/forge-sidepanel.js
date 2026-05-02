const PROVIDERS = [
  { id: 'claude',     label: 'Claude',     color: '#d97706', url: 'https://claude.ai/new' },
  { id: 'chatgpt',   label: 'ChatGPT',    color: '#10a37f', url: 'https://chatgpt.com' },
  { id: 'gemini',    label: 'Gemini',     color: '#4285f4', url: 'https://gemini.google.com' },
  { id: 'mistral',   label: 'Mistral',    color: '#f59e0b', url: 'https://chat.mistral.ai' },
  { id: 'deepseek',  label: 'DeepSeek',   color: '#6366f1', url: 'https://chat.deepseek.com' },
  { id: 'perplexity',label: 'Perplexity', color: '#22c55e', url: 'https://www.perplexity.ai' },
  { id: 'grok',      label: 'Grok',       color: '#ec4899', url: 'https://grok.com' }
];

const API_BASE = 'https://api.projectcoachai.com';
let selectedProvider = null;
let lastResponse = {};
let lastPrompt = {};
let history = [];

// Chips
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
  const chip = document.querySelector('.sp-chip[data-id="' + p.id + '"]');
  if (chip) chip.classList.add('active');
  document.getElementById('spStatus').textContent = 'Connected to ' + p.label;
  if (history.length === 0) showEmpty(p);
}

function showEmpty(p) {
  const resp = document.getElementById('spResponse');
  resp.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'sp-empty';
  const icon = document.createElement('div');
  icon.className = 'sp-empty-icon';
  icon.style.color = p ? p.color : '#f97316';
  icon.textContent = '◎';
  const txt = document.createElement('div');
  txt.className = 'sp-empty-text';
  txt.textContent = p ? ('Ask ' + p.label + ' anything — your conversation history will appear here.') : 'Select an AI above to get started.';
  empty.appendChild(icon);
  empty.appendChild(txt);
  resp.appendChild(empty);
}

function renderMarkdown(text) {
  const el = document.createElement('div');
  el.className = 'sp-response-text';
  const lines = text.replace(/^\d+\n/, '').trim().split('\n');
  let html = '', inList = false;
  lines.forEach(line => {
    if (/^#{1,3}\s/.test(line)) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<h3>' + line.replace(/^#{1,3}\s/, '') + '</h3>';
    } else if (/^[\-\*]\s/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + line.replace(/^[\-\*]\s/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</li>';
    } else if (/^\d+\.\s/.test(line)) {
      if (!inList) { html += '<ol>'; inList = true; }
      html += '<li>' + line.replace(/^\d+\.\s/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</li>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      if (line.trim()) html += '<p>' + line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') + '</p>';
    }
  });
  if (inList) html += '</ul>';
  el.innerHTML = html;
  return el;
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
    if (item.prompt) {
      const q = document.createElement('div');
      q.className = 'sp-question';
      q.style.setProperty('--q-color', item.provider.color);
      q.textContent = item.prompt;
      wrap.appendChild(q);
    }
    const lbl = document.createElement('div');
    lbl.className = 'sp-provider-label';
    const d = document.createElement('span');
    d.className = 'sp-provider-dot';
    d.style.background = item.provider.color;
    const n = document.createElement('span');
    n.style.color = item.provider.color;
    n.textContent = item.provider.label;
    lbl.appendChild(d); lbl.appendChild(n);
    wrap.appendChild(lbl);
    wrap.appendChild(renderMarkdown(item.text));
    const trust = document.createElement('div');
    trust.className = 'sp-trust';
    const tdot = document.createElement('span');
    tdot.className = 'sp-trust-dot';
    tdot.style.background = item.provider.color;
    const ttime = item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    trust.appendChild(tdot);
    trust.appendChild(document.createTextNode('Answered via Forge · ' + item.provider.label + ' · ' + ttime));
    wrap.appendChild(trust);
    resp.appendChild(wrap);
  });
  resp.scrollTop = resp.scrollHeight;
}

function showResponse(p, text, prompt) {
  addToHistory(p, text, prompt);
}

// Clear
document.getElementById('spClear').addEventListener('click', () => {
  history.length = 0;
  lastResponse = {};
  lastPrompt = {};
  showEmpty(selectedProvider);
  document.getElementById('spStatus').textContent = 'Session cleared';
});

// Background capture
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FORGE_TO_PAGE' && msg.data && msg.data.type === 'RESPONSE_CAPTURED') {
    const { provider, response } = msg.data;
    lastResponse[provider] = response;
    if (selectedProvider && selectedProvider.id === provider) {
      showResponse(selectedProvider, response, lastPrompt[provider]);
      document.getElementById('spStatus').textContent = selectedProvider.label + ' responded · just now';
    }
  }
});

// Send
document.getElementById('spSend').addEventListener('click', sendPrompt);
document.getElementById('spInput').addEventListener('keydown', function(e) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendPrompt();
});

function sendPrompt() {
  if (!selectedProvider) { document.getElementById('spStatus').textContent = 'Select a provider first'; return; }
  const prompt = document.getElementById('spInput').value.trim();
  if (!prompt) return;
  lastPrompt[selectedProvider.id] = prompt;
  document.getElementById('spSend').disabled = true;
  document.getElementById('spStatus').textContent = 'Asking ' + selectedProvider.label + '...';

  fetch(API_BASE + '/api/split', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: prompt, provider: selectedProvider.id })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    document.getElementById('spSend').disabled = false;
    if (data.success && data.content) {
      lastResponse[selectedProvider.id] = data.content;
      showResponse(selectedProvider, data.content, prompt);
      document.getElementById('spStatus').textContent = selectedProvider.label + ' responded';
    } else {
      document.getElementById('spStatus').textContent = 'Error: ' + (data.error || 'No response received');
    }
  })
  .catch(function(err) {
    document.getElementById('spSend').disabled = false;
    document.getElementById('spStatus').textContent = 'Request failed: ' + err.message;
  });
}
