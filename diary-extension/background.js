// Diary Extension — Background Service Worker
// Handles SAVE_TO_DIARY and GET_AUTH_TOKEN messages

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {

  if (msg.type === 'SAVE_TO_DIARY') {
    fetch('https://api.projectcoachai.com/api/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + msg.token },
      body: JSON.stringify({
        source: msg.source,
        prompt: msg.prompt,
        content: msg.content,
        metadata: { saved_from: 'diary_extension', url: msg.url }
      })
    }).then(function(res) { return res.json(); })
      .then(function(data) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'DIARY_TO_PAGE',
          data: { type: '__DIARY_EXT_DATA__', savedToDiary: true, success: data.success, error: data.error }
        });
      })
      .catch(function(e) {
        chrome.tabs.sendMessage(sender.tab.id, {
          type: 'DIARY_TO_PAGE',
          data: { type: '__DIARY_EXT_DATA__', savedToDiary: true, success: false, error: e.message }
        });
      });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'GET_TOKEN_BG') {
    chrome.storage.local.get(['diary_token'], function(r) {
      sendResponse({ token: r.diary_token || null });
    });
    return true;
  }

  if (msg.type === 'SET_TOKEN_BG') {
    chrome.storage.local.set({ diary_token: msg.token }, function() {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'CLEAR_TOKEN_BG') {
    chrome.storage.local.remove(['diary_token'], function() {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }
});
