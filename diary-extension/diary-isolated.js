// Diary Extension — Isolated World Script

(function() {
  if (window.__diaryIsolatedActive) return;
  window.__diaryIsolatedActive = true;

  const BRIDGE_ID = '__forge_bridge__';

  function watchBridge(bridge) {
    // Signal to MAIN world that Forge is active
    window.postMessage({ type: '__FORGE_ACTIVE_ON_PAGE__' }, '*');
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName !== 'data-command') continue;
        const raw = bridge.getAttribute('data-command');
        if (!raw) continue;
        bridge.removeAttribute('data-command');
        try {
          const msg = JSON.parse(raw);
          console.log('[Forge isolated] Command via storage:', msg.type);
          chrome.storage.local.set({ __forge_cmd: { ...msg, _t: Date.now() } });
        } catch(e) {}
      }
    });
    observer.observe(bridge, { attributes: true });
    console.log('[Forge isolated] Watching bridge for commands');
  }

  const existing = document.getElementById(BRIDGE_ID);
  if (existing) {
    watchBridge(existing);
  } else {
    const mo = new MutationObserver(() => {
      const b = document.getElementById(BRIDGE_ID);
      if (b) { mo.disconnect(); window.postMessage({ type: '__FORGE_ACTIVE_ON_PAGE__' }, '*'); watchBridge(b); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 10000);
  }

  // Forward background messages to MAIN world
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DIARY_TO_PAGE') {
      window.postMessage({ type: '__DIARY_EXT_DATA__', ...message.data }, '*');
    }
    if (['INJECT_PROMPT','CHECK_AUTH','GET_RESPONSE'].includes(message.type)) {
      window.postMessage({ type: '__DIARY_FROM_EXT__', payload: message }, '*');
    }
  });

  // On load — proactively post token so MAIN world has it immediately
  chrome.storage.local.get(['diary_token'], (r) => {
    if (r.diary_token) {
      window.postMessage({ type: '__DIARY_AUTH_TOKEN__', token: r.diary_token }, '*');
    }
  });

  // Single relay listener — handles all postMessages from MAIN world
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== '__DIARY_TO_EXT__') return;
    const payload = event.data.payload;
    if (!payload) return;

    // Handle locally — no background needed
    if (payload.type === 'SET_STORAGE') {
      try { chrome.storage.local.set({ [payload.key]: payload.value }); } catch(_) {}
      return;
    }
    if (payload.type === 'GET_STORAGE') {
      try {
        chrome.storage.local.get([payload.key], function(r) {
          window.postMessage({ type: '__DIARY_STORAGE_RESULT__', key: payload.key, value: r[payload.key] ?? null }, '*');
        });
      } catch(_) {}
      return;
    }
    if (payload.type === 'SAVE_TO_DIARY') {
      chrome.runtime.sendMessage({ type: 'SAVE_TO_DIARY', token: payload.token, source: payload.source, prompt: payload.prompt, content: payload.content, url: payload.url }, function(r) {});
      return;
    }
    if (payload.type === 'GET_AUTH_TOKEN') {
      try {
        chrome.storage.local.get(['diary_token'], function(r) {
          window.postMessage({ type: '__DIARY_AUTH_TOKEN__', token: r.diary_token || null }, '*');
        });
      } catch(_) { window.postMessage({ type: '__DIARY_AUTH_TOKEN__', token: null }, '*'); }
      return;
    }
    if (payload.type === 'GET_SIDEPANEL_URL') {
      try {
        const url = chrome.runtime.getURL('forge-sidepanel.html');
        window.postMessage({ type: '__DIARY_SIDEPANEL_URL__', url }, '*');
      } catch(_) {}
      return;
    }
    if (payload.type === 'GET_PENDING_PROMPT') {
      try {
        chrome.storage.session.get('pendingPrompt', (r) => {
          if (chrome.runtime.lastError) {
            window.postMessage({ type: '__DIARY_PENDING_RESULT__', pendingPrompt: null }, '*');
            return;
          }
          window.postMessage({ type: '__DIARY_PENDING_RESULT__', pendingPrompt: r?.pendingPrompt || null }, '*');
        });
      } catch(_) {
        window.postMessage({ type: '__DIARY_PENDING_RESULT__', pendingPrompt: null }, '*');
      }
      return;
    }

    // Forward everything else to background
    chrome.runtime.sendMessage(payload, () => {
      if (chrome.runtime.lastError) {}
    });
  });

  console.log('[Forge isolated] Ready');
})();
