// Forge Extension — Isolated World Script
// Watches DOM bridge and relays commands to background via storage
// Using storage.onChanged to wake the service worker reliably

(function() {
  if (window.__forgeIsolatedActive) return;
  window.__forgeIsolatedActive = true;

  const BRIDGE_ID = '__forge_bridge__';

  function watchBridge(bridge) {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName !== 'data-command') continue;
        const raw = bridge.getAttribute('data-command');
        if (!raw) continue;
        bridge.removeAttribute('data-command');
        try {
          const msg = JSON.parse(raw);
          console.log('[Forge isolated] Command via storage:', msg.type);
          // Write to storage — this reliably wakes the service worker
          // via chrome.storage.onChanged listener in background.js
          chrome.storage.local.set({
            __forge_cmd: { ...msg, _t: Date.now() }
          });
        } catch(e) {}
      }
    });
    observer.observe(bridge, { attributes: true });
    console.log('[Forge isolated] Watching bridge for commands');
  }

  // Find or wait for bridge
  const existing = document.getElementById(BRIDGE_ID);
  if (existing) {
    watchBridge(existing);
  } else {
    const mo = new MutationObserver(() => {
      const b = document.getElementById(BRIDGE_ID);
      if (b) { mo.disconnect(); watchBridge(b); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 10000);
  }

  // Forward data from background to page via postMessage
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FORGE_TO_PAGE') {
      window.postMessage({ type: '__FORGE_EXT_DATA__', ...message.data }, '*');
    }
  });

  console.log('[Forge isolated] Ready');
})();
