// Diary Extension — Background Service Worker

const FORGE_EXTENSION_ID = 'kfpkadojdjckaiedjemeioeicoocohco';

// Ping Forge directly on each tab to set the forge flag before dock injects
const PING_TIMEOUT = 500;

async function isForgeActive() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), PING_TIMEOUT);
    try {
      chrome.runtime.sendMessage(FORGE_EXTENSION_ID, { type: 'PING' }, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError || !response || !response.ok) resolve(false);
        else resolve(true);
      });
    } catch(e) { clearTimeout(timer); resolve(false); }
  });
}

// On each tab navigation, inject forge flag directly into page MAIN world
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const forge = await isForgeActive();
  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      world: 'MAIN',
      func: (forgeActive) => { window.__diaryForgeActive = forgeActive; },
      args: [forge],
    });
  } catch(_) {}
});

chrome.runtime.onInstalled.addListener(async () => {
  const forge = await isForgeActive();
  await chrome.storage.local.set({ __forge_installed: forge });
});

// Clear stale flag on startup, then re-check
chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.local.set({ __forge_installed: false });
  const forge = await isForgeActive();
  await chrome.storage.local.set({ __forge_installed: forge });
});

const DIARY_ORIGINS = [
  'https://diary.projectcoachai.com'
];

// ── Keep service worker alive ─────────────────────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {});

