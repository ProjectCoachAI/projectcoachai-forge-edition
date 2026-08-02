// diary-interceptor.js
// Patches window.fetch at document_start (MAIN world) to capture AI responses.
// Stores captured turns in window.__diaryCapture.turns
// Fires '__diaryInterceptorCapture' event when a response is complete.

(function() {
  'use strict';
  if (window.__diaryInterceptorActive) return;
  window.__diaryInterceptorActive = true;
  window.__diaryCapture = { turns: [] };

  // ── Per-provider SSE/JSON text extraction ──────────────────────────────────
  function extractText(chunk, host) {
    try {
      if (host.includes('claude.ai')) {
        var m = chunk.match(/"type"\s*:\s*"text_delta"[\s\S]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('chatgpt.com')) {
        var m = chunk.match(/"o"\s*:\s*"append"[\s\S]*?"v"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"v"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"o"\s*:\s*"append"/);
        if (!m) m = chunk.match(/"o"\s*:\s*"add"[\s\S]*?"v"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"delta"[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('gemini.google.com') || host.includes('perplexity.ai') || host.includes('meta.ai')) {
        var m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('grok.com')) {
        var m = chunk.match(/"token"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('deepseek.com') || host.includes('mistral.ai')) {
        var m = chunk.match(/"delta"[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
    } catch(e) {}
    return '';
  }

  // ── Detect AI streaming responses ──────────────────────────────────────────
  function isAIStream(url, ct) {
    if (!url) return false;
    ct = (ct || '').toLowerCase();
    if (ct.includes('event-stream') || ct.includes('x-ndjson')) return true;
    if (!ct.includes('json')) return false;
    var u = url.toLowerCase();
    return /completion|conversation|message|generate|stream|append|converse|inference|chat|query|prompt|response/.test(u);
  }

  // ── Global cleanup: remove machine-readable annotations ───────────────────
  function cleanText(s) {
    // Bracket-counting scanner: replace entity[...] with display name, remove image_group{...}
    var out = ''; var i = 0;
    while (i < s.length) {
      if (s.slice(i, i+7) === 'entity[') {
        var depth = 0; var j = i + 7;
        while (j < s.length) {
          if (s[j] === '[') depth++;
          else if (s[j] === ']') { if (depth === 0) { j++; break; } depth--; }
          j++;
        }
        var inner = s.slice(i + 7, j - 1);
        var parts = inner.match(/"([^"]*)"/g) || [];
        out += parts.length >= 2 ? parts[1].replace(/"/g, '') : '';
        i = j;
      } else if (s.slice(i, i+12) === 'image_group{') {
        var depth = 0; var j = i + 12;
        while (j < s.length) {
          if (s[j] === '{') depth++;
          else if (s[j] === '}') { if (depth === 0) { j++; break; } depth--; }
          j++;
        }
        i = j;
      } else { out += s[i]; i++; }
    }
    return out
      .replace(/citeturn\d+\w*/g, '')
      .replace(/turn\d+search\d+/g, '')
      .replace(/\s*\bcite\b/g, '')
      .replace(/finished_successfully/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ── Patch window.fetch ─────────────────────────────────────────────────────
  var _fetch = window.fetch;
  window.fetch = function(input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var host = window.location.hostname;
    var pageUrl = window.location.href; // capture at request time

    return _fetch.apply(this, arguments).then(function(response) {
      var ct = response.headers.get('content-type') || '';
      if (host.includes('gemini.google.com')) console.log('[Gemini fetch]', url.slice(0,100), '|', ct.slice(0,40));
      if (!isAIStream(url, ct)) return response;

      var clone = response.clone();
      (async function() {
        try {
          var reader = clone.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var accumulated = '';

          while (true) {
            var ref = await reader.read();
            if (ref.done) break;
            buffer += decoder.decode(ref.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop();
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line || line === 'data: [DONE]') continue;
              var data = line.startsWith('data: ') ? line.slice(6) : line;
              var text = extractText(data, host);
              if (text) accumulated += text;
            }
          }

          accumulated = cleanText(accumulated);

          if (accumulated.length > 50) {
            window.__diaryCapture.turns.push({
              text: accumulated,
              url: pageUrl,
              ts: Date.now()
            });
            console.log('[Diary interceptor] Captured:', accumulated.slice(0, 80));
            window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
              detail: { url: pageUrl }
            }));
          }
        } catch(e) {}
      })();

      return response;
    });
  };

  // ── Patch XMLHttpRequest (for providers using XHR instead of fetch) ──────
  var _XHROpen = XMLHttpRequest.prototype.open;
  var _XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__xhrUrl = (typeof url === 'string') ? url : '';
    return _XHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    var host = window.location.hostname;
    var pageUrl = window.location.href;

    xhr.addEventListener('load', function() {
      try {
        var ct = xhr.getResponseHeader('content-type') || '';
        var url = xhr.__xhrUrl || '';
        if (!isAIStream(url, ct)) return;
        var text = xhr.responseText || '';
        var lines = text.split('\n');
        var accumulated = '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line === 'data: [DONE]') continue;
          var data = line.startsWith('data: ') ? line.slice(6) : line;
          var t = extractText(data, host);
          if (t) accumulated += t;
        }
        accumulated = cleanText(accumulated);
        if (accumulated.length > 50) {
          window.__diaryCapture.turns.push({ text: accumulated, url: pageUrl, ts: Date.now() });
          console.log('[Diary interceptor XHR] Captured:', accumulated.slice(0, 80));
          window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', { detail: { url: pageUrl } }));
        }
      } catch(e) {}
    });

    return _XHRSend.apply(this, arguments);
  };

  console.log('[Diary interceptor] Active on', window.location.hostname);
})();
