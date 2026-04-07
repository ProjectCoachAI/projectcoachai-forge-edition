// Forge Extension — Popup

const PROVIDERS = [
  { id: 'claude',      name: 'Claude',      color: '#d97706', url: 'https://claude.ai' },
  { id: 'chatgpt',    name: 'ChatGPT',     color: '#10b981', url: 'https://chatgpt.com' },
  { id: 'gemini',     name: 'Gemini',      color: '#3b82f6', url: 'https://gemini.google.com' },
  { id: 'perplexity', name: 'Perplexity',  color: '#14b8a6', url: 'https://www.perplexity.ai' },
  { id: 'deepseek',   name: 'DeepSeek',    color: '#6366f1', url: 'https://chat.deepseek.com' },
  { id: 'mistral',    name: 'Mistral',     color: '#f59e0b', url: 'https://chat.mistral.ai' },
  { id: 'grok',       name: 'Grok',        color: '#ec4899', url: 'https://x.ai' },
];

const FORGE_URL = 'http://localhost:8080';

async function render() {
  let status = {};
  try {
    const r = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, resolve);
    });
    status = r?.status || {};
  } catch (_) {}

  const list = document.getElementById('providerList');
  list.innerHTML = PROVIDERS.map(p => {
    const s = status[p.id];
    const isConnected = s === 'connected';
    const isReady     = s === 'not_ready' || s === 'no_tab' ? false : true;
    const label = isConnected  ? '✓ Signed in' :
                  s === 'login_required' ? 'Sign in needed' :
                  s === 'not_ready'      ? 'Open tab' :
                  'Open tab';
    const cls   = isConnected ? 'connected' : s === 'login_required' ? 'needed' : 'waiting';

    return `<div class="row">
      <div class="provider">
        <div class="dot" style="background:${p.color}"></div>
        ${p.name}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="status ${cls}">${label}</span>
        <button class="open-btn" data-url="${p.url}">Open</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.open-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chrome.tabs.create({ url: btn.dataset.url });
      window.close();
    });
  });
}

document.getElementById('openForge').addEventListener('click', () => {
  chrome.tabs.create({ url: FORGE_URL });
  window.close();
});

document.getElementById('refreshBtn').addEventListener('click', render);

render();
