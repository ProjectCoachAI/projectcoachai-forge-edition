// Forge Extension — Background Service Worker

// Track split windows for restore on close
globalThis.splitWindowMap = globalThis.splitWindowMap || {};
globalThis.splitWindowState = globalThis.splitWindowState || {};

// Restore main window when split window closes
chrome.windows.onRemoved.addListener((windowId) => {
  globalThis.splitWindowMap = globalThis.splitWindowMap || {};
  globalThis.splitWindowState = globalThis.splitWindowState || {};
  if (globalThis.splitWindowMap[windowId]) {
    const { mainWinId, originalState } = globalThis.splitWindowMap[windowId];
    chrome.windows.update(mainWinId, {
      width: originalState.width,
      height: originalState.height,
      left: originalState.left,
      top: originalState.top,
      state: 'normal'
    }).catch(() => {});
    delete globalThis.splitWindowMap[windowId];
    delete globalThis.splitWindowState[mainWinId];
  }
});

const PROVIDER_URLS = {
  claude:      'https://claude.ai/new',
  chatgpt:     'https://chatgpt.com',
  gemini:      'https://gemini.google.com',
  mistral:     'https://chat.mistral.ai',
  deepseek:    'https://chat.deepseek.com',
  perplexity:  'https://www.perplexity.ai',
  grok:        'https://x.ai'
};

const FORGE_ORIGINS = [
  'http://localhost:8080',
  'http://localhost',
  'https://projectcoachai.com',
  'https://projectcoachai.pages.dev',
  'https://forge.projectcoachai.com'
];

// ── Keep service worker alive with an alarm ───────────────────────────────────
chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener(() => {
  chrome.storage.session.get('pendingDispatch', (r) => {
    if (r.pendingDispatch) {
      const { prompt, providers } = r.pendingDispatch;
      console.log('[Forge BG] Alarm: executing pending dispatch for', providers);
      chrome.storage.session.remove('pendingDispatch');
      dispatchPrompt(prompt, providers);
    }
  });
});

