// ── Generic DOM-thread-building module ──────────────────────────────
// Extracted from diary-content.js as part of a deliberate,
// architectural simplification pass (continuing the same one that
// already extracted ChatGPT's own capture logic into
// diary-content-chatgpt.js): buildDomPairedThread() and
// buildGeminiPairedThread() were, together, the largest genuinely
// provider-agnostic block still living inline in that file --
// buildDomPairedThread() alone is shared across four separate
// providers (Perplexity, Meta AI, Grok, Mistral, each passing their
// own selector configuration into the same generic function), and
// buildGeminiPairedThread() is Gemini's own closely-related
// specialized variant of the same underlying "walk paired question/
// answer DOM elements, run Turndown, build a thread" concept. Moving
// both together, rather than splitting them apart, keeps this shared
// concept in one place.
//
// Loaded as an additional content script alongside diary-content.js
// (see manifest.json's own content_scripts entry) -- Manifest V3
// already supports multiple JS files listed together for the same
// match pattern, all executed into the SAME isolated-world global
// scope, so every top-level function here is directly callable from
// diary-content.js exactly as if it were still defined inline, with no
// import/export mechanism needed at all. The four cross-file
// dependencies these two functions have -- boldQuestion(),
// cleanDomText(), stripCitations(), and stripEntityArtifacts(), all
// defined in diary-content.js itself -- work correctly regardless of
// which file's own <script> tag executes first: each is declared with
// `function name(){}` syntax, which is fully hoisted before either
// file's own top-level code ever runs, not just its name the way
// `const`/`var` would be. Still listed after diary-content.js in the
// manifest for intuitive read-order, though this isn't strictly
// required for correctness -- same reasoning already applied to
// diary-content-chatgpt.js.
//
// Extracted verbatim -- behavior is unchanged, only the packaging
// moved.

  function buildDomPairedThread(opts) {
    try {
      var els = document.querySelectorAll(opts.combinedSelector);
      if (!els.length) return null;
      var parts = [];
      // Tracks the most recently pushed QUESTION text specifically (not
      // just "the last thing pushed") — confirmed live as a real,
      // reproduced bug on Meta AI: the same first question appeared
      // twice, back to back, in an otherwise clean capture. A
      // transient DOM state (e.g. React briefly rendering both an
      // optimistic and a settled copy of the same message during a
      // re-render) can make querySelectorAll genuinely return two
      // separate nodes for what's really one question. A real
      // conversation never legitimately asks the exact same question
      // twice in a row with nothing in between, so skipping an
      // immediate repeat is safe and can't drop genuine content.
      var lastQuestionText = null;
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (opts.isQuestion(el)) {
          var qEl = opts.questionInnerSelector ? el.querySelector(opts.questionInnerSelector) : el;
          var qText = qEl ? (qEl.textContent || '').trim() : '';
          if (qText && qText === lastQuestionText) continue;
          if (qText) { parts.push(boldQuestion(qText.slice(0, 2000))); lastQuestionText = qText; }
        } else {
          // Reset the consecutive-question tracker the moment a real
          // answer is seen — the dedup above must only ever catch a
          // question immediately repeated with NOTHING in between, not
          // a genuine, deliberate repeat where the user asked the same
          // thing twice with a real answer given in between.
          lastQuestionText = null;
          // NOTE: querySelectorAll instead of querySelector — confirmed
          // live via diagnostic logging that a single Meta AI answer
          // turn can contain MULTIPLE separate .ur-markdown blocks (2 in
          // one real test, 4 in another — e.g. one for intro text, one
          // for an actual table, one for images), not just one. The
          // original querySelector only ever grabbed the FIRST block,
          // silently dropping everything after it — including a table
          // the person had explicitly asked for. Now runs Turndown on
          // every matching block within the turn and joins them, so a
          // turn with just one block (the common case, and every other
          // provider using this same shared function) behaves exactly
          // as before, while a turn with several no longer loses
          // anything. Verified via direct simulation before applying
          // this to the real, complex Turndown-conversion code below.
          var aEls = opts.answerInnerSelector ? Array.from(el.querySelectorAll(opts.answerInnerSelector)) : [el];
          // Real, direct evidence gathering — added specifically because
          // a real, live, reported case showed a history_mismatch where
          // the newly captured thread had two consecutive questions with
          // no answer between them, while the already-stored version
          // correctly had the real answer in between. Since a real
          // answer with empty text is silently dropped entirely further
          // below (parts only ever gets pushed to inside "if (text)"),
          // this logs directly whether aEls came back empty for any
          // given answer element -- the one, specific condition that
          // would cause exactly this symptom.
          if (!aEls.length) {
            console.log('[Diary Sync DIAG] [EXPERIMENT] answer element matched by isQuestion===false, but answerInnerSelector found ZERO child elements inside it — this real answer will be silently dropped entirely. Element\'s own outerHTML preview:', (el.outerHTML || '').slice(0, 200));
          }
          if (aEls.length) {
            var text = '';
            try {
              if (typeof TurndownService !== 'undefined') {
                if (!window.__diaryTurndownInstance) {
                  var svc = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
                  if (typeof turndownPluginGfm !== 'undefined' && turndownPluginGfm.gfm) {
                    svc.use(turndownPluginGfm.gfm);
                  }
                  svc.escape = function(string) {
                    return string
                      .replace(/\\/g, '\\\\')
                      .replace(/\*/g, '\\*')
                      // NOTE: ^- bullet-escape rule removed — confirmed
                      // live on DeepSeek that it corrupts citation links
                      // whose text happens to start with a hyphen (e.g.
                      // "-2" as a citation marker), producing broken
                      // output like "[\\-2](url)". Real bullet lists are
                      // unaffected — generated by Turndown's own list-item
                      // rule, never by this escape function. Verified via
                      // direct test: fixes the citation case, a genuine
                      // bullet list still renders correctly, and a
                      // paragraph genuinely starting with a hyphen is
                      // safe too (standard markdown requires a space
                      // immediately after the hyphen to be read as a list
                      // marker, which such text lacks).
                      .replace(/^\+ /g, '\\+ ')
                      .replace(/^(=+)/g, '\\$1')
                      .replace(/^(#{1,6}) /g, '\\$1 ')
                      .replace(/`/g, '\\`')
                      .replace(/^~~~/g, '\\~~~')
                      .replace(/\[/g, '\\[')
                      .replace(/\]/g, '\\]')
                      .replace(/^>/g, '\\>')
                      .replace(/_/g, '\\_');
                  };
                  // When a <p> is the sole child of a <li>, treat it as
                  // inline content instead of a block paragraph. Modern
                  // markdown renderers (confirmed live on Perplexity)
                  // commonly wrap every list item's text in its own <p>
                  // tag — Turndown's default paragraph spacing then leaks
                  // into the list, producing a stray whitespace-only line
                  // between every bullet. Verified via direct test: fixes
                  // the spacing without affecting normal standalone
                  // paragraphs elsewhere, which still get correct spacing.
                  svc.addRule('listItemParagraph', {
                    filter: function(node) {
                      return node.nodeName === 'P' &&
                             node.parentNode &&
                             node.parentNode.nodeName === 'LI' &&
                             node.parentNode.children.length === 1;
                    },
                    replacement: function(content) {
                      return content;
                    }
                  });
                  // Mistral's own "rich table" UI component, confirmed
                  // live via direct DOM inspection: role="table" wraps a
                  // FLAT sequence of role="columnheader" then role="cell"
                  // elements — no real <table>/<tr>/<td> tags, no
                  // role="row" grouping at all. Turndown's built-in table
                  // handling only recognizes real table markup, so this
                  // was silently falling through as plain text, explained
                  // as "table formatting simply missing" on Mistral. Row
                  // boundaries are inferred by chunking the flat cell list
                  // on the real header count, excluding Mistral's own
                  // narrow UI-only sticky column (data-rich-table-ui-only)
                  // from both headers and cells. Verified via direct test
                  // against the real confirmed structure before shipping.
                  svc.addRule('mistralRichTable', {
                    filter: function(node) {
                      return node.getAttribute && node.getAttribute('role') === 'table';
                    },
                    replacement: function(content, node) {
                      var headers = Array.from(node.querySelectorAll('[role="columnheader"]:not([data-rich-table-ui-only])'))
                        .map(function(h) { return (h.textContent || '').trim(); });
                      if (!headers.length) return content;
                      var cells = Array.from(node.querySelectorAll('[role="cell"]:not([data-rich-table-ui-only])'))
                        .map(function(c) { return (c.textContent || '').trim().replace(/\|/g, '\\|'); });
                      var colCount = headers.length;
                      var rows = [];
                      for (var i = 0; i < cells.length; i += colCount) {
                        rows.push(cells.slice(i, i + colCount));
                      }
                      var out = '\n\n| ' + headers.join(' | ') + ' |\n';
                      out += '| ' + headers.map(function() { return '---'; }).join(' | ') + ' |\n';
                      rows.forEach(function(row) { out += '| ' + row.join(' | ') + ' |\n'; });
                      return out + '\n';
                    }
                  });
                  svc.addRule('resolveRelativeImageUrls', {
                    // NOTE: added — confirmed live via a real Mistral image that
                    // Turndown's own default <img> handling reads the raw HTML src
                    // ATTRIBUTE (getAttribute('src')), which some providers write as
                    // a relative path (Mistral's case: a Cloudflare image-resizing
                    // proxy path like '/cdn-cgi/image/width=800,.../https://...' —
                    // an absolute URL embedded INSIDE a relative one, not itself
                    // starting with http(s)://). That relative path was being saved
                    // as-is, then silently failing to match the image-rendering
                    // rule in forge-api.js entirely (which requires the URL to
                    // start with http(s)://), showing up as raw, unconverted text.
                    // Uses the .src PROPERTY instead of the attribute — standard,
                    // spec-guaranteed browser behavior always resolves this to the
                    // full, absolute URL relative to the page's own base URL,
                    // regardless of how the original HTML wrote it. Ensures the
                    // saved content is always self-contained going forward, not
                    // dependent on knowing which provider's site it came from to
                    // resolve a relative path later.
                    filter: 'img',
                    replacement: function(content, node) {
                      var src = node.src || node.getAttribute('src') || '';
                      var alt = node.getAttribute('alt') || '';
                      if (!src) return '';
                      return '![' + alt + '](' + src + ')';
                    }
                  });
                  svc.addRule('metaCitationPill', {
                    // NOTE: updated — originally rendered the domain as plain,
                    // non-clickable text, since no real URL exists anywhere in
                    // the static markup. Correctly identified as a bad trade-off:
                    // a dead, static label is worse than an approximate link. Now
                    // constructs a real, clickable link to the domain's own
                    // homepage (confirmed live that aria-label is often a
                    // specific, meaningful subdomain, e.g.
                    // 'clintonwhitehouse5.archives.gov', not just a generic
                    // top-level domain — making this a genuinely useful,
                    // relevant link even though it won't be the exact, original
                    // page that was actually cited). Produces standard
                    // [label](url) markdown syntax so it flows through the same
                    // shared stripCitations()/renderMarkdown() pipeline as every
                    // other provider's citations, becoming a real, clickable
                    // pill rather than a bespoke, separate mechanism.
                    filter: function(node) {
                      return node.nodeName === 'A' && node.getAttribute('data-testid') === 'citation-pill';
                    },
                    replacement: function(content, node) {
                      var domain = node.getAttribute('aria-label') || '';
                      if (!domain) return '';
                      return ' [' + domain + '](https://' + domain + ')';
                    }
                  });                  svc.addRule('chatgptCitationPill', {
                    // NOTE: updated — confirmed live via real DOM inspection that a
                    // citation pill with multiple sources behind it (a visible '+N'
                    // indicator) contains MULTIPLE <a> tags simultaneously in the
                    // DOM at once — one visible, one or more others hidden via
                    // opacity:0, cycling through an animation between different
                    // source names for the same, single visual pill. Originally
                    // targeted the <a> itself, which meant each of these rotating,
                    // hidden <a> tags got processed as its own, separate citation —
                    // confirmed as the actual cause of citations appearing duplicated
                    // with a different label than what's actually shown on the page.
                    // Now targets the OUTER 'webpage-citation-pill' wrapper instead,
                    // using only the FIRST <a> found inside it — this is what's
                    // genuinely, visibly shown, regardless of how many additional,
                    // rotating <a> tags exist for the same pill. Verified via direct
                    // simulation of a two-<a>, rotating-animation pill before
                    // applying here.
                    filter: function(node) {
                      return node.getAttribute && node.getAttribute('data-testid') === 'webpage-citation-pill';
                    },
                    replacement: function(content, node) {
                      var firstA = node.querySelector('a[href]');
                      if (!firstA) return content;
                      var url = firstA.getAttribute('href');
                      var labelEl = firstA.querySelector('.truncate');
                      var label = labelEl ? (labelEl.textContent || '').trim() : '';
                      if (!url || !label) return content;
                      return '[' + label + '](' + url + ')';
                    }
                  });
                  svc.addRule('deepseekCitationBadge', {
                    // NOTE: added — confirmed live via real DOM inspection that
                    // DeepSeek's citation badges use a genuinely clever but
                    // Turndown-breaking CSS trick: a real <a href> link wraps TWO
                    // overlapping <span> elements — one with opacity:0 containing a
                    // literal '-' character (purely an invisible width-spacer, never
                    // meant to be read), and a second, absolutely-positioned span
                    // holding the actual, visible citation number. Turndown reads
                    // both spans' raw text regardless of CSS visibility (the same
                    // category of issue as Gemini's hidden code-blocks), concatenating
                    // '-' + the real number into a malformed '-4'-style label — the
                    // confirmed, definitive cause of every citation in a DeepSeek
                    // entry showing a label like '-4' instead of a real reference
                    // number. Filters specifically for an <a> containing a child
                    // '.ds-markdown-cite' element, then reads ONLY the absolutely-
                    // positioned span's own text, ignoring the hidden spacer span
                    // entirely. Verified via direct simulation against the real,
                    // pasted DOM structure before applying here.
                    //
                    // NOTE: label extended to a compound one (reusing the same
                    // "pill␟footer" system already built for Claude, via
                    // splitCompoundLabel() in the shared stripCitations() logic)
                    // — confirmed live via direct user feedback that DeepSeek's
                    // own citation badges genuinely never show a real title or
                    // site name anywhere, only the bare number, so the separate
                    // Sources list degraded to a plain list of numbers with no
                    // way to tell which came from which site. Derives a clean,
                    // readable domain name from the citation's own URL for the
                    // Sources list specifically, while the compact inline pill
                    // keeps the bare number — matching DeepSeek's own actual,
                    // visible appearance there.
                    filter: function(node) {
                      return node.nodeName === 'A' && !!node.querySelector('.ds-markdown-cite');
                    },
                    replacement: function(content, node) {
                      var url = node.getAttribute('href');
                      var citeEl = node.querySelector('.ds-markdown-cite');
                      var visibleSpan = citeEl && citeEl.querySelector('span[style*="position: absolute"]');
                      var number = visibleSpan ? (visibleSpan.textContent || '').trim() : '';
                      if (!url || !number) return content;
                      var domain = url;
                      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch(e) {}
                      var label = number + '\u241F' + domain;
                      return '[' + label + '](' + url + ')';
                    }
                  });
                  svc.addRule('perplexityCitationPill', {
                    // NOTE: added — confirmed live these citation pills use a
                    // custom <span data-pplx-citation-url="..."> structure, not a
                    // real <a href> link, so Turndown's own default handling never
                    // picked up the actual URL at all — only the visible label text
                    // ('upway', 'yadea') survived, silently losing the citation
                    // entirely. The '+1' suffix some pills show represents
                    // additional sources only reachable via a hover-card popup, not
                    // separately present in the DOM as their own extractable URLs —
                    // a known, accepted limitation, not something this rule attempts
                    // to capture. Verified via direct simulation against two real,
                    // distinct citation pills before applying here.
                    filter: function(node) {
                      return node.nodeName === 'SPAN' && !!node.getAttribute('data-pplx-citation-url');
                    },
                    replacement: function(content, node) {
                      var url = node.getAttribute('data-pplx-citation-url');
                      var label = (node.textContent || '').trim().replace(/\+\d+$/, '').trim();
                      if (!url || !label) return content;
                      return '[' + label + '](' + url + ')';
                    }
                  });
                  window.__diaryTurndownInstance = svc;
                }
                text = aEls.map(function(e) { return window.__diaryTurndownInstance.turndown(e).trim(); }).filter(Boolean).join('\n\n');
              }
            } catch (e) {}
            if (!text) text = aEls.map(function(e) { return (e.innerText || e.textContent || '').trim(); }).filter(Boolean).join('\n\n');
            // Grok-specific: strip two separate, confirmed widget-text
            // leaks — "Worked for Xm Ys" (a "thinking time" indicator,
            // confirmed live to sit in a genuinely separate sibling <div>
            // from the actual answer, both swept up together since
            // answerInnerSelector is null for Grok) and "N sources" (a
            // sources-count summary, confirmed live via direct DOM
            // inspection to appear at the end of a turn's own text).
            // Applied here, per-turn, rather than once on the final,
            // combined multi-turn thread — a multi-question conversation
            // could have this leak at the end of ANY turn, not just the
            // very last one in the whole conversation.
            if (text && PROVIDER === 'grok') {
              text = text.replace(/\bWorked for \d+m? ?\d*s\b\n*/g, '');
              text = text.replace(/\n*\b\d+ sources?\b\s*$/g, '');
            }
            // Meta AI-specific: separately extract generated images from
            // the FULL, outer answer block (el), not the text-scoped
            // aEls — confirmed live via real DOM inspection that Meta
            // AI's generated images sit in a genuinely separate sibling
            // container ("markdown-content"), never a descendant of
            // ".ur-markdown" at all, which is what answerInnerSelector
            // scopes the text conversion to. Without this, images were
            // never captured at all, inline or otherwise — the answer
            // text would say "here are some images" with nothing after
            // it. Confirmed selector directly from real DOM inspection:
            // img[data-testid="ur-image-tile"]. Appended as standard
            // markdown image syntax so they flow through the same
            // gallery-grouping and rendering logic every other
            // provider's images already use, rather than a separate,
            // bespoke mechanism.
            if (text && PROVIDER === 'meta') {
              var metaImgEls = Array.from(el.querySelectorAll('img[data-testid="ur-image-tile"]'));
              if (metaImgEls.length) {
                var metaImgMarkdown = metaImgEls.map(function(img) {
                  var src = img.src || img.getAttribute('src') || '';
                  return src ? '![Image](' + src + ')' : '';
                }).filter(Boolean).join('\n\n');
                if (metaImgMarkdown) text += '\n\n' + metaImgMarkdown;
              }
            }
            if (text) {
              var host = window.location.hostname;
              var config = DOM_SELECTORS[host];
              text = config ? cleanDomText(config.clean(text)) : cleanDomText(text);
              parts.push(text);
            }
          }
        }
      }
      // Confirmed live via a real, reported case: the ENTIRE captured
      // sequence (every question and answer) repeated back to back,
      // producing a Diary entry with the full Q/A exchange duplicated
      // twice — not just one repeated turn, which the consecutive-
      // question dedup above already guards against. This is a
      // genuinely different failure mode: the existing dedup only ever
      // catches the SAME question immediately repeated with nothing in
      // between (lastQuestionText resets the moment a real answer is
      // seen), so it cannot catch a full thread appearing twice with
      // real content between the two copies. A real conversation never
      // legitimately repeats its entire Q/A sequence identically, so
      // this is safe to detect and truncate. Deliberately placed in
      // this shared function (not Mistral-specific) since Perplexity,
      // Meta AI, and Grok all call this same function and could
      // plausibly hit the same underlying DOM-level cause (most likely
      // the page genuinely rendering two copies of the conversation
      // elements — e.g. a hidden/visible duplicate for animation,
      // or a responsive-layout duplicate tree). Verified via direct
      // simulation against four cases before applying here: the exact
      // reported repeated-whole-thread case, a normal non-repeated
      // conversation (confirmed untouched), an odd-length result
      // (left untouched — can't cleanly halve), and a genuine,
      // deliberate repeat of the same question with a DIFFERENT real
      // answer the second time (confirmed NOT treated as a duplicate,
      // since the two halves aren't actually identical).
      if (parts.length >= 4 && parts.length % 2 === 0) {
        var half = parts.length / 2;
        var firstHalf = parts.slice(0, half);
        var secondHalf = parts.slice(half);
        if (firstHalf.every(function(p, i) { return p === secondHalf[i]; })) {
          console.log('[Diary] buildDomPairedThread: whole captured thread was duplicated end-to-end — truncated to the first copy.');
          parts = firstHalf;
        }
      }
      return parts.length ? parts.join('\n\n') : null;
    } catch (e) {
      console.error('[Diary] buildDomPairedThread failed, falling back:', e);
      return null;
    }
  }

  // ── Gemini: DOM-based question/answer pairing ───────────────────────────────
  // Reads the ACTUAL live DOM structure at save time, instead of inferring
  // pairing from timing/counting. Confirmed via live DOM inspection
  // earlier: each exchange sits inside a <div class="conversation-
  // container"> wrapping exactly one <user-query> and one <model-response>
  // as direct siblings. Walking these in document order faithfully
  // reproduces whatever the real page actually shows — including uneven
  // cases (e.g. two questions before one answer), since nothing here is
  // counted or inferred, only read directly. This replaces two prior
  // counting-based fixes for the same interleaving problem, both of which
  // had real, confirmed failure modes under normal typing speed — this
  // approach has no timing dependency to break. Returns null (triggering
  // the existing fallback) if the expected structure isn't found, so a
  // future Gemini DOM change can only fall back to the previous behavior,
  // never silently produce worse output.
  //
  // NOTE: kept as its own dedicated function, separate from the generic
  // buildDomPairedThread above, deliberately — it was built, tested, and
  // confirmed working live before the generic version existed, and
  // touching proven-working code to fit a new abstraction risked
  // regressing something that took real effort to get right. The generic
  // version is used for providers built after this one instead.
  function buildGeminiPairedThread() {
    try {
      var els = document.querySelectorAll('user-query, model-response');
      if (!els.length) return null;
      var config = DOM_SELECTORS['gemini.google.com'];
      var parts = [];
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'user-query') {
          var qEl = el.querySelector('.query-text-line');
          var qText = qEl ? (qEl.textContent || '').trim() : '';
          if (qText) parts.push(boldQuestion(qText.slice(0, 2000)));
        } else if (tag === 'model-response') {
          var rEl = el.querySelector(config.response);
          if (rEl) {
            // NOTE: clone + strip hidden <code-block> elements before
            // conversion — confirmed live via diagnostic logging as the
            // real, definitive cause of Gemini's internal Python code
            // (from its code-execution/file-generation feature) leaking
            // into saved content: Gemini renders that code inside a
            // <code-block> custom element with an inline
            // "display: none" style — collapsed from view in Gemini's
            // own UI by default, but still fully present in the DOM with
            // its raw code content. Turndown converts HTML structure
            // regardless of CSS visibility, so it swept this up anyway,
            // saving code the person themselves never actually saw on
            // the page. Only removes <code-block> elements that are
            // ALSO hidden (display: none) — a conservative, principled
            // rule ("don't capture what the person can't see"), not a
            // blanket exclusion of all code blocks regardless of
            // visibility, in case Gemini ever shows one expanded.
            // Clones first rather than mutating the live page DOM.
            // Verified via direct simulation before applying here: real,
            // visible answer text is fully preserved; only the hidden
            // code content is excluded.
            var rClone = rEl.cloneNode(true);
            var hiddenCodeBlocks = rClone.querySelectorAll('code-block');
            hiddenCodeBlocks.forEach(function(cb) {
              var style = cb.getAttribute('style') || '';
              var innerHidden = cb.querySelector('[style*="display: none"], [style*="display:none"]');
              if (style.indexOf('display: none') !== -1 || style.indexOf('display:none') !== -1 || innerHidden) {
                cb.remove();
              }
            });
            var text = '';
            try {
              if (typeof TurndownService !== 'undefined') {
                if (!window.__diaryTurndownInstance) {
                  var svc = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
                  if (typeof turndownPluginGfm !== 'undefined' && turndownPluginGfm.gfm) {
                    svc.use(turndownPluginGfm.gfm);
                  }
                  // Override the default escape() to skip ONLY the
                  // numbered-list-marker rule (e.g. "1. Clinical Pathway"
                  // -> "1\. Clinical Pathway"), keeping every other escape
                  // rule (real markdown syntax chars) intact. The Diary
                  // web app renders bold/tables/headers correctly but
                  // doesn't unescape this specific sequence, showing a
                  // visible stray backslash. Verified via direct test:
                  // numbered headings now match the live page exactly,
                  // while genuine markdown characters (asterisks, etc.)
                  // still escape correctly. Deliberate tradeoff: a real
                  // numbered list re-parsed as markdown elsewhere could in
                  // principle be misread — judged low-risk since this text
                  // comes from structured AI-generated section headings,
                  // not arbitrary user input.
                  svc.escape = function(string) {
                    return string
                      .replace(/\\/g, '\\\\')
                      .replace(/\*/g, '\\*')
                      // NOTE: ^- bullet-escape rule removed — confirmed
                      // live on DeepSeek that it corrupts citation links
                      // whose text happens to start with a hyphen (e.g.
                      // "-2" as a citation marker), producing broken
                      // output like "[\\-2](url)". Real bullet lists are
                      // unaffected — generated by Turndown's own list-item
                      // rule, never by this escape function. Verified via
                      // direct test: fixes the citation case, a genuine
                      // bullet list still renders correctly, and a
                      // paragraph genuinely starting with a hyphen is
                      // safe too (standard markdown requires a space
                      // immediately after the hyphen to be read as a list
                      // marker, which such text lacks).
                      .replace(/^\+ /g, '\\+ ')
                      .replace(/^(=+)/g, '\\$1')
                      .replace(/^(#{1,6}) /g, '\\$1 ')
                      .replace(/`/g, '\\`')
                      .replace(/^~~~/g, '\\~~~')
                      .replace(/\[/g, '\\[')
                      .replace(/\]/g, '\\]')
                      .replace(/^>/g, '\\>')
                      .replace(/_/g, '\\_');
                  };
                  // When a <p> is the sole child of a <li>, treat it as
                  // inline content instead of a block paragraph. Modern
                  // markdown renderers (confirmed live on Perplexity)
                  // commonly wrap every list item's text in its own <p>
                  // tag — Turndown's default paragraph spacing then leaks
                  // into the list, producing a stray whitespace-only line
                  // between every bullet. Verified via direct test: fixes
                  // the spacing without affecting normal standalone
                  // paragraphs elsewhere, which still get correct spacing.
                  svc.addRule('listItemParagraph', {
                    filter: function(node) {
                      return node.nodeName === 'P' &&
                             node.parentNode &&
                             node.parentNode.nodeName === 'LI' &&
                             node.parentNode.children.length === 1;
                    },
                    replacement: function(content) {
                      return content;
                    }
                  });
                  // Mistral's own "rich table" UI component, confirmed
                  // live via direct DOM inspection: role="table" wraps a
                  // FLAT sequence of role="columnheader" then role="cell"
                  // elements — no real <table>/<tr>/<td> tags, no
                  // role="row" grouping at all. Turndown's built-in table
                  // handling only recognizes real table markup, so this
                  // was silently falling through as plain text, explained
                  // as "table formatting simply missing" on Mistral. Row
                  // boundaries are inferred by chunking the flat cell list
                  // on the real header count, excluding Mistral's own
                  // narrow UI-only sticky column (data-rich-table-ui-only)
                  // from both headers and cells. Verified via direct test
                  // against the real confirmed structure before shipping.
                  svc.addRule('mistralRichTable', {
                    filter: function(node) {
                      return node.getAttribute && node.getAttribute('role') === 'table';
                    },
                    replacement: function(content, node) {
                      var headers = Array.from(node.querySelectorAll('[role="columnheader"]:not([data-rich-table-ui-only])'))
                        .map(function(h) { return (h.textContent || '').trim(); });
                      if (!headers.length) return content;
                      var cells = Array.from(node.querySelectorAll('[role="cell"]:not([data-rich-table-ui-only])'))
                        .map(function(c) { return (c.textContent || '').trim().replace(/\|/g, '\\|'); });
                      var colCount = headers.length;
                      var rows = [];
                      for (var i = 0; i < cells.length; i += colCount) {
                        rows.push(cells.slice(i, i + colCount));
                      }
                      var out = '\n\n| ' + headers.join(' | ') + ' |\n';
                      out += '| ' + headers.map(function() { return '---'; }).join(' | ') + ' |\n';
                      rows.forEach(function(row) { out += '| ' + row.join(' | ') + ' |\n'; });
                      return out + '\n';
                    }
                  });
                  svc.addRule('resolveRelativeImageUrls', {
                    // NOTE: added — confirmed live via a real Mistral image that
                    // Turndown's own default <img> handling reads the raw HTML src
                    // ATTRIBUTE (getAttribute('src')), which some providers write as
                    // a relative path (Mistral's case: a Cloudflare image-resizing
                    // proxy path like '/cdn-cgi/image/width=800,.../https://...' —
                    // an absolute URL embedded INSIDE a relative one, not itself
                    // starting with http(s)://). That relative path was being saved
                    // as-is, then silently failing to match the image-rendering
                    // rule in forge-api.js entirely (which requires the URL to
                    // start with http(s)://), showing up as raw, unconverted text.
                    // Uses the .src PROPERTY instead of the attribute — standard,
                    // spec-guaranteed browser behavior always resolves this to the
                    // full, absolute URL relative to the page's own base URL,
                    // regardless of how the original HTML wrote it. Ensures the
                    // saved content is always self-contained going forward, not
                    // dependent on knowing which provider's site it came from to
                    // resolve a relative path later.
                    filter: 'img',
                    replacement: function(content, node) {
                      var src = node.src || node.getAttribute('src') || '';
                      var alt = node.getAttribute('alt') || '';
                      if (!src) return '';
                      return '![' + alt + '](' + src + ')';
                    }
                  });
                  svc.addRule('metaCitationPill', {
                    // NOTE: updated — originally rendered the domain as plain,
                    // non-clickable text, since no real URL exists anywhere in
                    // the static markup. Correctly identified as a bad trade-off:
                    // a dead, static label is worse than an approximate link. Now
                    // constructs a real, clickable link to the domain's own
                    // homepage (confirmed live that aria-label is often a
                    // specific, meaningful subdomain, e.g.
                    // 'clintonwhitehouse5.archives.gov', not just a generic
                    // top-level domain — making this a genuinely useful,
                    // relevant link even though it won't be the exact, original
                    // page that was actually cited). Produces standard
                    // [label](url) markdown syntax so it flows through the same
                    // shared stripCitations()/renderMarkdown() pipeline as every
                    // other provider's citations, becoming a real, clickable
                    // pill rather than a bespoke, separate mechanism.
                    filter: function(node) {
                      return node.nodeName === 'A' && node.getAttribute('data-testid') === 'citation-pill';
                    },
                    replacement: function(content, node) {
                      var domain = node.getAttribute('aria-label') || '';
                      if (!domain) return '';
                      return ' [' + domain + '](https://' + domain + ')';
                    }
                  });                  svc.addRule('chatgptCitationPill', {
                    // NOTE: updated — confirmed live via real DOM inspection that a
                    // citation pill with multiple sources behind it (a visible '+N'
                    // indicator) contains MULTIPLE <a> tags simultaneously in the
                    // DOM at once — one visible, one or more others hidden via
                    // opacity:0, cycling through an animation between different
                    // source names for the same, single visual pill. Originally
                    // targeted the <a> itself, which meant each of these rotating,
                    // hidden <a> tags got processed as its own, separate citation —
                    // confirmed as the actual cause of citations appearing duplicated
                    // with a different label than what's actually shown on the page.
                    // Now targets the OUTER 'webpage-citation-pill' wrapper instead,
                    // using only the FIRST <a> found inside it — this is what's
                    // genuinely, visibly shown, regardless of how many additional,
                    // rotating <a> tags exist for the same pill. Verified via direct
                    // simulation of a two-<a>, rotating-animation pill before
                    // applying here.
                    filter: function(node) {
                      return node.getAttribute && node.getAttribute('data-testid') === 'webpage-citation-pill';
                    },
                    replacement: function(content, node) {
                      var firstA = node.querySelector('a[href]');
                      if (!firstA) return content;
                      var url = firstA.getAttribute('href');
                      var labelEl = firstA.querySelector('.truncate');
                      var label = labelEl ? (labelEl.textContent || '').trim() : '';
                      if (!url || !label) return content;
                      return '[' + label + '](' + url + ')';
                    }
                  });
                  svc.addRule('deepseekCitationBadge', {
                    // NOTE: added — confirmed live via real DOM inspection that
                    // DeepSeek's citation badges use a genuinely clever but
                    // Turndown-breaking CSS trick: a real <a href> link wraps TWO
                    // overlapping <span> elements — one with opacity:0 containing a
                    // literal '-' character (purely an invisible width-spacer, never
                    // meant to be read), and a second, absolutely-positioned span
                    // holding the actual, visible citation number. Turndown reads
                    // both spans' raw text regardless of CSS visibility (the same
                    // category of issue as Gemini's hidden code-blocks), concatenating
                    // '-' + the real number into a malformed '-4'-style label — the
                    // confirmed, definitive cause of every citation in a DeepSeek
                    // entry showing a label like '-4' instead of a real reference
                    // number. Filters specifically for an <a> containing a child
                    // '.ds-markdown-cite' element, then reads ONLY the absolutely-
                    // positioned span's own text, ignoring the hidden spacer span
                    // entirely. Verified via direct simulation against the real,
                    // pasted DOM structure before applying here.
                    //
                    // NOTE: label extended to a compound one (reusing the same
                    // "pill␟footer" system already built for Claude, via
                    // splitCompoundLabel() in the shared stripCitations() logic)
                    // — confirmed live via direct user feedback that DeepSeek's
                    // own citation badges genuinely never show a real title or
                    // site name anywhere, only the bare number, so the separate
                    // Sources list degraded to a plain list of numbers with no
                    // way to tell which came from which site. Derives a clean,
                    // readable domain name from the citation's own URL for the
                    // Sources list specifically, while the compact inline pill
                    // keeps the bare number — matching DeepSeek's own actual,
                    // visible appearance there.
                    filter: function(node) {
                      return node.nodeName === 'A' && !!node.querySelector('.ds-markdown-cite');
                    },
                    replacement: function(content, node) {
                      var url = node.getAttribute('href');
                      var citeEl = node.querySelector('.ds-markdown-cite');
                      var visibleSpan = citeEl && citeEl.querySelector('span[style*="position: absolute"]');
                      var number = visibleSpan ? (visibleSpan.textContent || '').trim() : '';
                      if (!url || !number) return content;
                      var domain = url;
                      try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch(e) {}
                      var label = number + '\u241F' + domain;
                      return '[' + label + '](' + url + ')';
                    }
                  });
                  svc.addRule('perplexityCitationPill', {
                    // NOTE: added — confirmed live these citation pills use a
                    // custom <span data-pplx-citation-url="..."> structure, not a
                    // real <a href> link, so Turndown's own default handling never
                    // picked up the actual URL at all — only the visible label text
                    // ('upway', 'yadea') survived, silently losing the citation
                    // entirely. The '+1' suffix some pills show represents
                    // additional sources only reachable via a hover-card popup, not
                    // separately present in the DOM as their own extractable URLs —
                    // a known, accepted limitation, not something this rule attempts
                    // to capture. Verified via direct simulation against two real,
                    // distinct citation pills before applying here.
                    filter: function(node) {
                      return node.nodeName === 'SPAN' && !!node.getAttribute('data-pplx-citation-url');
                    },
                    replacement: function(content, node) {
                      var url = node.getAttribute('data-pplx-citation-url');
                      var label = (node.textContent || '').trim().replace(/\+\d+$/, '').trim();
                      if (!url || !label) return content;
                      return '[' + label + '](' + url + ')';
                    }
                  });
                  window.__diaryTurndownInstance = svc;
                }
                text = window.__diaryTurndownInstance.turndown(rClone).trim();
              }
            } catch (e) {}
            if (!text) text = (rEl.innerText || rEl.textContent || '').trim();
            if (text) parts.push(cleanDomText(config.clean(text)));
          }
        }
      }
      return parts.length ? parts.join('\n\n') : null;
    } catch (e) {
      console.error('[Diary] buildGeminiPairedThread failed, falling back:', e);
      return null;
    }
  }

  // ── Shared: entity-artifact stripping and DOM text cleanup ─────────────────
  // Relocated to true top-level scope. Confirmed via AST analysis and a
  // live ReferenceError that both functions were nested inside the "Forge
  // Control Bar" bare block — invisible to buildGeminiPairedThread (itself
  // correctly at true top-level), even though other, also-nested callers
  // (like readDomResponse) could still reach them fine, since they shared
  // that same block. This is the mirror image of the usual scoping bug:
  // instead of a caller ending up nested while its callee stays top-level,
  // here the CALLEE was nested while a legitimate top-level caller needed
  // it. Moving to a shallower (true top-level) scope is always safe and
  // can never break existing callers, since outer-scope declarations are
  // always visible to inner-scope code regardless of nesting depth.