// ── Messages from content scripts ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {

  if (msg.type === 'SAVE_TO_DIARY') {
    try {
      const API = 'https://api.projectcoachai.com';
      const token = msg.token;
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };

      // Step 1: look up existing entry by URL
      let existingId = null;
      let existingContent = '';
      try {
        const lR = await fetch(API + '/api/diary/by-url?url=' + encodeURIComponent(msg.url), { headers: { 'Authorization': 'Bearer ' + token } });
        const lD = await lR.json();
        if (lD.success && lD.entry) {
          existingId = lD.entry.id;
          existingContent = lD.entry.content || '';
        }
      } catch(e) {}

let data;
      if (existingId) {
        // Step 2a: PATCH - replace with complete conversation snapshot.
        //
        // SAFETY GUARD: the client's local capture state (window.__diaryCapture)
        // lives in page JS and resets on every full navigation/reload (e.g. the
        // user re-opens an existing chat via "Open original" instead of staying
        // in the SPA). After a reload, the extension can only capture turns that
        // stream in AFTER that reload — it has no way to recover turns that were
        // already in the conversation. If we blindly PATCH with that partial
        // content, we silently delete whatever was already saved.
        //
        // Guard: if the new content is shorter than what's already stored and
        // doesn't clearly extend it, treat it as a partial post-reload capture
        // and merge (append) rather than overwrite, so no saved turns are lost.
        let patchContent = msg.content;
        const looksPartial = existingContent && patchContent &&
          patchContent.length < existingContent.length &&
          !patchContent.includes(existingContent.slice(0, 200));
        if (looksPartial) {
          if (existingContent.includes(patchContent.trim())) {
            // Incoming content is already fully present in what's saved
            // (e.g. the partial post-reload capture is an exact tail of the
            // existing thread) — nothing new to add, keep existing as-is
            // rather than duplicating it.
            patchContent = existingContent;
          } else {
            patchContent = existingContent.trim() + '\n\n---\n\n' + patchContent.trim();
          }
        }
        const pR = await fetch(API + '/api/diary/' + existingId, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ content: patchContent, prompt: msg.prompt, metadata: { url: msg.url, images: msg.images || [] } })
        });
        data = await pR.json();
        data.updated = true;
      } else {
        // Step 2b: POST - create new entry
        const pR = await fetch(API + '/api/diary', {
          method: 'POST',
          headers,
          body: JSON.stringify({ source: msg.source, prompt: msg.prompt, content: msg.content, metadata: { saved_from: 'diary_extension', url: msg.url, images: msg.images || [] } })
        });
        data = await pR.json();
        data.updated = false;
      }
      chrome.tabs.sendMessage(sender.tab.id, { type: 'DIARY_TO_PAGE', data: { type: '__DIARY_EXT_DATA__', savedToDiary: true, success: data.success, updated: data.updated, error: data.error } });
    } catch(e) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'DIARY_TO_PAGE', data: { type: '__DIARY_EXT_DATA__', savedToDiary: true, success: false, error: e.message } });
    }
    sendResponse({ ok: true });

    return false;
  }

  if (msg.type === 'GET_TOKEN_BG') {
    chrome.storage.local.get(['diary_token'], (r) => {
      sendResponse({ token: r.diary_token || null });
    });
    return true;
  }

  if (msg.type === 'SET_TOKEN_BG') {
    chrome.storage.local.set({ diary_token: msg.token }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'CLEAR_TOKEN_BG') {
    chrome.storage.local.remove(['diary_token'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'SET_PENDING_PROMPT') {
    chrome.storage.local.set({ diary_pending_prompt: msg.payload }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'UPLOAD_IMAGES') {
    const urls = msg.urls || [];
    const token = msg.token;
    const uploaded = [];
    for (const url of urls.slice(0, 5)) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        if (blob.size > 5 * 1024 * 1024) continue;
        const buf = await blob.arrayBuffer();
        // Convert to base64 to avoid body parser conflict on server
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const uploadResp = await fetch('https://api.projectcoachai.com/api/diary/upload-image', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: base64, contentType: blob.type || 'image/jpeg' })
        });
        const data = await uploadResp.json();
        if (data.success && data.url) uploaded.push(data.url);
      } catch(e) { console.warn('[Diary BG] image upload failed:', e.message); }
    }
    sendResponse({ urls: uploaded });
    return true;
  }

  if (msg.type === 'GET_PENDING_PROMPT_API') {
    chrome.storage.local.get(['diary_token'], async (r) => {
      const token = r.diary_token;
      if (!token) { sendResponse({ pending: null }); return; }
      try {
        const resp = await fetch('https://api.projectcoachai.com/api/diary/pending-prompt', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await resp.json();
        sendResponse({ pending: data.pending || null });
      } catch(e) { sendResponse({ pending: null }); }
    });
    return true;
  }

  if (msg.type === 'GET_PENDING_PROMPT') {
    chrome.storage.local.get(['diary_pending_prompt'], (r) => {
      const pending = r.diary_pending_prompt || null;
      // Clear after retrieval so it only injects once
      if (pending) chrome.storage.local.remove(['diary_pending_prompt']);
      sendResponse({ pending });
    });
    return true;
  }

  if (msg.type === 'CLEAR_PENDING_PROMPT') {
    chrome.storage.local.remove(['diary_pending_prompt'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }
});

// ── Provider tabs: pending prompt is consumed by checkPendingPrompt in diary-content.js ──
// (tabs.onUpdated injection removed — content script uses GET_PENDING_PROMPT via postMessage bridge)

// ── External messages from Diary website ──────────────────────────────────────
chrome.runtime.onMessageExternal.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === 'SET_TOKEN_BG' && msg.token) {
    chrome.storage.local.set({ diary_token: msg.token }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'SET_PENDING_PROMPT') {
    chrome.storage.local.set({ diary_pending_prompt: msg.payload }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'GET_PENDING_PROMPT') {
    chrome.storage.local.get(['diary_pending_prompt'], (r) => {
      const pending = r.diary_pending_prompt || null;
      // Clear after retrieval so it only injects once
      if (pending) chrome.storage.local.remove(['diary_pending_prompt']);
      sendResponse({ pending });
    });
    return true;
  }

  if (msg.type === 'CLEAR_PENDING_PROMPT') {
    chrome.storage.local.remove(['diary_pending_prompt'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }
});


// ── AI response completion detector via webRequest ────────────────────────────
const AI_URL_PATTERNS = [
  'https://gemini.google.com/*',
  'https://*.googleapis.com/*',
  'https://*.google.com/*',
  'https://www.perplexity.ai/*',
  'https://*.perplexity.ai/*',
  'https://chat.deepseek.com/*',
  'https://*.deepseek.com/*',
  'https://chat.mistral.ai/*',
  'https://*.mistral.ai/*',
  'https://grok.com/*',
  'https://*.grok.com/*',
  'https://www.meta.ai/*',
  'https://*.meta.ai/*',
];

// Allowlist: only these URL patterns signal AI response completion
const AI_COMPLETION_PATTERNS = [
  /gemini\.google\.com/,
  /generativelanguage\.googleapis\.com/,
  /perplexity\.ai/,
  /chat\.mistral\.ai\/api\/chat$/,
  /deepseek\.com\/api\/v0\/chat\/completion/,
  /grok\.com\/rest\//,
  /meta\.ai\/api/,
  /meta\.ai\/graphql/,
];

function isAIResponseUrl(url) {
  return AI_COMPLETION_PATTERNS.some(p => p.test(url));
}

chrome.webRequest.onCompleted.addListener(
  function(details) {
    console.log('[BG webRequest]', details.url.slice(0,100));
    if (!isAIResponseUrl(details.url)) return;
    if (details.tabId < 0) return;
    console.log('[BG] sending AI_RESPONSE_COMPLETE to tab', details.tabId, details.url.slice(0,60));
    chrome.tabs.sendMessage(details.tabId, {
      type: 'AI_RESPONSE_COMPLETE',
      url: details.url
    }).catch((e) => { console.log('[BG] sendMessage failed:', e.message); });
  },
  { urls: AI_URL_PATTERNS },
  []
);

console.log('[Diary BG] Service worker started');
