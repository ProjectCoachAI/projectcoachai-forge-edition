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
    if (['INJECT_PROMPT','INJECT_PENDING_PROMPT','CHECK_AUTH','GET_RESPONSE'].includes(message.type)) {
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
    // Log ALL incoming messages before filtering to detect silent rejections
    if (event.data && event.data.type) {
      console.log('[Diary isolated] message received:', event.data.type, event.source === window ? 'same-window' : 'other-source');
    }
    if (event.source !== window) return;
    if (event.data?.type !== '__DIARY_TO_EXT__') return;
    const payload = event.data.payload;
    if (!payload) return;
    if (payload.type === 'UPLOAD_IMAGES' && payload.urls && payload.token) {
      chrome.runtime.sendMessage({ type: 'UPLOAD_IMAGES', token: payload.token, urls: payload.urls }, function(r) {
        window.postMessage({ type: '__DIARY_IMAGES_UPLOADED__', urls: (r && r.urls) || [] }, '*');
      });
      return;
    }

    // PING test
    if (payload.type === 'PING') {
      console.log('[Diary isolated] PING received - messaging channel works');
      window.postMessage({ type: '__DIARY_PONG__' }, '*');
      return;
    }

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
    if (payload.type === 'SET_PENDING_PROMPT') {
      try {
        chrome.runtime.sendMessage({ type: 'SET_PENDING_PROMPT', payload: { prompt: payload.prompt, source: payload.source, ts: Date.now() } }, function(r) {
          console.log('[Diary isolated] Pending prompt stored via background:', payload.prompt.slice(0,40));
          // Confirm storage to page so it can open the provider tab
          window.postMessage({ type: '__DIARY_PROMPT_STORED__' }, '*');
        });
      } catch(e) {
        console.warn('[Diary isolated] SET_PENDING_PROMPT error:', e.message);
        window.postMessage({ type: '__DIARY_PROMPT_STORED__' }, '*'); // open anyway
      }
      return;
    }
    if (payload.type === 'GET_SIDEPANEL_URL') {
      try {
        const url = chrome.runtime.getURL('forge-sidepanel.html');
        window.postMessage({ type: '__DIARY_SIDEPANEL_URL__', url }, '*');
      } catch(_) {}
      return;
    }
    if (payload.type === 'SET_PENDING_PROMPT' && payload.prompt) {
      const pendingData = {
        text: payload.prompt,
        prompt: payload.prompt,
        source: payload.source,
        providers: ['claude','chatgpt','gemini','perplexity','mistral','deepseek','grok','meta'],
        timestamp: Date.now(),
        ts: Date.now()
      };
      chrome.storage.local.set({ diary_pending_prompt: pendingData }, () => {
        console.log('[Diary isolated] pending prompt stored');
        window.postMessage({ type: '__DIARY_PROMPT_STORED__' }, '*');
      });
    }

    if (payload.type === 'GET_PENDING_PROMPT') {
      console.log('[Diary isolated] GET_PENDING_PROMPT received - reading from chrome.storage.local');
      try {
        chrome.storage.local.get(['diary_pending_prompt'], function(r) {
          var pending = r.diary_pending_prompt || null;
          console.log('[Diary isolated] pending prompt from storage:', pending ? 'found' : 'none');
          if (pending) chrome.storage.local.remove(['diary_pending_prompt']);
          window.postMessage({ type: '__DIARY_PENDING_RESULT__', pendingPrompt: pending }, '*');
        });
      } catch(e) {
        console.warn('[Diary isolated] storage error:', e.message);
        window.postMessage({ type: '__DIARY_PENDING_RESULT__', pendingPrompt: null }, '*');
      }
      return;
    }

    // Forward everything else to background
    chrome.runtime.sendMessage(payload, () => {
      if (chrome.runtime.lastError) {}
    });
  });

  chrome.runtime.onMessage.addListener(function(msg) {
    if (msg.type === 'AI_RESPONSE_COMPLETE') window.postMessage(msg, '*');
  });
  console.log('[Forge isolated] Ready');
})();
