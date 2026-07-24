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
    console.log('[Diary relay] storing pending prompt:', payload.prompt.slice(0,50));
    chrome.runtime.sendMessage({
      type: 'SET_PENDING_PROMPT',
      payload: {
        text: payload.prompt,
        prompt: payload.prompt,
        source: payload.source,
        providers: ['claude','chatgpt','gemini','perplexity','mistral','deepseek','grok','meta'],
        timestamp: Date.now(),
        ts: Date.now()
      }
    }, function(r) {
      if (chrome.runtime.lastError) {
        console.warn('[Diary relay] sendMessage error:', chrome.runtime.lastError.message);
      } else {
        console.log('[Diary relay] stored OK:', JSON.stringify(r));
      }
      window.postMessage({ type: '__DIARY_PROMPT_STORED__' }, '*');
    });
  }
});
