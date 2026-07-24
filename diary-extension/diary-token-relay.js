// Diary Extension — Token Relay
// Runs on diary.projectcoachai.com to capture and store the auth token

window.addEventListener('message', function(e) {
  if (e.source !== window) return;
  if (!e.data || e.data.type !== '__DIARY_TO_EXT__') return;
  var payload = e.data.payload;
  if (!payload) return;
  if (payload.type === 'SET_STORAGE' && payload.key === 'diary_token' && payload.value) {
    chrome.storage.local.set({ diary_token: payload.value }, function() {
      console.log('[Diary] Token stored from website');
    });
  }
  if (payload.type === 'SET_PENDING_PROMPT' && payload.prompt) {
    chrome.runtime.sendMessage({
      type: 'SET_PENDING_PROMPT',
      payload: { prompt: payload.prompt, source: payload.source, ts: Date.now() }
    }, function(r) {
      // Confirm to page so it opens the provider tab
      window.postMessage({ type: '__DIARY_PROMPT_STORED__' }, '*');
    });
  }
});
