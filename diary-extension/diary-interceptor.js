// diary-interceptor.js
// Global network interceptor - patches window.fetch AND XMLHttpRequest
// Runs at document_start in MAIN world before any page scripts load

(function() {
  'use strict';
  if (window.__diaryInterceptorActive) return;
  window.__diaryInterceptorActive = true;
  window.__diaryCapture = { turns: [] };

  // NOTE: duplicated from diary-content.js's boldQuestion() — this file
  // has no shared scope with it (separate content scripts, injected
  // independently), so the same small marking logic is kept in sync
  // here directly. Confirmed live as the actual root cause of a
  // universal, cross-provider bug: historySeed (built in THIS file,
  // shared code across every provider) was still producing unmarked
  // "**text**" for user questions, even after diary-content.js's own 7
  // insertion sites were all correctly updated — explaining why the
  // very first question in a conversation (handled by diary-content.js's
  // live-capture path) correctly got a bubble, while later questions
  // (served from this file's historySeed) did not, identically across
  // all 8 providers, since this mechanism is shared and provider-
  // agnostic. Uses the same invisible Unicode separator (U+2063) as the
  // diary-content.js version, so both files produce byte-identical
  // markers that diary-web's renderWithBubbles can detect uniformly,
  // regardless of which file's capture path a given question came from.
  function boldQuestion(text) {
    if (!text) return text;
    var TITLE_MARK = '\u2063';
    return TITLE_MARK + '**' + text + '**' + TITLE_MARK;
  }

  function extractText(chunk, host, state) {
    try {
      if (host.includes('claude.ai')) {
        var m = chunk.match(/"type"\s*:\s*"text_delta"[\s\S]*?"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('chatgpt.com')) {
        var m = chunk.match(/"o"\s*:\s*"append"[\s\S]*?"v"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (!m) m = chunk.match(/"v"\s*:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?"o"\s*:\s*"append"/);
        if (!m) m = chunk.match(/"delta"[\s\S]*?"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('deepseek.com')) {
        var m = chunk.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('grok.com')) {
        try { var _o=JSON.parse(chunk); return (_o.result&&_o.result.response&&_o.result.response.token)||_o.token||''; } catch(_e) {}
        var m=chunk.match(/"token"\s*:\s*"((?:[^"\\]|\\.)*)"/); return m?JSON.parse('"'+m[1]+'"'):'';
      }
      if (host.includes('meta.ai')) {
        var m = chunk.match(/"streaming_text"\s*:\s*"((?:[^"\\]|\\.)*)"/) || chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/) ;
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
      if (host.includes('mistral.ai')) {
        // NOTE: rewritten a second time — the first fix correctly excluded
        // reasoning text from the initial "add" operation (which alone
        // carries the _context.type:"reasoning" marker), but "append"
        // operations — how streamed text actually arrives, chunk by
        // chunk, for BOTH reasoning and real answer text — carry no such
        // marker themselves. Confirmed live: reasoning text was still
        // leaking into saved content, since a stateless, per-chunk parser
        // has no way to know an append targeting e.g. /contentChunks/0/text
        // is continuing the reasoning chunk rather than the real answer.
        // Fixed by tracking, per stream (via the state object passed in
        // from processLines, reset fresh for every new response), WHICH
        // contentChunks index was originally marked as reasoning when it
        // was first added — every later append to that same index is then
        // correctly excluded too. Verified via direct simulation of a
        // realistic multi-chunk stream (reasoning text arriving via
        // multiple appends, not just one) before being wired in here.
        try {
          if (!state.mistralReasoningIndices) state.mistralReasoningIndices = {};
          var reasoningIndices = state.mistralReasoningIndices;
          var out = '';
          var jsonPart = chunk.replace(/^\d+:/, '');
          if (jsonPart === 'null' || !jsonPart.trim()) return '';
          var o = JSON.parse(jsonPart);
          var patches = o && o.json && o.json.patches;
          if (Array.isArray(patches)) {
            patches.forEach(function(p) {
              var m = /\/contentChunks\/(\d+)(\/text)?$/.exec(p.path || '');
              var idx = m ? m[1] : null;
              if (p.op === 'add' && p.value && typeof p.value === 'object' && p.value.type === 'text' && idx !== null) {
                var isReasoning = p.value._context && p.value._context.type === 'reasoning';
                if (isReasoning) reasoningIndices[idx] = true;
                if (!isReasoning && typeof p.value.text === 'string') out += p.value.text;
              } else if (p.op === 'append' && idx !== null && typeof p.value === 'string') {
                if (!reasoningIndices[idx]) out += p.value;
              } else if (p.op === 'replace' && p.path === '/contentChunks' && Array.isArray(p.value)) {
                p.value.forEach(function(c, i) {
                  var isReasoning = c._context && c._context.type === 'reasoning';
                  if (isReasoning) reasoningIndices[i] = true;
                  if (!isReasoning && c.type === 'text' && typeof c.text === 'string') out += c.text;
                });
              }
            });
          }
          return out;
        } catch(_e) { return ''; }
      }
      if (host.includes('perplexity.ai')) {
        try { var _o=JSON.parse(chunk.replace(/^data:\s*/,'')); return _o.text||_o.answer||''; } catch(_e) {}
        var m=chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/) || chunk.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/); return m?JSON.parse('"'+m[1]+'"'):'';
      }
      if (host.includes('gemini.google.com')) {
        var m = chunk.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/) ;
        return m ? JSON.parse('"' + m[1] + '"') : '';
      }
    } catch(e) {}
    return '';
  }

  function isAIStream(url, ct) {
    if (!url) return false;
    ct = (ct || '').toLowerCase();
    if (ct.includes('event-stream') || ct.includes('x-ndjson')) return true;
    if (!ct.includes('json')) return false;
    var u = url.toLowerCase();
    return /completion|conversation|message|generate|stream|append|converse|inference|chat|query|prompt|response/.test(u);
  }

  function cleanText(s) {
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
      .replace(/[-–]\s*(?:\d+\s+)+[-–]/g, '')
      .replace(/\[\d+\]/g, '')
      .replace(/^Recognized .{0,100}$/gm, '')
      .replace(/^Searched the web$/gm, '')
      .replace(/^Read \d+ web pages?$/gm, '')
      .replace(/^Worked for \d+s$/gm, '')
      .replace(/maps\.apple[^\s]*/g, '')
      .replace(/\+\d+\s*$/gm, '')
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  function storeTurn(accumulated, pageUrl) {
    accumulated = cleanText(accumulated);
    if (accumulated.length < 50) return;
    // NOTE: promptCountAtCapture added — confirmed live it was completely
    // missing (undefined) on every turn stored via this path, breaking the
    // interleave logic's position-based tagging (diary-content.js, a
    // separate file, never touches this one). Uses the same principle —
    // this turn's own position in window.__diaryCapture.turns at the
    // moment it's pushed — computed here directly since that array is
    // already shared between both files.
    window.__diaryCapture.turns.push({ text: accumulated, url: pageUrl, ts: Date.now(), promptCountAtCapture: window.__diaryCapture.turns.length + 1 });
    console.log('[Diary interceptor] Captured:', accumulated.slice(0, 80));
    window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', { detail: { url: pageUrl } }));
  }

  // ── Claude.ai conversation-history endpoint ────────────────────────────────
  var HISTORY_URL_RE = /\/chat_conversations\/[0-9a-f-]{20,}(\?|$)/i;

  function parseHistorySeed(json) {
    try {
      var messages = json && json.chat_messages;
      if (!Array.isArray(messages) || !messages.length) return '';
      var parts = [];
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        var content = m && m.content;
        if (!Array.isArray(content)) continue;
        var text = '';
        for (var j = 0; j < content.length; j++) {
          if (content[j] && content[j].type === 'text' && typeof content[j].text === 'string') {
            // NOTE: citations now inserted AT THEIR ACTUAL POSITION within
            // this block's own text, not appended after the whole block —
            // confirmed live this was a real, meaningful regression from
            // the first version of this fix: a whole response (all its
            // paragraphs and bullet points together) is typically ONE
            // single text block, so appending every citation after that
            // one block's full text dumped all of them together at the
            // very end of the entire answer, not near the specific
            // sentences they actually support — visibly different from
            // how Claude's own page places each citation directly after
            // its claim. Each citation's own "end_index" is a real
            // character offset into THIS block's text specifically
            // (confirmed schema). Inserted by processing citations in
            // descending end_index order, so each insertion happens
            // before any citation with a smaller offset shifts the
            // string length — otherwise later insertions would land at
            // the wrong position after an earlier one already changed
            // the string. Deduplicates by URL+POSITION together, NOT url
            // alone — confirmed live as a real, second bug: the same
            // source page is often cited more than once across a single
            // answer, for genuinely different claims at different
            // positions (e.g. one sentence and, later, an unrelated
            // bullet point both citing the same report). Deduping by url
            // alone silently discarded the EARLIER of the two — the
            // exact, reported symptom of a citation appearing to vanish
            // from where it belonged while resurfacing, seemingly
            // misplaced, further down the text. Verified via direct
            // simulation reproducing that precise symptom before fixing.
            var blockText = content[j].text;
            var citations = content[j].citations;
            if (Array.isArray(citations) && citations.length) {
              // TEMPORARY DIAGNOSTIC — investigating a stray line break
              // between two adjacent citations — logs the exact, raw
              // text around the shared position, to see whether it's
              // already present in Claude's own data or introduced by
              // this code. To be removed once resolved.
              console.log('[Diary DIAG] Raw text around position 419:', JSON.stringify(blockText.slice(400, 440)));
              // NOTE: for citations tied on the exact same end_index
              // (confirmed live: two citations both supporting the same
              // sentence, inserted at the identical position), sorts by
              // ORIGINAL array index descending as a tiebreaker — since
              // insertions happen in this processing order, and each new
              // insertion at a shared position lands BEFORE whatever was
              // already inserted there, processing the tied group in
              // reverse means the first-in-array citation is inserted
              // LAST, ending up closest to the original text — i.e.
              // first in final reading order, matching how the two
              // citations originally appeared. Confirmed live this was a
              // real, second bug: two simultaneous citations were
              // rendering in reversed order from the original data.
              // Verified via direct simulation of this exact tie before
              // fixing.
              var withIndex = citations.map(function(c, i) { return { c: c, origIdx: i }; });
              var sorted = withIndex.slice().sort(function(a, b) {
                var aEnd = (a.c && a.c.end_index) || 0;
                var bEnd = (b.c && b.c.end_index) || 0;
                if (bEnd !== aEnd) return bEnd - aEnd;
                return b.origIdx - a.origIdx;
              });
              var seenAtPosition = {};
              sorted.forEach(function(entry) {
                var c = entry.c;
                if (!c || !c.url || typeof c.end_index !== 'number') return;
                var dedupKey = c.url + '|' + c.end_index;
                if (seenAtPosition[dedupKey]) return;
                seenAtPosition[dedupKey] = true;
                // NOTE: prioritizes the specific article/page title over
                // the generic site name — confirmed live via user feedback
                // that showing site_name first made two genuinely
                // different sources (two different reports, both from
                // gminsights.com) display as identical, indistinguishable
                // "Global Market Insights" entries in the Sources list.
                // NOTE: encodes BOTH the site name and the full article
                // title into one compound label, separated by U+241F (a
                // rare, invisible-ish control-picture character, same
                // category as other private-use markers already in this
                // codebase) — confirmed via a direct, side-by-side
                // comparison against Claude's own live page that it uses
                // the SHORT site name for the compact, inline citation
                // pill (e.g. "Global Market Insights"), but the fuller
                // article title is what's actually useful in the
                // separate, already-confirmed-good Sources list. A
                // single shared label couldn't serve both purposes at
                // once — stripCitations() in diary-content.js splits
                // this back into its two parts.
                var siteName = (c.metadata && c.metadata.site_name) || c.title || c.url;
                var fullTitle = c.title || (c.metadata && c.metadata.site_name) || c.url;
                var faviconUrl = (c.metadata && c.metadata.favicon_url) || '';
                // NOTE: extended to a third part, the favicon/logo URL —
                // confirmed via direct user request to show the source's
                // logo beneath the title, matching Claude's own hover
                // popup. Already-confirmed schema: c.metadata.favicon_url.
                var label = siteName + '\u241F' + fullTitle + '\u241F' + faviconUrl;
                var link = ' [' + label + '](' + c.url + ')';
                var idx = Math.min(c.end_index, blockText.length);
                blockText = blockText.slice(0, idx) + link + blockText.slice(idx);
              });
            }
            text += blockText;
          }
        }
        text = text.trim();
        if (!text) continue;
        if (m.sender === 'human') {
          parts.push(boldQuestion(text.slice(0, 2000)));
        } else {
          parts.push(text);
        }
      }
      return parts.join('\n\n');
    } catch(e) { return ''; }
  }

  // NOTE: separate, companion function to parseHistorySeed() above,
  // extracting real, meaningful images the same way citations were just
  // added — confirmed schema via direct DevTools inspection: an
  // image_search tool's tool_result block contains a nested content
  // array, where one entry has type "image_gallery" and its own images
  // array (each with a real url, title, source). Deliberately only reads
  // the primary "images" array, not the sibling "spare_images" one —
  // confirmed live that Claude's own page only actually displays the
  // former, so this follows the same "don't capture what the person
  // themselves can't see" principle already applied elsewhere in this
  // project (e.g. Gemini's hidden code blocks). Deduplicates by URL, in
  // case the same source image appears more than once across a
  // conversation. Verified via direct simulation against the real,
  // confirmed schema before applying here.
  function parseHistorySeedImages(json) {
    var urls = [];
    try {
      var messages = json && json.chat_messages;
      if (!Array.isArray(messages)) return urls;
      var seen = {};
      messages.forEach(function(m) {
        var content = m && m.content;
        if (!Array.isArray(content)) return;
        content.forEach(function(block) {
          if (block && block.type === 'tool_result' && Array.isArray(block.content)) {
            block.content.forEach(function(inner) {
              if (inner && inner.type === 'image_gallery' && Array.isArray(inner.images)) {
                inner.images.forEach(function(img) {
                  if (img && img.url && !seen[img.url]) {
                    seen[img.url] = true;
                    urls.push(img.url);
                  }
                });
              }
            });
          }
        });
      });
    } catch(e) {}
    return urls;
  }

  // ── ChatGPT conversation-history endpoint ──────────────────────────────────
  // GET /backend-api/conversation/{uuid} returns the full existing thread as a
  // tree (mapping[id] = {message, parent, children}), not a streaming
  // completion. Confirmed shape (verified via live DevTools inspection):
  //   { mapping: { "<id>": { message: {
  //       author: { role: "user"|"assistant" },
  //       content: { content_type: "text", parts: ["..."] },
  //       create_time: <unix ts>
  //   }, parent, children } } }
  // Messages form a tree via parent/children, but create_time is sufficient
  // to sort into correct chronological order without walking the tree.
  var CHATGPT_HISTORY_URL_RE = /\/backend-api\/conversation\/[0-9a-f-]{20,}(\?|$)/i;

  function parseChatGPTHistorySeed(json) {
    try {
      var mapping = json && json.mapping;
      if (!mapping || typeof mapping !== 'object') return '';
      // NOTE: create_time is NOT reliable for ordering — verified against real
      // data where an assistant reply's create_time was earlier than the user
      // message it replied to. Instead, walk backwards via parent links from
      // current_node (the active branch's tip) to the root. This also
      // correctly skips any abandoned/regenerated branches.
      var startId = json.current_node;
      var chain = [];
      var seen = {};
      var cur = startId;
      var guard = 0;
      while (cur && mapping[cur] && !seen[cur] && guard < 5000) {
        seen[cur] = true;
        chain.push(cur);
        cur = mapping[cur].parent;
        guard++;
      }
      chain.reverse(); // root-to-tip order
      var parts2 = [];
      for (var i = 0; i < chain.length; i++) {
        var node = mapping[chain[i]];
        var msg = node && node.message;
        if (!msg || !msg.content || msg.content.content_type !== 'text') continue;
        var role = msg.author && msg.author.role;
        if (role !== 'user' && role !== 'assistant') continue;
        var parts = msg.content.parts;
        if (!Array.isArray(parts)) continue;
        var text = parts.filter(function(p){ return typeof p === 'string'; }).join('\n').trim();
        if (!text) continue;
        var cleaned = cleanText(text); // reuse existing entity[...]/image_group{...} stripper
        if (!cleaned) continue;
        parts2.push(role === 'user' ? boldQuestion(cleaned.slice(0,2000)) : cleaned);
      }
      return parts2.join('\n\n');
    } catch(e) { return ''; }
  }

  function processLines(lines, host, state) {
    var accumulated = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line || line === 'data: [DONE]') continue;
      var data = line.startsWith('data: ') ? line.slice(6) : line;
      var text = extractText(data, host, state);
      if (text) accumulated += text;
    }
    return accumulated;
  }

  // ── Patch URL.createObjectURL (Priority 4, revised) ──────────────────────
  // Provider-generated file downloads sometimes use a blob: URL rather
  // than a real, fetchable https:// link (confirmed live: Grok's own
  // "Download" button does this). A blob: URL only ever exists within
  // the exact browsing context that created it — not this extension's
  // background service worker, not our own backend server, regardless
  // of any permission or cookie — so there is genuinely no way to
  // recover its bytes from anywhere except right here, in the same
  // MAIN-world context the page itself runs in. This is deliberately
  // NOT click-simulation (the mechanism explicitly rejected earlier):
  // it never triggers, fakes, or automates any user action at all — it
  // only passively observes a real Blob the page's own code already,
  // genuinely creates on its own, the same category of thing this
  // file's own window.fetch patch already does for conversation history.
  // Cached by blob URL string so a later, real download event (chrome.
  // downloads.onCreated, in background.js, a separate context) can ask
  // — via the existing isolated-world relay — for this exact blob's
  // real bytes after the fact.
  var _blobCache = new Map();
  var _createObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function(obj) {
    var blobUrl = _createObjectURL(obj);
    try {
      if (obj instanceof Blob) _blobCache.set(blobUrl, obj);
    } catch(e) {}
    return blobUrl;
  };

  // Responds to a request (relayed from background.js, via the isolated
  // world) for a specific, previously-cached blob's real bytes. Only
  // ever looks up a blob this SAME page already created and cached
  // above — never fetches, opens, or generates anything new.
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== '__DIARY_GET_BLOB_DATA__') return;
    var blobUrl = event.data.blobUrl;
    var blob = _blobCache.get(blobUrl);
    if (!blob) {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'BLOB_DATA_RESPONSE', blobUrl: blobUrl, success: false } }, '*');
      return;
    }
    blob.arrayBuffer().then(function(buf) {
      var bytes = new Uint8Array(buf);
      var chunkSize = 0x8000;
      var chunks = [];
      for (var i = 0; i < bytes.length; i += chunkSize) {
        chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize)));
      }
      var base64 = btoa(chunks.join(''));
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'BLOB_DATA_RESPONSE', blobUrl: blobUrl, success: true, base64: base64, contentType: blob.type || '' } }, '*');
    }).catch(function(e) {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'BLOB_DATA_RESPONSE', blobUrl: blobUrl, success: false } }, '*');
    });
  });

  // ── Patch window.fetch ─────────────────────────────────────────────────────
  var _fetch = window.fetch;
  var _fetchActive = false;
  window.fetch = function(input, init) {
    if (_fetchActive) return _fetch.apply(this, arguments);
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var host = window.location.hostname;
    var pageUrl = window.location.href;

    _fetchActive = true;
    var promise = _fetch.apply(this, arguments);
    _fetchActive = false;
    return promise.then(function(response) {
      var ct = response.headers.get('content-type') || '';

      if (host.includes('claude.ai') && HISTORY_URL_RE.test(url) && ct.includes('json')) {
        console.log('[Diary interceptor] History endpoint matched, url:', url);
        var histClone = response.clone();
        (async function() {
          try {
            var json = await histClone.json();
            console.log('[Diary interceptor] History JSON parsed, chat_messages length:', json && json.chat_messages && json.chat_messages.length);
            var seedText = parseHistorySeed(json);
            var seedImages = parseHistorySeedImages(json);
            console.log('[Diary interceptor] History seed text length:', seedText.length, '| images found:', seedImages.length);
            if (seedText && seedText.length > 50) {
              window.__diaryCapture.historySeed = { text: seedText, images: seedImages, url: pageUrl, ts: Date.now() };
              console.log('[Diary interceptor] History seed captured:', seedText.slice(0, 80));
              window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', { detail: { url: pageUrl } }));
            }
          } catch(e) {
            console.error('[Diary interceptor] History parse FAILED:', e);
          }
        })();
        return response;
      }

      if (host.includes('chatgpt.com') && CHATGPT_HISTORY_URL_RE.test(url)) {
        console.log('[Diary interceptor] ChatGPT history endpoint matched, url:', url);
        var cgHistClone = response.clone();
        (async function() {
          try {
            var json = await cgHistClone.json();
            var mappingLen = json && json.mapping ? Object.keys(json.mapping).length : 0;
            console.log('[Diary interceptor] ChatGPT history JSON parsed, mapping nodes:', mappingLen);
            var seedText = parseChatGPTHistorySeed(json);
            console.log('[Diary interceptor] ChatGPT history seed text length:', seedText.length);
            if (seedText && seedText.length > 50) {
              // Also cache the raw JSON and a computed turn count. Confirmed
              // live: diary-content.js issuing its OWN fetch() to this same
              // endpoint at Save-click time reliably gets a 404, while THIS
              // passive capture (eavesdropping on a fetch ChatGPT's own
              // client code issues, with whatever auth/headers it attaches
              // internally) succeeds consistently. So Save-time logic
              // should read from this cache instead of re-fetching itself.
              var turnCount = 0;
              if (json && json.mapping) {
                for (var mid in json.mapping) {
                  var mmsg = json.mapping[mid] && json.mapping[mid].message;
                  if (mmsg && mmsg.content && mmsg.content.content_type === 'text') {
                    var mrole = mmsg.author && mmsg.author.role;
                    if (mrole === 'user' || mrole === 'assistant') turnCount++;
                  }
                }
              }
              window.__diaryCapture.historySeed = { text: seedText, url: pageUrl, ts: Date.now(), rawJson: json, turnCount: turnCount };
              console.log('[Diary interceptor] ChatGPT history seed captured:', seedText.slice(0, 80), '| cached turnCount:', turnCount);
              window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', { detail: { url: pageUrl } }));
            }
          } catch(e) {
            console.error('[Diary interceptor] ChatGPT history parse FAILED:', e);
          }
        })();
        return response;
      }

      if (!isAIStream(url, ct)) return response;

      // DeepSeek-specific tightening: the generic isAIStream() gate above is
      // deliberately broad (matches URL words like "chat"/"message"/
      // "response", which are common substrings on almost any chat-site API
      // path) so it stays permissive enough to work across many providers.
      // Confirmed live this was too broad for DeepSeek specifically: it was
      // also matching some OTHER endpoint (very likely a sidebar "recent
      // conversations" list, which legitimately contains "content" fields
      // for PAST conversations' preview snippets), causing stale content
      // from a completely different, earlier conversation to get stored as
      // if it were a live completion for the current one — appearing even
      // at page load, before any new question was asked. Require the real,
      // specific completion-endpoint path here (same pattern background.js
      // already uses correctly for its own webRequest-based detection).
      if (host.includes('deepseek.com') && !/deepseek\.com\/api\/v0\/chat\/completion/.test(url)) {
        return response;
      }

      var clone = response.clone();
      (async function() {
        try {
          var reader = clone.body.getReader();
          var decoder = new TextDecoder();
          var buffer = '';
          var accumulated = '';
          // Per-request state, created once here (not inside the loop
          // below) so it persists across every chunk of THIS stream, but
          // is freshly created for each new request. Currently used by
          // Mistral's parser to track which contentChunks index was
          // reasoning across multiple streamed chunks — see extractText's
          // Mistral-specific comment for the full rationale.
          var state = {};
          while (true) {
            var ref = await reader.read();
            if (ref.done) break;
            buffer += decoder.decode(ref.value, { stream: true });
            var lines = buffer.split('\n');
            buffer = lines.pop();
            accumulated += processLines(lines, host, state);
          }
          storeTurn(accumulated, pageUrl);
        } catch(e) {}
      })();

      return response;
    });
  };

  // ── Patch XMLHttpRequest (DeepSeek, Gemini use XHR not fetch) ────────────
  var _XHROpen = XMLHttpRequest.prototype.open;
  var _XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url) {
    this.__url = (typeof url === 'string') ? url : '';
    this.__host = window.location.hostname;
    this.__pageUrl = window.location.href;
    this.__captured = false;
    return _XHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
    var xhr = this;
    xhr.addEventListener('load', function() {
      if (xhr.__captured) return;
      try {
        var ct = xhr.getResponseHeader('content-type') || '';
        var text = xhr.responseText || '';

        if (xhr.__host && xhr.__host.includes('gemini.google.com') && text.startsWith(")]}'")) {
          try {
            var extracted = '';
            var body = text.slice(4);
            var pos = 0;
            while (pos < body.length) {
              var nlPos = body.indexOf('\n', pos);
              if (nlPos === -1) break;
              var lenStr = body.slice(pos, nlPos).trim();
              var len = parseInt(lenStr, 10);
              if (isNaN(len) || len <= 0) { pos = nlPos + 1; continue; }
              var chunk = body.slice(nlPos + 1, nlPos + 1 + len);
              pos = nlPos + 1 + len + 1;
              try {
                var outer = JSON.parse(chunk);
                var candidates = [];
                var walkAndCollect = function(val) {
                  if (typeof val === 'string' && val.length > 100) {
                    try {
                      var inner = JSON.parse(val);
                      walkAndCollect(inner);
                    } catch(e) {
                      var clean = val.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
                      if (/[a-zA-Z ]{30,}/.test(clean) &&
                          !clean.includes('batchexecute') &&
                          !clean.includes('Click to open') &&
                          !clean.startsWith('http') &&
                          !clean.includes('wrb.fr') &&
                          clean.split(' ').length > 10) {
                        candidates.push(clean);
                      }
                    }
                  } else if (Array.isArray(val)) {
                    val.forEach(walkAndCollect);
                  } else if (val && typeof val === 'object') {
                    Object.values(val).forEach(walkAndCollect);
                  }
                };
                walkAndCollect(outer);
                if (candidates.length) {
                  candidates.sort(function(a,b){ return b.length - a.length; });
                  extracted += candidates[0] + '\n';
                }
              } catch(e) {}
            }
            if (extracted.length > 50) {
              xhr.__captured = true;
              storeTurn(extracted, xhr.__pageUrl);
              return;
            }
          } catch(e) {}
        }

        if (!isAIStream(xhr.__url, ct)) return;
        // Same DeepSeek-specific tightening as the fetch-patch path above —
        // see the detailed comment there for the full rationale.
        if (xhr.__host && xhr.__host.includes('deepseek.com') && !/deepseek\.com\/api\/v0\/chat\/completion/.test(xhr.__url)) {
          return;
        }
        var lines = text.split('\n');
        var accumulated = processLines(lines, xhr.__host, {});
        if (accumulated.length > 50) {
          xhr.__captured = true;
          storeTurn(accumulated, xhr.__pageUrl);
        }
      } catch(e) {}
    });
    return _XHRSend.apply(this, arguments);
  };

  // Expose the ChatGPT history parser for on-demand use by diary-content.js
  // at Save-click time (both files run in the MAIN world, sharing `window`,
  // so this is a plain property, not a postMessage bridge). Needed because
  // DOM-based reading proved unreliable for long ChatGPT responses — likely
  // viewport virtualization dropping mid-conversation content that isn't
  // currently scrolled into view — while this parser reads the real
  // backend data model directly, with no rendering/virtualization concerns.
  window.__diaryParseChatGPTHistorySeed = parseChatGPTHistorySeed;

  console.log('[Diary interceptor] Active on', window.location.hostname);
})();