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
      const res = await fetch('https://api.projectcoachai.com/api/diary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + msg.token },
        body: JSON.stringify({ source: msg.source, prompt: msg.prompt, content: msg.content, metadata: { saved_from: 'diary_extension', url: msg.url } })
      });
      const data = await res.json();
      chrome.tabs.sendMessage(sender.tab.id, { type: 'DIARY_TO_PAGE', data: { type: '__DIARY_EXT_DATA__', savedToDiary: true, success: data.success, error: data.error } });
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

console.log('[Diary BG] Service worker started');
