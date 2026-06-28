// Diary Extension — Dock UI
(function() {
  if (document.getElementById('diary-dock')) return;

  var DIARY_URL = 'https://diary.projectcoachai.com';

  var PROVIDERS = [
    { id: 'claude',     name: 'Claude',     color: '#C17D3C', url: 'https://claude.ai/new' },
    { id: 'chatgpt',   name: 'ChatGPT',    color: '#10A37F', url: 'https://chatgpt.com' },
    { id: 'gemini',    name: 'Gemini',     color: '#4A8EF4', url: 'https://gemini.google.com' },
    { id: 'perplexity',name: 'Perplexity', color: '#20B2AA', url: 'https://www.perplexity.ai' },
    { id: 'grok',      name: 'Grok',       color: '#888',    url: 'https://grok.com' },
    { id: 'deepseek',  name: 'DeepSeek',   color: '#4169E1', url: 'https://chat.deepseek.com' },
    { id: 'mistral',   name: 'Mistral',    color: '#FF7000', url: 'https://chat.mistral.ai' },
    { id: 'meta',      name: 'Meta AI',    color: '#0668E1', url: 'https://www.meta.ai' },
  ];

  var CURRENT = (function() {
    var h = location.hostname;
    if (h.includes('claude.ai'))      return 'claude';
    if (h.includes('chatgpt.com'))    return 'chatgpt';
    if (h.includes('gemini.google'))  return 'gemini';
    if (h.includes('perplexity.ai')) return 'perplexity';
    if (h.includes('grok.com'))       return 'grok';
    if (h.includes('deepseek.com'))   return 'deepseek';
    if (h.includes('mistral.ai'))     return 'mistral';
    if (h.includes('meta.ai'))        return 'meta';
    return null;
  })();

  // ── Styles ──────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = `
    #diary-dock { position:fixed; right:0; top:50%; transform:translateY(-50%); z-index:2147483640; display:flex; align-items:center; pointer-events:none; }
    #diary-tab { pointer-events:all; width:40px; height:72px; background:#1B2A4A; border:1px solid rgba(193,125,60,0.4); border-right:none; border-radius:12px 0 0 12px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; cursor:pointer; box-shadow:-4px 0 20px rgba(27,42,74,0.25); user-select:none; }
    #diary-tab:hover { background:#243A63; }
    #diary-mark { width:26px; height:26px; background:#1B2A4A; border:1.5px solid #C17D3C; border-radius:7px; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px; color:#F5F3EE; font-family:Georgia,serif; }
    #diary-toggle-btn { width:22px; height:22px; border-radius:5px; background:rgba(193,125,60,0.15); border:1px solid rgba(193,125,60,0.4); display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px; transition:background 0.2s; }
    #diary-toggle-btn:hover { background:rgba(193,125,60,0.3); }
    #diary-panel { pointer-events:all; position:absolute; right:40px; top:50%; transform:translateY(-50%) scaleX(0); transform-origin:right center; width:0; opacity:0; overflow:hidden; background:#fff; border:1px solid #D6D2C8; border-right:none; border-radius:12px 0 0 12px; box-shadow:-8px 0 32px rgba(27,42,74,0.12); transition:transform 0.25s cubic-bezier(.4,0,.2,1), opacity 0.2s, width 0.25s cubic-bezier(.4,0,.2,1); white-space:nowrap; }
    #diary-panel.open { width:auto; min-width:260px; opacity:1; transform:translateY(-50%) scaleX(1); overflow:visible; }
    #diary-panel-inner { padding:14px 16px; display:flex; flex-direction:column; gap:10px; font-family:system-ui,sans-serif; }
    .dp-header { display:flex; align-items:center; justify-content:space-between; }
    .dp-brand { font-size:15px; font-weight:600; color:#1B2A4A; font-family:Georgia,serif; }
    .dp-brand span { color:#C17D3C; }
    .dp-close { background:none; border:1px solid #D6D2C8; border-radius:50%; width:22px; height:22px; cursor:pointer; font-size:13px; color:#9E9890; display:flex; align-items:center; justify-content:center; }
    .dp-close:hover { border-color:#1B2A4A; color:#1B2A4A; }
    .dp-label { font-size:9px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:#9E9890; }
    .dp-chips { display:flex; flex-wrap:wrap; gap:5px; }
    .dp-chip { display:flex; align-items:center; gap:4px; background:#fff; border:1px solid #D6D2C8; border-radius:20px; padding:4px 9px; font-size:11px; color:#1B2A4A; cursor:pointer; transition:all 0.15s; }
    .dp-chip:hover { border-color:#C17D3C; }
    .dp-chip.active { background:#F5F3EE; border-color:#C17D3C; }
    .dp-dot { width:6px; height:6px; border-radius:50%; display:inline-block; flex-shrink:0; }
    .dp-actions { display:flex; gap:6px; }
    .dp-btn-primary { flex:1; padding:8px 12px; background:#1B2A4A; color:#F5F3EE; border:none; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; text-align:center; text-decoration:none; display:flex; align-items:center; justify-content:center; transition:background 0.2s; }
    .dp-btn-primary:hover { background:#243A63; }
    .dp-btn-secondary { padding:8px 12px; background:transparent; color:#6B6559; border:1px solid #D6D2C8; border-radius:8px; font-size:12px; cursor:pointer; text-decoration:none; white-space:nowrap; transition:all 0.15s; }
    .dp-btn-secondary:hover { border-color:#1B2A4A; color:#1B2A4A; }
    .dp-footer { font-size:10px; color:#9E9890; text-align:center; }
    .dp-footer a { color:#C17D3C; text-decoration:none; }
  `;
  document.head.appendChild(style);

  // ── HTML ────────────────────────────────────────────────────────
  var dock = document.createElement('div');
  dock.id = 'diary-dock';

  // Tab
  var tab = document.createElement('div');
  tab.id = 'diary-tab';
  tab.innerHTML = '<div id="diary-mark">D</div><div id="diary-toggle-btn" title="Open Diary">\uD83D\uDCD4</div>';

  // Toggle click
  tab.querySelector('#diary-toggle-btn').onclick = function(e) {
    e.stopPropagation();
    window.open(DIARY_URL + '/index.html', '_blank');
  };

  // Panel
  var panel = document.createElement('div');
  panel.id = 'diary-panel';

  var inner = document.createElement('div');
  inner.id = 'diary-panel-inner';

  // Header
  inner.innerHTML = `
    <div class="dp-header">
      <div class="dp-brand">Diary<span>.</span></div>
      <button class="dp-close" onclick="document.getElementById('diary-panel').classList.remove('open');">&times;</button>
    </div>
    <div class="dp-label">Switch AI</div>
    <div class="dp-chips" id="dp-chips"></div>
    <div class="dp-actions">
      <a href="${DIARY_URL}/index.html" target="_blank" class="dp-btn-primary">\uD83D\uDCD4 Diary</a>
      <a href="${DIARY_URL}/chat.html" target="_blank" class="dp-btn-secondary">\u26A1 Chat</a>
    </div>
    <div class="dp-footer"><a href="${DIARY_URL}" target="_blank">diary.projectcoachai.com</a></div>
  `;

  panel.appendChild(inner);
  dock.appendChild(tab);
  dock.appendChild(panel);
  document.body.appendChild(dock);

  // Populate chips
  var chipsEl = document.getElementById('dp-chips');
  PROVIDERS.forEach(function(p) {
    var chip = document.createElement('div');
    chip.className = 'dp-chip' + (p.id === CURRENT ? ' active' : '');
    chip.innerHTML = '<span class="dp-dot" style="background:' + p.color + '"></span>' + p.name;
    chip.onclick = function() { if (p.id !== CURRENT) window.location.href = p.url; };
    chipsEl.appendChild(chip);
  });

  // Toggle panel
  var isOpen = false;
  var autoClose;
  tab.querySelector('#diary-mark').onclick = function() {
    isOpen = !isOpen;
    if (isOpen) {
      panel.classList.add('open');
      clearTimeout(autoClose);
      autoClose = setTimeout(function() { panel.classList.remove('open'); isOpen = false; }, 5000);
    } else {
      panel.classList.remove('open');
    }
  };
  panel.onmouseenter = function() { clearTimeout(autoClose); };
  panel.onmouseleave = function() { autoClose = setTimeout(function() { panel.classList.remove('open'); isOpen = false; }, 1500); };

  // Diary toggle below dock
  var toggle = document.createElement('div');
  toggle.style.cssText = 'position:fixed;right:0;top:calc(50% + 76px);width:40px;height:36px;background:#1B2A4A;border:1px solid rgba(193,125,60,0.4);border-right:none;border-radius:8px 0 0 8px;display:flex;align-items:center;justify-content:center;font-size:15px;cursor:pointer;z-index:2147483641;transition:all 0.2s;';
  toggle.title = 'My Diary';
  toggle.textContent = '\uD83D\uDCD4';
  toggle.onmouseenter = function() { this.style.background = 'rgba(193,125,60,0.2)'; };
  toggle.onmouseleave = function() { this.style.background = '#1B2A4A'; };
  toggle.onclick = function() { window.open(DIARY_URL + '/app.html', '_blank'); };
  document.body.appendChild(toggle);

})();
