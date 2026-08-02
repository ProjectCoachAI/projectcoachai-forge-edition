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
        // ChatGPT /f/conversation patch format: {"p":"/message/content/parts/0","o":"append","v":"token"}
        var m = chunk.match(/"o"\s*:\s*"append"[\s\S]*?"v"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"v"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"o"\s*:\s*"append"/);
        if (!m) m = chunk.match(/"o"\s*:\s*"add"[\s\S]*?"v"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"delta"\s*:\s*\{[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
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

          // Global: strip machine-readable metadata annotations from any provider
          // Use a bracket-counting scanner for entity[] to handle all formats
          accumulated = (function(s) {
            // Scanner: replace entity[...] with display name; remove image_group{...}
            var out = ''; var i = 0;
            while (i < s.length) {
              if (s.slice(i, i+7) === 'entity[') {
                // Find closing ] with depth counting
                var depth = 0; var j = i + 7;
                while (j < s.length) {
                  if (s[j] === '[') depth++;
                  else if (s[j] === ']') { if (depth === 0) { j++; break; } depth--; }
                  j++;
                }
                // Extract display name: 2nd quoted field inside entity[...]
                var inner = s.slice(i + 7, j - 1);
                var parts = inner.match(/"([^"]*)"/g) || [];
                out += parts.length >= 2 ? parts[1].replace(/"/g, '') : '';
                i = j;
              } else if (s.slice(i, i+12) === 'image_group{') {
                // Find closing } with depth counting
                var depth = 0; var j = i + 12;
                while (j < s.length) {
                  if (s[j] === '{') depth++;
                  else if (s[j] === '}') { if (depth === 0) { j++; break; } depth--; }
                  j++;
                }
                i = j; // skip image_group entirely
              } else { out += s[i]; i++; }
            }
            s = out;
            s = s.replace(/citeturn\d+\w*/g, '');
            s = s.replace(/turn\d+search\d+/g, '');
            s = s.replace(/\s*\bcite\b/g, '');
            s = s.replace(/finished_successfully/g, '');
            s = s.replace(/\n{3,}/g, '\n\n');
            return s.trim();
          })(accumulated);
          if (accumulated.length > 50) {
            window.__diaryCapture.turns.push({
              type: 'response',
              text: accumulated,
              url: pageUrl,
              ts: Date.now()
            });
            console.log('[Diary interceptor] Captured response:', accumulated.slice(0, 80));
            // Signal diary-content.js to show save button
            window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
              detail: { url: pageUrl, length: accumulated.length }
            }));
          }
        } catch(e) {}
      })();

      return response;
    });
  };

  console.log('[Diary interceptor] Active on', window.location.hostname);
})();