// ── Internal messages from content scripts ────────────────────────────────────
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {

  if (msg.type === 'RESPONSE_CAPTURED') {
    console.log(`[Forge BG] Response from ${msg.provider} (${msg.response?.length} chars)`);
    forwardToForge(msg);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'AUTH_STATUS' || msg.type === 'NOT_SIGNED_IN') {
    forwardToForge(msg);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_PENDING_PROMPT') {
    chrome.storage.session.get('pendingPrompt', (r) => {
      sendResponse({ prompt: r.pendingPrompt || null });
    });
    return true;
  }

  // SEND_PROMPT from Forge page via forge-content.js relay
  if (msg.type === 'SEND_PROMPT') {
    const prompt    = msg.prompt;
    const providers = msg.providers || [];
    console.log(`[Forge BG] SEND_PROMPT: "${prompt?.slice(0,40)}" → [${providers}]`);

    // Store for content scripts that load fresh
    chrome.storage.session.set({
      pendingPrompt: { text: prompt, providers, timestamp: Date.now() }
    });

    // Execute dispatch immediately — service worker is awake right now
    dispatchPrompt(prompt, providers);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_SIDEPANEL_URL') {
    sendResponse({ url: chrome.runtime.getURL('forge-sidepanel.html') });
    return false;
  }

  if (msg.type === 'FETCH_SPLIT') {
    const { prompt, provider } = msg;
    fetch('https://api.projectcoachai.com/api/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider })
    })
    .then(r => r.json())
    .then(data => sendResponse({ ok: true, data }))
    .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  if (msg.type === 'OPEN_SPLIT_WINDOW') {
    // Guard against duplicate splits — verify windows actually exist
    globalThis.splitWindowMap = globalThis.splitWindowMap || {};
    const activeSplits = Object.keys(globalThis.splitWindowMap);
    if (activeSplits.length > 0) {
      // Verify the split window still exists
      try {
        await new Promise((resolve) => {
          chrome.windows.get(parseInt(activeSplits[0]), (w) => {
            if (chrome.runtime.lastError || !w) {
              // Window gone — clean up stale entry
              delete globalThis.splitWindowMap[activeSplits[0]];
              console.log('[Forge BG] Stale split entry cleaned');
            } else {
              console.log('[Forge BG] Split already open — ignoring duplicate');
            }
            resolve();
          });
        });
      } catch(_) {}
      if (Object.keys(globalThis.splitWindowMap).length > 0) {
        sendResponse({ ok: true, duplicate: true });
        return false;
      }
    }
    // Debounce: prevent rapid re-opens
    if (globalThis._splitOpening) {
      console.log('[Forge BG] Split opening in progress — ignoring');
      sendResponse({ ok: true, duplicate: true });
      return false;
    }
    globalThis._splitOpening = true;
    setTimeout(() => { globalThis._splitOpening = false; }, 2000);

    (async () => {
      try {
        const url = chrome.runtime.getURL('forge-sidepanel.html');
        const currentWin = await chrome.windows.getCurrent();
        // Get actual screen info via chrome.system.display
        chrome.system.display.getInfo({}, (displays) => {
          const display = displays.find(d => 
            d.workArea.left <= currentWin.left && 
            currentWin.left < d.workArea.left + d.workArea.width
          ) || displays[0];
          
          const wa = display.workArea;
          const splitRatio = wa.width >= 1920 ? 0.65 : wa.width >= 1440 ? 0.62 : 0.60;
          const mainWidth = Math.floor(wa.width * splitRatio);
          const splitWidth = wa.width - mainWidth;

          // Store for restore
          globalThis.splitWindowMap = globalThis.splitWindowMap || {};
          const originalState = { 
            width: currentWin.width, height: currentWin.height, 
            left: currentWin.left, top: currentWin.top,
            state: currentWin.state
          };

          // Resize main window
          chrome.windows.update(currentWin.id, {
            left: wa.left,
            top: wa.top,
            width: mainWidth,
            height: wa.height,
            state: 'normal',
            focused: true
          }, () => {
            // Create split popup after main resizes
            setTimeout(() => {
              chrome.windows.create({
                url,
                type: 'popup',
                left: wa.left + mainWidth,
                top: wa.top,
                width: splitWidth,
                height: wa.height,
                state: 'normal'
              }, (splitWin) => {
                if (splitWin) {
                  globalThis.splitWindowMap[splitWin.id] = { 
                    mainWinId: currentWin.id, originalState 
                  };
                }
              });
            }, 600);
          });
        });
      } catch(e) {
        console.warn('[Forge BG] Split failed:', e.message);
        const url = chrome.runtime.getURL('forge-sidepanel.html');
        chrome.windows.create({ url, type: 'popup', width: 480, height: 800 });
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'OPEN_SIDE_PANEL') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && chrome.sidePanel) {
        await chrome.sidePanel.open({ tabId: tab.id });
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
    } catch(e) { sendResponse({ ok: false, error: e.message }); }
    return true;
  }
});

// ── External messages from Forge web page ────────────────────────────────────
chrome.runtime.onMessageExternal.addListener(async (msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_PROVIDER') {
    const PROVIDER_URLS = {
      claude:      'https://claude.ai/new',
      chatgpt:     'https://chatgpt.com',
      gemini:      'https://gemini.google.com',
      mistral:     'https://chat.mistral.ai',
      deepseek:    'https://chat.deepseek.com',
      perplexity:  'https://www.perplexity.ai',
      grok:        'https://grok.com',
    };
    const url = PROVIDER_URLS[msg.provider];
    if (!url) return;
    // Find existing tab for this provider or open new one
    const tabs = await chrome.tabs.query({});
    const existing = tabs.find(t => t.url && t.url.includes(new URL(url).hostname));
    if (existing) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'SWITCH_PROVIDER_TAB') {
    const url = msg.url;
    if (!url) { sendResponse({ switched: false }); return; }
    try {
      const hostname = new URL(url).hostname;
      const tabs = await chrome.tabs.query({});
      const existing = tabs.find(t => t.url && t.url.includes(hostname));
      if (existing) {
        await chrome.tabs.update(existing.id, { active: true });
        await chrome.windows.update(existing.windowId, { focused: true });
        sendResponse({ switched: true });
      } else {
        // Navigate the sender tab to the new provider
        const [senderTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (senderTab) {
          await chrome.tabs.update(senderTab.id, { url });
          sendResponse({ switched: true });
        } else {
          sendResponse({ switched: false });
        }
      }
    } catch(e) { sendResponse({ switched: false }); }
    return true;
  }

  if (msg.type === 'PING') {
    sendResponse({ ok: true, version: '1.0.0' });
    return false;
  }

  if (msg.type === 'SEND_PROMPT') {
    const prompt    = msg.prompt;
    const providers = msg.providers || [];
    console.log(`[Forge BG] External SEND_PROMPT: "${prompt?.slice(0,40)}" → [${providers}]`);
    chrome.storage.session.set({
      pendingPrompt: { text: prompt, providers, timestamp: Date.now() }
    });
    dispatchPrompt(prompt, providers);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_STATUS') {
    getStatus((status) => sendResponse({ ok: true, status }));
    return true;
  }
});

