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

// ── Priority 4: passive download-interception capture ──────────────────────
// Confirmed live (via a temporary diagnostic, since removed) that a
// provider's "Download" button triggers a real https:// download on the
// provider's OWN domain — not a blob: URL — meaning this extension can
// fetch the real file bytes directly, since host_permissions already
// covers every provider's own domain. This is the passive-interception
// design from the revised brief: react to a download the user genuinely,
// manually triggered themselves — no simulated clicks, no automation of
// a provider's own interface. Coverage is a deliberate, accepted trade-
// off: a file never personally downloaded stays as "Open original."
const MIME_TO_ATTACHMENT_TYPE = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/markdown': 'md',
  'text/x-python': 'py',
  'text/x-python-script': 'py',
  'application/x-python-code': 'py',
  'text/javascript': 'js',
  'application/javascript': 'js',
  'application/json': 'json',
  'text/csv': 'csv',
  'text/plain': 'txt'
};

// Many providers embed the real filename in a query param (ChatGPT uses
// `fn=`, double-URL-encoded — confirmed directly against a real captured
// URL). Decodes repeatedly but safely: stops as soon as decoding stops
// changing the string, so a name that legitimately contains a literal
// '%' is never over-decoded into something wrong.
function extractFilenameFromDownloadUrl(url) {
  try {
    const parsed = new URL(url);
    const candidateParams = ['fn', 'filename', 'name'];
    for (const param of candidateParams) {
      const raw = parsed.searchParams.get(param);
      if (raw) {
        let decoded = raw;
        for (let i = 0; i < 3; i++) {
          try {
            const next = decodeURIComponent(decoded);
            if (next === decoded) break;
            decoded = next;
          } catch(e) { break; }
        }
        return decoded;
      }
    }
    // Some providers (confirmed live: Claude's own /wiggle/download-file
    // endpoint) encode the file's full server-side PATH rather than just
    // its name — e.g. path=/mnt/user-data/outputs/rat_pack_summary.pdf.
    // This case genuinely matters, not just as a nice-to-have: with no
    // tracked attachment to fall back on (the "no Diary entry yet" case
    // below has nothing else to match against at all), failing to
    // extract a filename here means the whole pending-capture can't
    // happen — confirmed live as a real, reproduced bug before this was
    // added. Extract just the final path segment (the actual filename).
    const pathParam = parsed.searchParams.get('path');
    if (pathParam) {
      let decodedPath = pathParam;
      for (let i = 0; i < 3; i++) {
        try {
          const next = decodeURIComponent(decodedPath);
          if (next === decodedPath) break;
          decodedPath = next;
        } catch(e) { break; }
      }
      const segments = decodedPath.split('/').filter(Boolean);
      if (segments.length) return segments[segments.length - 1];
    }
  } catch(e) {}
  return null;
}

function normalizeForMatch(name) {
  return (name || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '').replace(/[^a-z0-9]/g, '');
}

// Matches a real download event against ONE specific, not-yet-hosted
// attachment already tracked on the matched Diary entry. Deliberately
// conservative: narrows by type (from mime) first, resolves immediately
// if that leaves exactly one candidate, and only falls back to filename
// comparison when genuinely needed to disambiguate multiple attachments
// of the same type on one entry. Returns null — never a guess — when the
// match is still ambiguous after that, since attaching bytes to the
// wrong tracked attachment would be worse than not attaching them at all.
function matchDownloadToAttachment(attachments, downloadItem) {
  const mime = (downloadItem.mime || '').split(';')[0].trim().toLowerCase();
  const typeFromMime = MIME_TO_ATTACHMENT_TYPE[mime];
  const urlFilename = extractFilenameFromDownloadUrl(downloadItem.url);
  const candidateName = urlFilename || downloadItem.filename;

  const pool = attachments.filter(function(a) {
    if (a.url) return false; // already captured previously
    if (typeFromMime && a.type !== typeFromMime) return false;
    return true;
  });

  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  if (candidateName) {
    const normalizedCandidate = normalizeForMatch(candidateName);
    const filenameMatch = pool.find(function(a) {
      return normalizeForMatch(a.filename) === normalizedCandidate;
    });
    if (filenameMatch) return filenameMatch;
  }
  return null;
}

