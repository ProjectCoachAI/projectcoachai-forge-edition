// Diary Extension — Dock UI
// Simplified dock with Diary branding, cream/navy colors

(function() {
  if (document.getElementById('diary-dock')) return;

  var DIARY_URL = 'https://diary.projectcoachai.com';

  var PROVIDERS = [
    { id: 'claude',      name: 'Claude',      color: '#C17D3C', url: 'https://claude.ai/new' },
    { id: 'chatgpt',     name: 'ChatGPT',     color: '#10A37F', url: 'https://chatgpt.com' },
    { id: 'gemini',      name: 'Gemini',      color: '#4A8EF4', url: 'https://gemini.google.com' },
    { id: 'perplexity',  name: 'Perplexity',  color: '#20B2AA', url: 'https://www.perplexity.ai' },
    { id: 'grok',        name: 'Grok',        color: '#888',    url: 'https://grok.com' },
    { id: 'deepseek',    name: 'DeepSeek',    color: '#4169E1', url: 'https://chat.deepseek.com' },
    { id: 'mistral',     name: 'Mistral',     color: '#FF7000', url: 'https://chat.mistral.ai' },
    { id: 'meta',        name: 'Meta AI',     color: '#0668E1', url: 'https://www.meta.ai' },
  ];

  var CURRENT = (function() {
    var h = location.hostname;
    if (h.includes('claude.ai'))       return 'claude';
    if (h.includes('chatgpt.com'))     return 'chatgpt';
    if (h.includes('gemini.google'))   return 'gemini';
    if (h.includes('perplexity.ai'))   return 'perplexity';
    if (h.includes('grok.com'))        return 'grok';
    if (h.includes('deepseek.com'))    return 'deepseek';
    if (h.includes('mistral.ai'))      return 'mistral';
    if (h.includes('meta.ai'))         return 'meta';
    return null;
  })();

  var dock = document.createElement('div');
  dock.id = 'diary-dock';
  dock.style.cssText = 'position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483640;display:flex;align-items:center;pointer-events:none;';

  // Tab
  var tab = document.createElement('div');
  tab.style.cssText = 'pointer-events:all;width:40px;height:72px;background:#1B2A4A;border:1px solid rgba(193,125,60,0.3);border-right:none;border-radius:12px 0 0 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;box-shadow:-4px 0 20px rgba(27,42,74,0.3);user-select:none;transition:width 0.2s;';

  var mark = document.createElement('div');
  mark.style.cssText = 'width:26px;height:26px;background:linear-gradient(135deg,#1B2A4A,#243A63);border:1.5px solid #C17D3C;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#F5F3EE;font-family:Georgia,serif;';
  mark.textContent = 'D';

  var diaryToggle = document.createElement('div');
  diaryToggle.style.cssText = 'width:22px;height:22px;border-radius:5px;background:rgba(193,125,60,0.15);border:1px solid rgba(193,125,60,0.4);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;transition:background 0.2s;';
  diaryToggle.title = 'Open Diary';
  diaryToggle.textContent = '\uD83D\uDCD4';
  diaryToggle.onclick = function(e) {
    e.stopPropagation();
    window.open(DIARY_URL + '/app.html', '_blank');
  };

  tab.appendChild(mark);
  tab.appendChild(diaryToggle);

  // Panel
  var panel = document.createElement('div');
  panel.style.cssText = 'pointer-events:all;position:absolute;right:40px;top:50%;transform:translateY(-50%) scaleX(0);transform-origin:right center;width:0;opacity:0;overflow:hidden;background:#fff;border:1px solid #D6D2C8;border-right:none;border-radius:12px 0 0 12px;box-shadow:-8px 0 32px rgba(27,42,74,0.15);transition:transform 0.25s cubic-bezier(.4,0,.2,1),opacity 0.2s,width 0.25s cubic-bezier(.4,0,.2,1);white-space:nowrap;';

  var inner = document.createElement('div');
  inner.style.cssText = 'padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-width:280px;font-family:system-ui,sans-serif;';

  // Header
  var hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';
  var brand = document.createElement('div');
  brand.style.cssText = 'font-size:15px;font-weight:600;color:#1B2A4A;font-family:Georgia,serif;';
  brand.innerHTML = 'Diary<span style="color:#C17D3C">.</span>';
  var closeBtn = document.createElement('button');
  closeBtn.style.cssText = 'background:none;border:1px solid #D6D2C8;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:13px;color:#9E9890;display:flex;align-items:center;justify-content:center;';
  closeBtn.textContent = '\u00D7';
  closeBtn.onclick = function() { closeDock(); };
  hdr.appendChild(brand); hdr.appendChild(closeBtn);

  // Provider chips
  var provLabel = document.createElement('div');
  provLabel.style.cssText = 'font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9E9890;';
  provLabel.textContent = 'Switch AI';

  var chips = document.createElement('div');
  chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';
  PROVIDERS.forEach(function(p) {
    var chip = document.createElement('div');
    var isCurrent = p.id === CURRENT;
    chip.style.cssText = 'display:flex;align-items:center;gap:4px;background:' + (isCurrent ? '#F5F3EE' : '#fff') + ';border:1px solid ' + (isCurrent ? '#C17D3C' : '#D6D2C8') + ';border-radius:20px;padding:4px 9px;font-size:11px;color:#1B2A4A;cursor:pointer;transition:all 0.15s;';
    chip.innerHTML = '<span style="width:6px;height:6px;border-radius:50%;background:' + p.color + ';display:inline-block;flex-shrink:0;"></span>' + p.name;
    chip.onmouseenter = function() { this.style.borderColor = '#C17D3C'; };
    chip.onmouseleave = function() { this.style.borderColor = isCurrent ? '#C17D3C' : '#D6D2C8'; };
    chip.onclick = function() {
      if (!isCurrent) window.location.href = p.url;
    };
    chips.appendChild(chip);
  });

  // Actions
  var actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;';

  var diaryBtn = document.createElement('a');
  diaryBtn.href = DIARY_URL + '/app.html';
  diaryBtn.target = '_blank';
  diaryBtn.style.cssText = 'flex:1;padding:8px 12px;background:#1B2A4A;color:#F5F3EE;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px;transition:background 0.2s;';
  diaryBtn.innerHTML = '\uD83D\uDCD4 My Diary';
  diaryBtn.onmouseenter = function() { this.style.background = '#243A63'; };
  diaryBtn.onmouseleave = function() { this.style.background = '#1B2A4A'; };

  var chatBtn = document.createElement('a');
  chatBtn.href = DIARY_URL + '/chat.html';
  chatBtn.target = '_blank';
  chatBtn.style.cssText = 'padding:8px 12px;background:transparent;color:#6B6559;border:1px solid #D6D2C8;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;text-decoration:none;white-space:nowrap;display:flex;align-items:center;transition:all 0.15s;';
  chatBtn.textContent = '\u26A1 Chat';
  chatBtn.onmouseenter = function() { this.style.borderColor = '#1B2A4A'; this.style.color = '#1B2A4A'; };
  chatBtn.onmouseleave = function() { this.style.borderColor = '#D6D2C8'; this.style.color = '#6B6559'; };

  actions.appendChild(diaryBtn); actions.appendChild(chatBtn);

  // Footer
  var footer = document.createElement('div');
  footer.style.cssText = 'font-size:10px;color:#9E9890;text-align:center;';
  footer.innerHTML = '<a href="' + DIARY_URL + '" target="_blank" style="color:#C17D3C;text-decoration:none;">diary.projectcoachai.com</a>';

  inner.appendChild(hdr);
  inner.appendChild(provLabel);
  inner.appendChild(chips);
  inner.appendChild(actions);
  inner.appendChild(footer);
  panel.appendChild(inner);

  dock.appendChild(tab);
  dock.appendChild(panel);
  document.body.appendChild(dock);

  var isOpen = false;
  var autoClose;

  function openDock() {
    isOpen = true;
    panel.style.width = 'auto';
    panel.style.opacity = '1';
    panel.style.transform = 'translateY(-50%) scaleX(1)';
    panel.style.overflow = 'visible';
    clearTimeout(autoClose);
    autoClose = setTimeout(closeDock, 4000);
  }

  function closeDock() {
    isOpen = false;
    panel.style.width = '0';
    panel.style.opacity = '0';
    panel.style.transform = 'translateY(-50%) scaleX(0)';
    panel.style.overflow = 'hidden';
  }

  tab.onclick = function() { isOpen ? closeDock() : openDock(); };
  panel.onmouseenter = function() { clearTimeout(autoClose); };
  panel.onmouseleave = function() { autoClose = setTimeout(closeDock, 1500); };

})();