// ── Dispatch prompt to provider tabs ─────────────────────────────────────────
function dispatchPrompt(prompt, providers) {
  console.log('[Forge BG] dispatchPrompt starting for', providers);

  providers.forEach(provider => {
    const url = PROVIDER_URLS[provider];
    if (!url) return;
    const hostname = new URL(url).hostname;

    chrome.tabs.query({}, (tabs) => {
      // Match any tab on the same hostname — so existing claude.ai/chat/xyz tabs are found
      const tab = tabs.find(t => t.url && new URL(t.url).hostname === hostname);
      console.log(`[Forge BG] ${provider}: ${tab ? 'found tab ' + tab.id + ' at ' + tab.url : 'no tab, creating'}`)

      if (tab) {
        // Tab exists — try direct injection via __forgeInject
        chrome.scripting.executeScript({
          target: { tabId: tab.id, frameIds: [0] },
          world: 'MAIN',
          func: (p) => {
            if (typeof window.__forgeInject === 'function') {
              window.__forgeInject(p);
            } else {
              window.postMessage({ type: '__FORGE_FROM_EXT__', payload: { type: 'INJECT_PROMPT', prompt: p }}, '*');
            }
          },
          args: [prompt]
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn(`[Forge BG] scripting failed for ${provider}:`, chrome.runtime.lastError.message);
          } else {
            console.log(`[Forge BG] scripting injected for ${provider}`);
          }
        });
      } else {
        // No tab — store prompt and open tab; checkPendingPrompt picks it up on load
        chrome.storage.session.set({
          pendingPrompt: { text: prompt, providers: [provider], timestamp: Date.now() }
        });
        chrome.tabs.create({ url, active: false }, (newTab) => {
          if (chrome.runtime.lastError) {
            console.error(`[Forge BG] tabs.create failed for ${provider}:`, chrome.runtime.lastError.message);
          } else {
            console.log(`[Forge BG] Created tab ${newTab.id} for ${provider}`);
          }
        });
      }
    });
  });
}

// ── Forward to Forge page ─────────────────────────────────────────────────────
function forwardToForge(data) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (!FORGE_ORIGINS.some(o => tab.url?.startsWith(o))) return;
      chrome.tabs.sendMessage(tab.id, { type: 'FORGE_TO_PAGE', data }, () => {
        chrome.runtime.lastError; // suppress error
      });
    });
  });
  // Also forward to split panel window if open
  chrome.windows.getAll({ populate: true }, (windows) => {
    windows.forEach(win => {
      win.tabs?.forEach(tab => {
        if (tab.url?.includes('forge-sidepanel.html')) {
          chrome.tabs.sendMessage(tab.id, { type: 'FORGE_TO_PAGE', data }, () => {
            chrome.runtime.lastError;
          });
        }
      });
    });
  });
}

// ── Open provider tab ─────────────────────────────────────────────────────────
function openProvider(provider) {
  const url = PROVIDER_URLS[provider];
  if (!url) return;
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find(t => t.url?.startsWith(url));
    if (existing) {
      chrome.tabs.update(existing.id, { active: true });
    } else {
      chrome.tabs.create({ url });
    }
  });
}

