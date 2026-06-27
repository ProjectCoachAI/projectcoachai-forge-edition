// Diary Extension — Isolated World Bridge
window.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== '__DIARY_TO_EXT__') return;
  var payload = e.data.payload;
  if (!payload) return;

  if (payload.type === 'GET_AUTH_TOKEN') {
    chrome.runtime.sendMessage({ type: 'GET_TOKEN_BG' }, function(r) {
      window.postMessage({ type: '__DIARY_AUTH_TOKEN__', token: r ? r.token : null }, '*');
    });
  }

  if (payload.type === 'SAVE_TO_DIARY') {
    chrome.runtime.sendMessage(payload, function() {});
  }
});

chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.type === 'DIARY_SAVE_RESULT') {
    window.postMessage({ type: '__DIARY_SAVE_RESULT__', success: msg.success, error: msg.error }, '*');
  }
});
