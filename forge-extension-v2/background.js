// Forge Extension — Background Service Worker

const PROVIDER_URLS = {
  claude:      'https://claude.ai',
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
  'https://forge-app-1u9.pages.dev'
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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

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
});

// ── External messages from Forge web page ────────────────────────────────────
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
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

    chrome.tabs.query({}, (tabs) => {
      const tab = tabs.find(t => t.url?.startsWith(url));
      console.log(`[Forge BG] ${provider}: ${tab ? 'found tab ' + tab.id : 'no tab, creating'}`);

      if (tab) {
        // Tab exists — inject prompt via scripting API (bypasses message channel issues)
        chrome.tabs.sendMessage(tab.id, { type: 'INJECT_PROMPT', prompt, provider }, (r) => {
          if (chrome.runtime.lastError) {
            console.warn(`[Forge BG] sendMessage failed for ${provider}, trying scripting:`, chrome.runtime.lastError.message);
            // Fallback: use scripting to post message directly to page
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              world: 'MAIN',
              func: (p, prov) => {
                window.postMessage({ type: '__FORGE_FROM_EXT__', payload: { type: 'INJECT_PROMPT', prompt: p, provider: prov }}, '*');
              },
              args: [prompt, provider]
            }, () => {
              if (chrome.runtime.lastError) {
                console.warn(`[Forge BG] scripting failed for ${provider}:`, chrome.runtime.lastError.message);
                chrome.tabs.reload(tab.id);
              }
            });
          }
        });
      } else {
        // Open new tab — content script will pick up pendingPrompt on load
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
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;
  if (!FORGE_ORIGINS.some(o => tab.url.startsWith(o))) return;
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
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (!tab.url) return;
      if (!FORGE_ORIGINS.some(o => tab.url.startsWith(o))) return;
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
