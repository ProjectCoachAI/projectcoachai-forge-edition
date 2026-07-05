// Diary Extension — Dock UI
(function() {
  if (document.getElementById('diary-dock')) return;

  var _diaryForgeDetected = false;

  // Listen for signal from diary-isolated.js that Forge bridge was found
  window.addEventListener('message', function(e) {
    if (e.data && (e.data.type === '__FORGE_ACTIVE_ON_PAGE__' || e.data.type === '__FORGE_EXT_PRESENT__')) {
      _diaryForgeDetected = true;
      // Remove Diary dock if already injected
      var dock = document.getElementById('diary-dock');
      if (dock) dock.remove();
    }
  }, true);

  // Also ask Forge to identify itself directly
  window.postMessage({ type: '__FORGE_EXT_CHECK__' }, '*');

  var _diaryCheckCount = 0;
  function _diaryCheckForge() {
    if (_diaryForgeDetected ||
        document.getElementById('forge-dock') ||
        document.getElementById('__forge_bridge__')) return;
    if (_diaryCheckCount < 15) {
      _diaryCheckCount++;
      setTimeout(_diaryCheckForge, 200);
      return;
    }
    _diaryInjectDock();
  }
  setTimeout(_diaryCheckForge, 300);
  return;

  function _diaryInjectDock() {
  if (document.getElementById('diary-dock')) return;
  if (_diaryForgeDetected) return;

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
    if (h.includes('perplexity.ai'))  return 'perplexity';
    if (h.includes('grok.com'))       return 'grok';
    if (h.includes('deepseek.com'))   return 'deepseek';
    if (h.includes('mistral.ai'))     return 'mistral';
    if (h.includes('meta.ai'))        return 'meta';
    return null;
  })();

  var style = document.createElement('style');
  style.textContent = [
    '#diary-dock{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483640;display:flex;align-items:center;pointer-events:none;}',
    '#diary-tab{pointer-events:all;width:40px;height:72px;background:#1B2A4A;border:1px solid rgba(193,125,60,0.4);border-right:none;border-radius:12px 0 0 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;box-shadow:-4px 0 20px rgba(27,42,74,0.25);user-select:none;}',
    '#diary-tab:hover{background:#243A63;}',
    '#diary-mark{width:26px;height:26px;background:#1B2A4A;border:1.5px solid #C17D3C;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#F5F3EE;font-family:Georgia,serif;pointer-events:none;}',
    '#diary-toggle-btn{width:26px;height:26px;border-radius:5px;background:rgba(193,125,60,0.15);border:1px solid rgba(193,125,60,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;pointer-events:all;}',
    '#diary-toggle-btn:hover{background:rgba(193,125,60,0.4);}',
    '#diary-panel{pointer-events:all;position:absolute;right:40px;top:50%;transform:translateY(-50%) scaleX(0);transform-origin:right center;width:0;opacity:0;overflow:hidden;background:#fff;border:1px solid #D6D2C8;border-right:none;border-radius:12px 0 0 12px;box-shadow:-8px 0 32px rgba(27,42,74,0.12);transition:transform 0.25s,opacity 0.2s,width 0.25s;white-space:nowrap;}',
    '#diary-panel.open{width:auto;min-width:260px;opacity:1;transform:translateY(-50%) scaleX(1);overflow:visible;}',
    '#diary-panel-inner{padding:14px 16px;display:flex;flex-direction:column;gap:10px;font-family:system-ui,sans-serif;}',
    '.dp-header{display:flex;align-items:center;justify-content:space-between;}',
    '.dp-brand{font-size:15px;font-weight:600;color:#1B2A4A;font-family:Georgia,serif;}',
    '.dp-close{background:none;border:1px solid #D6D2C8;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:13px;color:#9E9890;display:flex;align-items:center;justify-content:center;}',
    '.dp-close:hover{border-color:#1B2A4A;color:#1B2A4A;}',
    '.dp-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9E9890;}',
    '.dp-chips{display:flex;flex-wrap:wrap;gap:5px;}',
    '.dp-chip{display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #D6D2C8;border-radius:20px;padding:4px 9px;font-size:11px;color:#1B2A4A;cursor:pointer;}',
    '.dp-chip:hover{border-color:#C17D3C;}',
    '.dp-chip.active{background:#F5F3EE;border-color:#C17D3C;}',
    '.dp-dot{width:6px;height:6px;border-radius:50%;display:inline-block;flex-shrink:0;}',
    '.dp-actions{display:flex;gap:6px;}',
    '.dp-btn-primary{flex:1;padding:8px 12px;background:#1B2A4A;color:#F5F3EE;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;}',
    '.dp-btn-primary:hover{background:#243A63;}',
    '.dp-btn-secondary{padding:8px 12px;background:transparent;color:#6B6559;border:1px solid #D6D2C8;border-radius:8px;font-size:12px;cursor:pointer;text-decoration:none;white-space:nowrap;}',
    '.dp-btn-secondary:hover{border-color:#1B2A4A;color:#1B2A4A;}',
    '.dp-footer{font-size:10px;color:#9E9890;text-align:center;}',
    '.dp-footer a{color:#C17D3C;text-decoration:none;}'
  ].join('');
  document.head.appendChild(style);

  var isOpen = false;
  var autoClose;

  var dock = document.createElement('div');
  dock.id = 'diary-dock';

  // Tab — entire tab is clickable for panel
  var tab = document.createElement('div');
  tab.id = 'diary-tab';

  var mark = document.createElement('div');
  mark.id = 'diary-mark';
  mark.textContent = 'D';

  // Toggle button — opens My Diary directly
  var toggleBtn = document.createElement('div');
  toggleBtn.id = 'diary-toggle-btn';
  toggleBtn.title = 'My Diary';
  toggleBtn.textContent = '\uD83D\uDCD4';

  tab.appendChild(mark);
  tab.appendChild(toggleBtn);

  var panel = document.createElement('div');
  panel.id = 'diary-panel';

  var inner = document.createElement('div');
  inner.id = 'diary-panel-inner';

  var hdr = document.createElement('div'); hdr.className = 'dp-header';
  var brand = document.createElement('div'); brand.className = 'dp-brand';
  brand.textContent = 'Diary.';
  var closeBtn = document.createElement('button'); closeBtn.className = 'dp-close';
  closeBtn.textContent = 'x';
  hdr.appendChild(brand); hdr.appendChild(closeBtn);

  var lbl = document.createElement('div'); lbl.className = 'dp-label';
  lbl.textContent = 'Switch AI';

  var chipsWrap = document.createElement('div'); chipsWrap.className = 'dp-chips';

  var actWrap = document.createElement('div'); actWrap.className = 'dp-actions';
  var diaryBtn = document.createElement('a');
  diaryBtn.href = DIARY_URL + '/index.html';
  diaryBtn.target = '_blank';
  diaryBtn.className = 'dp-btn-primary';
  diaryBtn.textContent = 'Diary';
  var chatBtn = document.createElement('a');
  chatBtn.href = DIARY_URL + '/chat.html';
  chatBtn.target = '_blank';
  chatBtn.className = 'dp-btn-secondary';
  chatBtn.textContent = 'Chat';
  actWrap.appendChild(diaryBtn);
  actWrap.appendChild(chatBtn);

  var ftr = document.createElement('div'); ftr.className = 'dp-footer';
  var ftrLink = document.createElement('a');
  ftrLink.href = DIARY_URL;
  ftrLink.target = '_blank';
  ftrLink.textContent = 'diary.projectcoachai.com';
  ftr.appendChild(ftrLink);

  inner.appendChild(hdr);
  inner.appendChild(lbl);
  inner.appendChild(chipsWrap);
  inner.appendChild(actWrap);
  inner.appendChild(ftr);
  panel.appendChild(inner);
  dock.appendChild(tab);
  dock.appendChild(panel);
  document.body.appendChild(dock);

  PROVIDERS.forEach(function(p) {
    var chip = document.createElement('div');
    chip.className = 'dp-chip' + (p.id === CURRENT ? ' active' : '');
    var dot = document.createElement('span');
    dot.className = 'dp-dot';
    dot.style.background = p.color;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(p.name));
    chip.addEventListener('click', function() {
      if (p.id !== CURRENT) window.location.href = p.url;
    });
    chipsWrap.appendChild(chip);
  });

  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    clearTimeout(autoClose);
    autoClose = setTimeout(function() { closePanel(); }, 6000);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
  }

  // Entire tab toggles panel EXCEPT the toggle button
  tab.addEventListener('click', function(e) {
    if (e.target === toggleBtn || toggleBtn.contains(e.target)) return;
    isOpen ? closePanel() : openPanel();
  });

  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    window.open(DIARY_URL + '/app.html', '_blank');
  });

  closeBtn.addEventListener('click', function() { closePanel(); });
  panel.addEventListener('mouseenter', function() { clearTimeout(autoClose); });
  panel.addEventListener('mouseleave', function() {
    autoClose = setTimeout(function() { closePanel(); }, 2000);
  });

  } // end _diaryInjectDock
})();
