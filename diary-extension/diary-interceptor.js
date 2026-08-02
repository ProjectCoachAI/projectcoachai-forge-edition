// diary-interceptor.js — Global network interceptor for all 8 AI providers
// Runs at document_start in MAIN world, before page scripts load
// Patches window.fetch to capture streaming AI responses

(function() {
  'use strict';

  if (window.__diaryInterceptorActive) return;
  window.__diaryInterceptorActive = true;

  // Storage for captured turns: { prompt: string, response: string }[]
  window.__diaryCapture = window.__diaryCapture || { turns: [], lastUrl: '' };

  // Text extractors per provider — extract clean text from SSE/JSON chunks
  // Each returns a string fragment or '' if not applicable
  function extractTextFromChunk(chunk, hostname) {
    try {
      // Claude: data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
      if (hostname.includes('claude.ai')) {
        var m = chunk.match(/"type"\s*:\s*"text_delta"[\s\S]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      // ChatGPT: data: {"choices":[{"delta":{"content":"..."}}]}
      if (hostname.includes('chatgpt.com')) {
        var m = chunk.match(/"delta"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      // Gemini: various JSON formats with "text" field
      if (hostname.includes('gemini.google.com')) {
        var m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      // Perplexity: data: {"text":"..."}
      if (hostname.includes('perplexity.ai')) {
        var m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      // Grok: data: {"result":{"response":{"token":"..."}}}
      if (hostname.includes('grok.com')) {
        var m = chunk.match(/"token"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      // DeepSeek: data: {"choices":[{"delta":{"content":"..."}}]}
      if (hostname.includes('deepseek.com')) {
        var m = chunk.match(/"delta"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      // Mistral: data: {"choices":[{"delta":{"content":"..."}}]}
      if (hostname.includes('mistral.ai')) {
        var m = chunk.match(/"delta"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      // Meta AI: various formats
      if (hostname.includes('meta.ai')) {
        var m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
    } catch(e) {}
    return '';
  }

  function isAIStreamingResponse(url, contentType) {
    if (!url) return false;
    var ct = (contentType || '').toLowerCase();
    var isStream = ct.includes('event-stream') || ct.includes('stream') || ct.includes('x-ndjson');
    if (isStream) return true;
    // Also capture JSON responses from known AI endpoints
    var u = url.toLowerCase();
    return (
      u.includes('/completion') || u.includes('/chat/') ||
      u.includes('/message') || u.includes('/generate') ||
      u.includes('/stream') || u.includes('/append') ||
      u.includes('/converse') || u.includes('/inference')
    ) && ct.includes('json');
  }

  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var hostname = window.location.hostname;

    return _origFetch.apply(this, arguments).then(function(response) {
      var contentType = response.headers.get('content-type') || '';

      if (!isAIStreamingResponse(url, contentType)) return response;

      // Clone response — MUST clone before consuming
      var clone = response.clone();

      // Process clone in background without blocking original
      (async function() {
        try {
          var reader = clone.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var accumulated = '';

          while (true) {
            var _ref = await reader.read();
            if (_ref.done) break;
            buffer += decoder.decode(_ref.value, { stream: true });

            // Process complete lines
            var lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line

            for (var line of lines) {
              line = line.trim();
              if (!line || line === 'data: [DONE]') continue;
              var data = line.startsWith('data: ') ? line.slice(6) : line;
              var text = extractTextFromChunk(data, hostname);
              if (text) accumulated += text;
            }
          }

          if (accumulated.length > 50) {
            // Store as latest response turn
            if (!window.__diaryCapture.turns) window.__diaryCapture.turns = [];
            window.__diaryCapture.turns.push({
              type: 'response',
              text: accumulated,
              url: window.location.href,
              ts: Date.now()
            });
            console.log('[Diary interceptor] Captured response:', accumulated.slice(0, 80));
          }
        } catch(e) {
          // Silent fail — don't break page functionality
        }
      })();

      return response; // return original unmodified
    });
  };

  // Also intercept XHR for providers that use it
  var _origXHR = window.XMLHttpRequest;
  // XHR interception omitted for now — all 8 providers confirmed using fetch

  console.log('[Diary interceptor] Active on', window.location.hostname);

})();