// ── Get provider status ───────────────────────────────────────────────────────
function getStatus(callback) {
  const status = {};
  const providers = Object.keys(PROVIDER_URLS);
  let done = 0;

  chrome.tabs.query({}, (tabs) => {
    providers.forEach(provider => {
      const url = PROVIDER_URLS[provider];
      const tab = tabs.find(t => t.url?.startsWith(url));
      if (!tab) {
        status[provider] = 'no_tab';
        if (++done === providers.length) callback(status);
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'CHECK_AUTH' }, (r) => {
        chrome.runtime.lastError; // suppress
        status[provider] = r?.authenticated ? 'connected' : 'login_required';
        if (++done === providers.length) callback(status);
      });
    });
  });
}

// Watch storage for commands from forge-isolated.js
// storage.onChanged reliably wakes the service worker
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.__forge_cmd) return;
  const msg = changes.__forge_cmd.newValue;
  if (!msg) return;
  console.log('[Forge BG] Storage command received:', msg.type);
  chrome.storage.local.remove('__forge_cmd');

  if (msg.type === 'SEND_PROMPT') {
    console.log(`[Forge BG] Dispatching to [${msg.providers}]: "${msg.prompt?.slice(0,40)}"`);
    dispatchPrompt(msg.prompt, msg.providers || []);
  }
  if (msg.type === 'GET_STATUS') {
    getStatus((status) => {
      chrome.storage.local.set({ __forge_status: status });
    });
  }

  // Inject bridge into Forge tab on demand
  if (changes.__forge_inject) {
    chrome.storage.local.remove('__forge_inject');
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (!FORGE_ORIGINS.some(o => tab.url?.startsWith(o))) return;
        injectBridgeIntoTab(tab.id);
      });
    });
  }
});

// ── Inject bridge when Forge tab loads ───────────────────────────────────────
const recentlyInjected = new Map();
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  if (!FORGE_ORIGINS.some(o => tab.url.startsWith(o))) return;
  // Skip Forge marketing pages
  const FORGE_SKIP = ['/why-forge', '/why-excel', '/pricing', '/blog', '/help', '/terms', '/privacy', '/contact', '/rank'];
  if (tab.url.includes('forge.projectcoachai.com') && FORGE_SKIP.some(p => tab.url.includes(p))) return;
  // Debounce — skip if injected within last 2 seconds
  const now = Date.now();
  if (recentlyInjected.get(tabId) && now - recentlyInjected.get(tabId) < 2000) return;
  recentlyInjected.set(tabId, now);
  console.log('[Forge BG] Forge tab loaded, injecting bridge:', tabId);
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['forge-main.js'],
    world: 'MAIN'
  }, () => {
    if (chrome.runtime.lastError) { console.warn('[Forge BG] forge-main failed:', chrome.runtime.lastError.message); return; }
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['forge-isolated.js']
    }, () => {
      if (chrome.runtime.lastError) console.warn('[Forge BG] forge-isolated failed:', chrome.runtime.lastError.message);
      else console.log('[Forge BG] Bridge fully injected into tab', tabId);
    });
  });
});

// ── Inject bridge into Forge tabs ────────────────────────────────────────────
function injectBridgeIntoTab(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['forge-main.js'],
    world: 'MAIN'
  }, () => {
    if (chrome.runtime.lastError) return;
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['forge-isolated.js']
    }, () => {
      if (chrome.runtime.lastError) return;
      console.log('[Forge BG] Bridge injected into tab', tabId);
    });
  });
}

function injectBridgeIntoForgeTabs() {
  const FORGE_SKIP = ['/why-forge', '/why-excel', '/pricing', '/blog', '/help', '/terms', '/privacy', '/contact', '/rank'];
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (!tab.url) return;
      if (!FORGE_ORIGINS.some(o => tab.url.startsWith(o))) return;
      if (tab.url.includes('forge.projectcoachai.com') && FORGE_SKIP.some(p => tab.url.includes(p))) return;
      console.log('[Forge BG] Injecting bridge into tab:', tab.id, tab.url);
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['forge-content.js']
      }, (r) => {
        const err = chrome.runtime.lastError;
        if (err) console.warn('[Forge BG] Bridge injection failed:', err.message);
        else console.log('[Forge BG] Bridge injected into tab', tab.id);
      });
    });
  });
}

// Run on startup with retries — service worker may start before tabs are queryable
setTimeout(injectBridgeIntoForgeTabs, 200);
setTimeout(injectBridgeIntoForgeTabs, 1000);
setTimeout(injectBridgeIntoForgeTabs, 3000);

console.log('[Forge BG] Service worker started');