// The 8 providers this extension actually supports — sourced directly
// from manifest.json's own content_scripts matches, the canonical list.
// Needed here specifically to scope the NEW "no entry yet" pending-
// capture path below: the existing "entry already exists" path is
// naturally scoped already (a saved Diary entry's own URL is always one
// of these 8 providers, since that's all Diary ever saves), but without
// this explicit check, the pending-capture path would otherwise try to
// upload EVERY download on the entire browser — a random file from an
// unrelated shopping site, etc. — which would be a serious scope,
// privacy, and cost overreach far beyond what this feature is for.
const AI_PROVIDER_HOSTNAMES = ['claude.ai', 'chatgpt.com', 'gemini.google.com', 'www.perplexity.ai', 'grok.com', 'chat.deepseek.com', 'chat.mistral.ai', 'www.meta.ai'];

function isFromSupportedProvider(referrer) {
  try {
    return AI_PROVIDER_HOSTNAMES.indexOf(new URL(referrer).hostname) !== -1;
  } catch (e) {
    return false;
  }
}

// Shared by both branches of the listener below — fetches a download's
// real bytes and returns them ready to send to the backend, or null
// (having already logged why) if anything about that failed. Factored
// out specifically because the "entry exists" and "no entry yet" paths
// both need this exact same fetch-and-encode step, just sending the
// result to a different endpoint afterward.
async function fetchDownloadBytes(item, label) {
  const fileResp = await fetch(item.url);
  if (!fileResp.ok) {
    console.warn('[Diary BG] Download-capture fetch failed:', fileResp.status, 'for', label);
    return null;
  }
  const blob = await fileResp.blob();
  if (blob.size > 25 * 1024 * 1024) {
    console.warn('[Diary BG] Download-capture skipped, file too large:', label);
    return null;
  }
  const buf = await blob.arrayBuffer();
  return { base64: arrayBufferToBase64(buf), contentType: blob.type || item.mime || 'application/octet-stream' };
}

