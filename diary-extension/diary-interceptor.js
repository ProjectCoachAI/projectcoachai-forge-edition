// diary-interceptor.js — Global network interceptor for all 8 AI providers
// Runs at document_start in MAIN world, before page scripts load
// Patches window.fetch to capture streaming AI responses

(function() {
  'use strict';

  if (window.__diaryInterceptorActive) return;
  window.__diaryInterceptorActive = true;

  window.__diaryCapture = window.__diaryCapture || { turns: [] };

  function extractTextFromChunk(chunk, hostname) {
    try {
      if (hostname.includes('claude.ai')) {
        var m = chunk.match(/"type"\s*:\s*"text_delta"[\s\S]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (hostname.includes('chatgpt.com')) {
        var m = chunk.match(/"delta"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (hostname.includes('gemini.google.com')) {
        var m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (hostname.includes('perplexity.ai')) {
        var m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (hostname.includes('grok.com')) {
        var m = chunk.match(/"token"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (hostname.includes('deepseek.com')) {
        var m = chunk.match(/"delta"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (hostname.includes('mistral.ai')) {
        var m = chunk.match(/"delta"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
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
    if (ct.includes('event-stream') || ct.includes('x-ndjson') || ct.includes('octet-stream')) return true;
    if (!ct.includes('json')) return false;
    var u = url.toLowerCase();
    return u.includes('completion') || u.includes('conversation') ||
           u.includes('message') || u.includes('generate') ||
           u.includes('stream') || u.includes('append') ||
           u.includes('converse') || u.includes('inference') ||
           u.includes('chat') || u.includes('query') ||
           u.includes('prompt') || u.includes('response');
  }

  var _origFetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var hostname = window.location.hostname;
    var pageUrl = window.location.href;

    return _origFetch.apply(this, arguments).then(function(response) {
      var contentType = response.headers.get('content-type') || '';
      if (!isAIStreamingResponse(url, contentType)) return response;

      var clone = response.clone();

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
            var lines = buffer.split('\n');
            buffer = lines.pop();
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line || line === 'data: [DONE]') continue;
              var data = line.startsWith('data: ') ? line.slice(6) : line;
              var text = extractTextFromChunk(data, hostname);
              if (text) accumulated += text;
            }
          }

          if (accumulated.length > 50) {
            window.__diaryCapture.turns.push({
              type: 'response',
              text: accumulated,
              url: pageUrl,
              ts: Date.now()
            });
            console.log('[Diary interceptor] Captured response:', accumulated.slice(0, 80));
          }
        } catch(e) {}
      })();

      return response;
    });
  };

  console.log('[Diary interceptor] Active on', window.location.hostname);
})();
