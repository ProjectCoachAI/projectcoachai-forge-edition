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

          var _eidx = accumulated.indexOf('entity[');
          if (_eidx >= 0) {
            console.log('[Diary interceptor] RAW around entity[:', accumulated.slice(Math.max(0,_eidx-20), _eidx+200));
          } else {
            console.log('[Diary interceptor] RAW (no entity[):', accumulated.slice(0,200));
          }
          // Global: strip machine-readable metadata annotations from any provider
          accumulated = accumulated
            .replace(/image_group\{[\s\S]*?\}/g, '')
            .replace(/entity\[[\s\S]*?\]/g, '')
            .replace(/citeturn\d+\w*/g, '')
            .replace(/turn\d+search\d+/g, '')
            .replace(/\s*\bcite\b/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
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
