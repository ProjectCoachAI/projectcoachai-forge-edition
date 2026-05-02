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
  if (lastResponse[p.id]) {
    showResponse(p, lastResponse[p.id], lastPrompt[p.id]);
  } else {
    const resp = document.getElementById('spResponse');
    resp.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'sp-empty';
    empty.innerHTML = `<div class="sp-empty-icon" style="color:${p.color}">●</div><div class="sp-empty-text">Ask ${p.label} a question below, or switch to its tab to capture a response automatically.</div>`;
    resp.appendChild(empty);
  }
}

function showResponse(p, text, prompt) {
  const resp = document.getElementById('spResponse');
  resp.innerHTML = '';

  // Show the prompt that was asked
  if (prompt) {
    const q = document.createElement('div');
    q.style.cssText = 'font-size:12px;font-weight:700;color:#e8e8f0;margin-bottom:12px;padding:8px 10px;background:#1a1a2e;border-radius:6px;border-left:3px solid ' + p.color;
    q.textContent = prompt;
    resp.appendChild(q);
  }

  const label = document.createElement('div');
  label.className = 'sp-provider-label';
  const dot = document.createElement('span');
  dot.className = 'sp-provider-dot';
  dot.style.background = p.color;
  const name = document.createElement('span');
  name.style.color = p.color;
  name.textContent = p.label;
  label.appendChild(dot);
  label.appendChild(name);
  const textEl = document.createElement('div');
  textEl.className = 'sp-response-text';
  // Clean up stray leading numbers/chars
  textEl.textContent = text.replace(/^\d+\n/, '').trim();
  resp.appendChild(label);
  resp.appendChild(textEl);
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
    if (data.success && data.content) {
      lastResponse[selectedProvider.id] = data.content;
      showResponse(selectedProvider, data.content, prompt);
      document.getElementById('spStatus').textContent = `${selectedProvider.label} responded`;
    } else {
      document.getElementById('spStatus').textContent = `Error: ${data.error || 'No response received'}`;
    }
  })
  .catch(err => {
    document.getElementById('spSend').disabled = false;
    document.getElementById('spStatus').textContent = `Request failed: ${err.message}`;
  });
}