chrome.downloads.onCreated.addListener(async function(item) {
  try {
    // TEMPORARY DIAGNOSTIC — every early-exit below was silent, making
    // it impossible to tell "listener never fired at all" apart from
    // "fired but exited early for some specific reason" (e.g. a
    // provider whose UI doesn't trigger the browser's native download
    // mechanism at all, vs. a genuine matching failure). Confirmed live
    // this ambiguity mattered: a real Perplexity download attempt
    // produced zero [Diary BG] output at all. To be removed once every
    // provider's actual behavior here is understood.
    console.log('[Diary BG] onCreated fired:', JSON.stringify({ referrer: item.referrer, url: item.url, mime: item.mime, filename: item.filename }));

    if (!item.referrer || !item.url) { console.log('[Diary BG] Skipped: no referrer or url'); return; }
    if (!isFromSupportedProvider(item.referrer)) { console.log('[Diary BG] Skipped: download not from a supported AI provider'); return; }

    const stored = await chrome.storage.local.get(['diary_token']);
    const token = stored.diary_token;
    if (!token) { console.log('[Diary BG] Skipped: not logged into Diary'); return; }

    const API = 'https://api.projectcoachai.com';

    const lookupResp = await fetch(API + '/api/diary/by-url?url=' + encodeURIComponent(item.referrer), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const lookupData = await lookupResp.json();

    if (lookupData.success && lookupData.entry) {
      // Existing path: an entry already exists — match this download
      // against its own tracked, not-yet-hosted attachments.
      const entry = lookupData.entry;
      const attachments = (entry.metadata && entry.metadata.attachments) || [];
      if (!attachments.length) { console.log('[Diary BG] Skipped: entry has no tracked attachments'); return; }

      const matched = matchDownloadToAttachment(attachments, item);
      if (!matched) { console.log('[Diary BG] Skipped: no matching tracked attachment for this download (or ambiguous)', JSON.stringify(attachments)); return; }

      // Fetch the real bytes promptly — the URL is very likely signed
      // and/or time-limited (confirmed live: ChatGPT's carries a `sig=`
      // parameter), so this happens immediately upon the download
      // event, not deferred.
      const fileData = await fetchDownloadBytes(item, matched.filename);
      if (!fileData) return;

      const captureResp = await fetch(API + '/api/diary/' + entry.id + '/capture-attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ data: fileData.base64, contentType: fileData.contentType, filename: matched.filename, type: matched.type })
      });
      const captureData = await captureResp.json();
      if (captureData.success) {
        console.log('[Diary BG] Captured downloaded attachment:', matched.filename);
      } else {
        console.warn('[Diary BG] Failed to capture downloaded attachment:', matched.filename, '—', captureData.error);
      }
    } else {
      // NEW path (Priority 4, revised): no entry exists yet — confirmed
      // live as a real, common sequence (download first, decide to save
      // afterward). There's nothing tracked to match against yet, so
      // filename/type are derived directly from the download itself
      // instead. Uploaded now regardless (the signed URL won't wait
      // around for the user to decide whether to save) and held as an
      // unclaimed "pending capture" — see adoptPendingCaptures on the
      // backend for how a later save picks this up automatically, and
      // this file's own comment for why nothing gets silently saved to
      // Diary here: that must stay the user's own, deliberate choice.
      const urlFilename = extractFilenameFromDownloadUrl(item.url) || item.filename;
      if (!urlFilename) { console.log('[Diary BG] Skipped: no entry yet, and no filename could be determined for this download'); return; }

      const mime = (item.mime || '').split(';')[0].trim().toLowerCase();
      let typeGuess = MIME_TO_ATTACHMENT_TYPE[mime];
      if (!typeGuess) {
        const extMatch = urlFilename.match(/\.([a-z0-9]+)$/i);
        typeGuess = extMatch ? extMatch[1].toLowerCase() : null;
      }
      if (!typeGuess) { console.log('[Diary BG] Skipped: no entry yet, and file type could not be determined'); return; }

      const fileData = await fetchDownloadBytes(item, urlFilename);
      if (!fileData) return;

      const pendingResp = await fetch(API + '/api/diary/pending-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ conversation_url: item.referrer, filename: urlFilename, type: typeGuess, data: fileData.base64, contentType: fileData.contentType })
      });
      const pendingData = await pendingResp.json();
      if (pendingData.success) {
        console.log('[Diary BG] Pending-captured (no entry yet):', urlFilename);
      } else {
        console.warn('[Diary BG] Failed to pending-capture:', urlFilename, '—', pendingData.error);
      }
    }
  } catch (e) {
    console.warn('[Diary BG] Download-capture error:', e.message);
  }
});

// Converts an ArrayBuffer to a base64 string in fixed-size chunks —
// String.fromCharCode(...bytes) on a large, single array can exceed the
// JS engine's own argument-count limit and throw; chunking avoids that
// regardless of source buffer size.
function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(''));
}

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

      // NOTE: images are sent here as plain, original provider URLs —
      // native re-hosting to our own storage (Priority 4) happens
      // entirely SERVER-SIDE now, not here. An earlier version fetched
      // and re-uploaded each image directly from this extension, which
      // required broadening this extension's own host_permissions to
      // essentially every website — a scary, all-sites Chrome
      // permission prompt shown to every user, for a feature a normal
      // AI chatbot's own image display never needs any permission for
      // at all. A Node.js server-side fetch() isn't subject to CORS or
      // any browser-enforced permission model whatsoever, so moving
      // this to the backend (see rehostImagesAndPatch in
      // backend/routes/diary.js) gets the exact same result — images
      // genuinely, natively hosted in Diary — without ever showing
      // anyone that prompt.
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
          body: JSON.stringify({ content: patchContent, prompt: msg.prompt, metadata: { url: msg.url, images: msg.images || [], attachments: msg.attachments || [] } })
        });
        data = await pR.json();
        data.updated = true;
      } else {
        // Step 2b: POST - create new entry
        const pR = await fetch(API + '/api/diary', {
          method: 'POST',
          headers,
          body: JSON.stringify({ source: msg.source, prompt: msg.prompt, content: msg.content, metadata: { saved_from: 'diary_extension', url: msg.url, images: msg.images || [], attachments: msg.attachments || [] } })
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
