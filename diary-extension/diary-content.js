// Diary Extension — Content Script (MAIN world)
// Injects "Save to Diary" button when AI responses are detected

var PROVIDER = (function() {
  var h = location.hostname;
  if (h.includes('claude.ai'))        return 'claude';
  if (h.includes('chatgpt.com'))      return 'chatgpt';
  if (h.includes('gemini.google'))    return 'gemini';
  if (h.includes('perplexity.ai'))    return 'perplexity';
  if (h.includes('grok.com'))         return 'grok';
  if (h.includes('deepseek.com'))     return 'deepseek';
  if (h.includes('mistral.ai'))       return 'mistral';
  if (h.includes('meta.ai'))          return 'meta';
  return 'external';
})();

var RESPONSE_SELECTORS = {
  claude:      '[data-testid="assistant-message"], .font-claude-message',
  chatgpt:     '[data-message-author-role="assistant"], .markdown.prose',
  gemini:      '.model-response-text, .response-container',
  perplexity:  '.prose, [class*="answer"]',
  grok:        '[class*="message-bubble"], [class*="response"]',
  deepseek:    '[class*="ds-markdown"], [class*="chat-message"]',
  mistral:     '[class*="message-content"], [class*="assistant"]',
  meta:        '[class*="assistant-message"], [class*="response"]'
};

function getLatestResponse() {
  var sel = RESPONSE_SELECTORS[PROVIDER] || '[class*="assistant"]';
  var els = document.querySelectorAll(sel);
  if (!els.length) return null;
  var el = els[els.length - 1];
  var text = el.innerText || el.textContent || '';
  return text.trim().slice(0, 8000) || null;
}

function injectSaveDiaryButton(responseText) {
  // Don't inject if Forge extension already has a save button
  if (document.getElementById('forge-save-diary-btn')) return;
  // Don't inject if Forge extension already has a save button
  if (document.getElementById('forge-save-diary-btn')) return;
  var existing = document.getElementById('diary-save-btn');
  if (existing) existing.remove();

  var btn = document.createElement('button');
  btn.id = 'diary-save-btn';
  btn.innerHTML = '&#128214; Save to Diary';
  btn.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'z-index:2147483640',
    'background:#1B2A4A',
    'color:#F5F3EE',
    'border:none',
    'border-radius:8px',
    'padding:10px 18px',
    'font-size:13px',
    'font-weight:600',
    'cursor:pointer',
    'font-family:system-ui,sans-serif',
    'box-shadow:0 4px 16px rgba(27,42,74,0.3)',
    'transition:all 0.2s',
    'display:flex',
    'align-items:center',
    'gap:6px'
  ].join(';');

  btn.onmouseenter = function() { this.style.background = '#243A63'; this.style.transform = 'translateY(-2px)'; };
  btn.onmouseleave = function() { this.style.background = '#1B2A4A'; this.style.transform = ''; };

  btn.onclick = async function() {
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    // Get auth token — from extension storage (diary_token set on Diary signin)
    var token = await new Promise(function(resolve) {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'GET_AUTH_TOKEN' } }, '*');
      var handler = function(e) {
        if (e.data && e.data.type === '__DIARY_AUTH_TOKEN__') {
          window.removeEventListener('message', handler);
          resolve(e.data.token);
        }
      };
      window.addEventListener('message', handler);
      setTimeout(function() { resolve(null); }, 1500);
    });

    if (!token) {
      btn.innerHTML = '&#128214; Sign in to Diary first';
      btn.style.background = '#C17D3C';
      btn.onclick = function() { window.open('https://diary.projectcoachai.com/signin.html', '_blank'); };
      btn.disabled = false;
      return;
    }

    // Get prompt
    var prompt = '';
    var userEls = document.querySelectorAll('[data-message-author-role="user"], .human-bubble, [class*="user-message"], [class*="human"]');
    if (userEls.length) prompt = userEls[userEls.length - 1].textContent.trim().slice(0, 500);

    // Send save message
    window.postMessage({ type: '__DIARY_TO_EXT__', payload: {
      type: 'SAVE_TO_DIARY',
      token: token,
      source: PROVIDER,
      prompt: prompt,
      content: responseText,
      url: window.location.href
    }}, '*');

    // Wait for result
    var result = await new Promise(function(resolve) {
      var handler = function(e) {
        if (e.data && e.data.type === '__DIARY_SAVE_RESULT__') {
          window.removeEventListener('message', handler);
          resolve(e.data);
        }
      };
      window.addEventListener('message', handler);
      setTimeout(function() { resolve({ success: false, error: 'timeout' }); }, 10000);
    });

    if (result.success) {
      btn.innerHTML = '&#10003; Saved to Diary';
      btn.style.background = '#C17D3C';
      setTimeout(function() { btn.remove(); }, 3000);
    } else {
      btn.innerHTML = 'Failed — try again';
      btn.style.background = '#B91C1C';
      btn.disabled = false;
      setTimeout(function() { btn.remove(); }, 4000);
    }
  };

  document.body.appendChild(btn);
}

// Watch for new AI responses
var lastText = '';
var observer = new MutationObserver(function() {
  var text = getLatestResponse();
  if (text && text.length > 100 && text !== lastText) {
    lastText = text;
    setTimeout(function() { injectSaveDiaryButton(text); }, 1200);
  }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });
