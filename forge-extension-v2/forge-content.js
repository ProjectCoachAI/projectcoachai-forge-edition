// Forge Extension — Forge Page Content Script
// Bridge between Forge web app (main world) and extension background (isolated world)
// Uses a hidden DOM element as the message channel — works across all worlds

(function () {
  'use strict';

  const BRIDGE_ID = '__forge_bridge__';

  // ── Create a hidden bridge element in the DOM ────────────────────────────────
  // Both main world and isolated world can read/write DOM attributes
  let bridge = document.getElementById(BRIDGE_ID);
  if (!bridge) {
    bridge = document.createElement('div');
    bridge.id = BRIDGE_ID;
    bridge.style.display = 'none';
    document.documentElement.appendChild(bridge);
  }

  // ── Signal presence ──────────────────────────────────────────────────────────
  function signalPresence() {
    bridge.setAttribute('data-ext-present', '1');
    bridge.setAttribute('data-ext-version', '1.0.0');
    window.postMessage({ type: '__FORGE_EXT_PRESENT__', version: '1.0.0' }, '*');
  }
  signalPresence();
  window.addEventListener('load', signalPresence);

  // ── Watch for commands written to bridge element by main world ───────────────
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.attributeName === 'data-command') {
        const raw = bridge.getAttribute('data-command');
        if (!raw) continue;
        bridge.removeAttribute('data-command');
        try {
          const msg = JSON.parse(raw);
          handleCommand(msg);
        } catch (e) {
          console.warn('[Forge content] Bad command JSON:', e.message);
        }
      }
    }
  });
  observer.observe(bridge, { attributes: true });

  function handleCommand(msg) {
    console.log('[Forge content] Command received:', msg.type);
    chrome.runtime.sendMessage(msg, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('[Forge content] sendMessage error:', err.message);
        return;
      }
      console.log('[Forge content] Background response:', JSON.stringify(response));
      // Write response back to bridge for main world to read
      bridge.setAttribute('data-response', JSON.stringify(response || {}));
    });
  }

  // ── Forward data from background to main world ───────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FORGE_TO_PAGE') {
      window.postMessage({ type: '__FORGE_EXT_DATA__', ...message.data }, '*');
    }
  });

  // ── Respond to CHECK messages ────────────────────────────────────────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === '__FORGE_EXT_CHECK__') signalPresence();
  });

  console.log('[Forge] Content bridge active');
})();
