// Diary Extension — Content Script v2
// Provider-registry architecture: each provider is isolated.
// Shared utilities (htmlToMarkdown, cleanText) are defaults that providers can override.
// Bug fix to a default = one edit, reaches all. Behaviour change = provider override only.

(function () {
  'use strict';

  if (window.__diaryProviderActive) return;
  window.__diaryProviderActive = true;

  // Persistent, window-backed storage for input-hook captured prompts
  // (Claude/Grok/Meta). Confirmed live: registry.grok._prompts came back
  // completely empty on a third question in a conversation where it had
  // correctly held both prior questions moments before — meaning
  // something caused the script's own local state to reset mid-session,
  // even though window.__diaryProviderActive (a guard already in place)
  // should have prevented a full re-run. Rather than chase the exact
  // trigger (SPA routing behavior isn't directly observable from here),
  // this makes _prompts itself resilient to whatever caused it: since JS
  // arrays are reference types, pointing _prompts directly at a
  // window-stored array (guarded with ||, so existing data survives
  // rather than getting overwritten) means every .push() stays in sync
  // permanently, even if the surrounding script context is ever
  // recreated — the same principle that already protects
  // window.__diaryCapture.turns successfully.
  window.__diaryInputPrompts = window.__diaryInputPrompts || { claude: [], grok: [], meta: [] };

  // ── Provider detection ─────────────────────────────────────────────────────
  const h = window.location.hostname;
  // Canonical URL - strips query params that change per-request (e.g. Grok's ?rid=...)
  function canonicalUrl() {
    return window.location.origin + window.location.pathname;
  }

  const PROVIDER_ID =
    h.includes('claude.ai')        ? 'claude'      :
    h.includes('chatgpt.com')       ? 'chatgpt'     :
    h.includes('gemini.google.com') ? 'gemini'      :
    h.includes('perplexity.ai')     ? 'perplexity'  :
    h.includes('deepseek.com')      ? 'deepseek'    :
    h.includes('x.ai') || h.includes('grok.com') ? 'grok' :
    h.includes('mistral.ai')        ? 'mistral'     :
    h.includes('meta.ai')           ? 'meta'        :
    null;

  console.log('[Diary content] PROVIDER_ID:', PROVIDER_ID, 'host:', h);
  if (!PROVIDER_ID) return;
  const PROVIDER = PROVIDER_ID; // alias for legacy infrastructure

  // ── Shared utilities (defaults) ────────────────────────────────────────────

// ── Provider registry ──────────────────────────────────────────────────────
  // Each provider: responseSelectors, promptSelectors, clean (optional override),
  // htmlToMarkdown (optional override), useShadow, reloadUrl (for Phase 3)

  const registry = {
    claude: {
      _prompts: window.__diaryInputPrompts.claude, _hooked: false,
      // Both listeners below push to the same _prompts array with no
      // dedup, historically — a real risk if a single Enter press also
      // triggers a synthetic click on the send button internally (a
      // common pattern reusing one submit handler for both input methods),
      // which would double-capture the same message. Now guards against
      // pushing a duplicate of the immediately-previous entry. Verified
      // via mechanical test: fixes the double-capture case, still
      // correctly captures two genuinely different consecutive messages.
      _hookInput: function() {
        var self = registry.claude; if(self._hooked) return; self._hooked = true;
        document.addEventListener('keydown', function(e) {
          if(e.key==='Enter'&&!e.shiftKey){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2&&t!==self._prompts[self._prompts.length-1])self._prompts.push(t);}}
        }, true);
        document.addEventListener('click', function(e) {
          var btn=e.target.closest('button[aria-label*="Send"],button[type="submit"]');if(btn){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2&&t!==self._prompts[self._prompts.length-1])self._prompts.push(t);}}
        }, true);
      },
      getPrompt: function() {
        registry.claude._hookInput();
        return (registry.claude._prompts && registry.claude._prompts[0]) || '';
      },
      // NOTE: added — confirmed live this was completely missing, the
      // same gap Grok and Meta AI both had before their own fixes:
      // getPrompt() above only ever works for a question typed live in
      // THIS page session (via its event listeners); reopening an
      // existing conversation leaves _prompts empty, so getPrompt()
      // returns '' and the save-time fallback chain moves on to
      // promptSelectors — which, with none defined here, fell through
      // to this codebase's generic DEFAULT selectors
      // ('[data-message-author-role="user"]', '[class*="user-message"]'),
      // neither of which matches Claude's own confirmed structure
      // (data-testid="user-message", not a class). Result: a genuinely
      // empty title for any reopened Claude conversation. This is a
      // last-resort fallback only — see the historySeed-based extraction
      // in the main save flow below, which is tried first and is more
      // reliable, since it comes directly from Claude's own API data
      // rather than the DOM at all.
      promptSelectors: ['[data-testid="user-message"]'],
      // ── Attachment detection (lightweight index, not the files) ──────────
      // Confirmed live, directly from real DOM captured via Inspect: an
      // attached file's filename + type sit together in a single element,
      // e.g. <h2 title="report.pdf">report.pdf<span>·</span>
      // <span class="text-muted">PDF</span></h2> — and confirmed this
      // EXACT structure is already present in the collapsed, inline card
      // as it sits in the conversation, before any click — so this can
      // run passively at save time with no need to simulate opening each
      // attachment first. Originally scoped to h2[title] elements with a
      // trailing .text-muted type badge — confirmed live via real DOM
      // inspection that Claude's attachment cards no longer use this
      // structure at all (no h2 element present anywhere in a current
      // attachment card), which fully explains why only some — not all —
      // attachments in a multi-file conversation were ever being
      // detected: whatever got picked up wasn't coming from this
      // function matching correctly at all, since its selector could
      // never match the new markup. New, primary selector targets the
      // actual, current structure directly: each attachment is a
      // ".group/artifact-block" container with a plain, non-heading title
      // div and a separate "Document · TYPE" div. Old h2[title] check
      // kept as a fallback in case that structure still appears in some
      // other, not-yet-seen context.
      getAttachments: function() {
        var attachments = [];
        try {
          var blocks = document.querySelectorAll('.group\\/artifact-block');
          blocks.forEach(function(block) {
            var titleEl = block.querySelector('.leading-tight.text-sm.line-clamp-1');
            var typeEl = block.querySelector('.text-xs.line-clamp-1.text-text-400');
            var filename = titleEl ? (titleEl.textContent || '').trim() : '';
            var typeText = typeEl ? (typeEl.textContent || '').trim() : '';
            var type = typeText.split('\u00b7').pop().replace(/\u00a0/g, '').trim();
            if (filename && type && type.length <= 8) {
              attachments.push({ filename: filename, type: type.toLowerCase() });
            }
          });
          if (!attachments.length) {
            var els = document.querySelectorAll('h2[title]');
            els.forEach(function(h2) {
              var spans = h2.querySelectorAll('span.text-muted');
              if (spans.length >= 1) {
                var typeSpan = spans[spans.length - 1];
                var type = (typeSpan.textContent || '').trim();
                if (type && type.length <= 6 && /^[A-Za-z0-9]+$/.test(type)) {
                  var filename = h2.getAttribute('title') || '';
                  if (filename) attachments.push({ filename: filename, type: type.toLowerCase() });
                }
              }
            });
          }
        } catch(_) {}
        return attachments;
      }
    },
    chatgpt: {
      // Old selector targeted [data-message-author-role="user"], an
      // attribute that no longer exists in ChatGPT's current DOM (confirmed
      // live: the real structure uses data-turn="user"/"assistant" instead
      // — see DOM_SELECTORS['chatgpt.com'] above). That mismatch meant
      // getPrompt() always returned '', which is why diary entry titles
      // were coming through blank.
      promptSelectors: ['section[data-turn="user"] .text-base'],
      getPrompt: function() {
        var els = document.querySelectorAll('section[data-turn="user"] .text-base');
        if (els.length > 0) {
          var t = (els[0].textContent||'').trim().slice(0,500); // first user message = conversation topic
          if (t.length > 2) return t;
        }
        return '';
      },
      // ── Attachment detection (lightweight index, not the files) ──────────
      // Confirmed live, directly from real DOM captured via Inspect: the
      // full filename WITH its extension (e.g. "Report.xlsx") sits as the
      // text content of a span with class
      // "text-token-text-primary truncate text-sm font-medium" — simpler
      // than Claude's structure, where filename and type were in separate
      // places. Confirmed present in the collapsed, always-visible card
      // (hover-state classes like group-hover/open-file:hidden/:inline on
      // sibling elements confirm this is the normal, interactive card, not
      // something only revealed after clicking), and confirmed directly
      // that the filename is visible in the thread without any clicking
      // at all — so this can run passively at save time, same as Claude.
      // Filters matches by a real, known file-extension pattern at the
      // end of the text (not just class name) specifically to avoid
      // false positives — these are fairly generic Tailwind utility
      // classes that could plausibly appear on unrelated text elsewhere
      // on the page — verified against a decoy element (same classes,
      // ordinary non-file text) before shipping this.
      getAttachments: function() {
        var attachments = [];
        try {
          var els = document.querySelectorAll('span.text-token-text-primary.truncate.text-sm.font-medium');
          var extPattern = /\.(pdf|docx?|xlsx?|pptx?|md)$/i;
          els.forEach(function(span) {
            var text = (span.textContent || '').trim();
            var m = text.match(extPattern);
            if (m && text.length > m[1].length + 1) {
              attachments.push({ filename: text, type: m[1].toLowerCase() });
            }
          });
        } catch(_) {}
        return attachments;
      }
    },

    gemini: {
      promptSelectors: ['.query-text-line', '.user-query-bubble-with-background'],
      getPrompt: function() {
        // .query-text-line is the actual question text element, confirmed
        // via live DOM inspection to be a SIBLING of Gemini's "You said"
        // sr-only label — not a parent of it — so this selector avoids the
        // "You said" leak at the source rather than needing to strip it
        // afterward. .user-query-bubble-with-background kept as a fallback
        // for older/differently-structured pages, with the same regex
        // strip as a defensive backup in case that fallback path fires.
        var els = document.querySelectorAll('.query-text-line');
        if (els.length > 0) {
          var t = (els[0].textContent || '').trim();
          if (t) return t.slice(0, 500);
        }
        var fallbackEls = document.querySelectorAll('.user-query-bubble-with-background');
        return fallbackEls.length > 0 ? (fallbackEls[0].textContent||'').replace(/^You said\s*/i,'').trim().slice(0,500) : '';
      },
      // ── Attachment detection (lightweight index, not the files) ──────────
      // Confirmed live, directly from real DOM captured via Inspect:
      // [data-test-id="file-name"] — a dedicated, purpose-built test
      // attribute rather than a generic utility class, making this the
      // most reliable of the three providers verified so far. The full
      // filename WITH extension sits in this element's title attribute
      // (the visible text content omits the extension, same pattern as
      // Claude); type is derived directly from that extension rather
      // than relying on the separate, sibling ".file-type-lr" text
      // element, since title alone already carries everything needed.
      // Confirmed present in the card as it sits in the thread, without
      // clicking or hovering on anything first.
      getAttachments: function() {
        var attachments = [];
        try {
          var els = document.querySelectorAll('[data-test-id="file-name"]');
          els.forEach(function(el) {
            var fullName = (el.getAttribute('title') || '').trim();
            var m = fullName.match(/\.([a-zA-Z0-9]+)$/);
            if (fullName && m) {
              attachments.push({ filename: fullName, type: m[1].toLowerCase() });
            }
          });
        } catch(_) {}
        return attachments;
      }
    },
    perplexity: {
      // NOTE: '.line-clamp-6' replaced again — confirmed live it was only
      // CONDITIONALLY present, applied by Perplexity's own code only when
      // a question is long enough to need truncating. Short questions
      // never got the class at all, making it inherently unreliable
      // (this explains a recurring "titles missing" symptom, distinct
      // from the earlier "selector went fully dead" issue that also hit
      // this same field). Replaced with the stable parent wrapper,
      // '.max-h-[144px].overflow-hidden', confirmed live via direct
      // testing across a growing multi-turn conversation (correctly
      // returned 1, then 2, matching real question count each time) —
      // present unconditionally regardless of question length.
      promptSelectors: ['.max-h-\\[144px\\].overflow-hidden'],
      getPrompt: function() {
        var els = document.querySelectorAll('.max-h-\\[144px\\].overflow-hidden');
        if (els.length > 0) { var t = (els[0].textContent||'').trim().slice(0,500); if(t.length>2) return t; }
        return '';
      },
      // ── Attachment detection (lightweight index, not the files) ──────────
      // Confirmed live, directly from real DOM captured via Inspect.
      // IMPORTANT: neither the icon reference NOR the descriptive label
      // text follows a single, predictable convention across file types
      // — confirmed live through two separate rounds of real testing.
      // Icon names vary: PDF explicitly includes its extension
      // ("#pplx-icon-file-type-pdf"), but Excel and DOCX use generic
      // names with no extension at all ("#pplx-icon-file-spreadsheet",
      // "#pplx-icon-file-text" — NOT "-word" as first guessed from a
      // different, smaller upload-chip card style entirely). Label text
      // is equally inconsistent: "PDF Document" and "Excel Spreadsheet"
      // both name their format, but DOCX's label is simply "Document" —
      // no format name at all, which silently broke an earlier version
      // of this function that only checked the label. Combines BOTH
      // signals so a gap or wrong guess in one doesn't silently break
      // detection entirely: tries the icon suffix first, falls back to
      // the label text only if the icon doesn't match a known type.
      // Verified against all three real file types together, confirmed
      // via two separate live tests before landing on this combined
      // approach. Confirmed present in the thread without clicking or
      // hovering on anything first.
      getAttachments: function() {
        var attachments = [];
        try {
          var seen = {};
          var ICON_TYPE_MAP = { 'type-pdf': 'pdf', 'spreadsheet': 'xlsx', 'text': 'docx', 'word': 'docx', 'presentation': 'pptx', 'powerpoint': 'pptx' };
          var LABEL_TYPE_MAP = { pdf: 'pdf', word: 'docx', excel: 'xlsx', powerpoint: 'pptx', spreadsheet: 'xlsx', presentation: 'pptx', document: 'docx' };
          var useEls = document.querySelectorAll('use');
          useEls.forEach(function(useEl) {
            var href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '';
            var iconMatch = href.match(/^#pplx-icon-file-(.+)$/);
            if (!iconMatch) return;
            var card = useEl.closest('.group');
            if (!card) return;
            var nameEl = card.querySelector('.font-bold.truncate');
            var name = nameEl ? (nameEl.textContent || '').trim() : '';
            if (!name) return;

            var type = ICON_TYPE_MAP[iconMatch[1]] || null;
            if (!type) {
              var labelEls = card.querySelectorAll('.text-secondary.truncate');
              for (var i = 0; i < labelEls.length; i++) {
                var firstWord = (labelEls[i].textContent || '').trim().split(/\s+/)[0].toLowerCase();
                if (LABEL_TYPE_MAP[firstWord]) { type = LABEL_TYPE_MAP[firstWord]; break; }
              }
            }
            if (!type) return;
            var key = name + '.' + type;
            if (seen[key]) return;
            seen[key] = true;
            attachments.push({ filename: key, type: type });
          });
        } catch(_) {}
        return attachments;
      }
    },
    deepseek: {
      _prompts: [],
      // NOTE: promptSelectors added — confirmed live that
      // getAllCapturedPrompts() (used for multi-question bolding in the
      // interleave logic) specifically falls back to THIS property when
      // no _prompts array is already populated, distinct from getPrompt()
      // below. registry.deepseek never defined it, so getAllCapturedPrompts
      // always returned an empty array for DeepSeek regardless of whether
      // the underlying selectors themselves worked — explaining why no
      // question ever got bolded in multi-question saves, even though the
      // initial single-question title (via getPrompt(), a separate code
      // path) worked fine. Confirmed live: [class*="_9663006"] correctly
      // matches real questions (returned 2 for a real 2-question
      // conversation); human-turn and user-message are both dead.
      promptSelectors: ['[class*="_9663006"]', '[class*="human-turn"]', '[class*="user-message"]'],
      getPrompt: function() {
        var sels = ['[class*="_9663006"]','[class*="human-turn"]','[class*="user-message"]'];
        for (var i = 0; i < sels.length; i++) {
          try {
            var els = queryAllDeep(sels[i]);
            if (els.length > 0) {
              // NOTE: no longer writes to self._prompts. Confirmed live:
              // getAllCapturedPrompts() checks config._prompts FIRST,
              // before ever falling back to config.promptSelectors — if
              // this side effect ran early (e.g. when only one question
              // existed yet) and left a stale, incomplete array behind,
              // getAllCapturedPrompts() would see it as non-empty and
              // never reach the correct, fresh promptSelectors query at
              // all. _prompts is meant only for the input-hook mechanism
              // (Claude/Grok/Meta's event-driven accumulation) — DOM-query
              // getPrompt() functions like this one should never write to
              // it. Verified via direct simulation before this fix.
              var found = Array.from(els).map(function(el){return(el.textContent||'').trim();}).filter(function(t){return t.length>2&&t.length<2000;});
              if (found.length > 0) return found[0];
            }
          } catch(_) {}
        }
        return '';
      },
      // ── Attachment detection (lightweight index, not the files) ──────────
      // Confirmed live, directly from real DOM captured via Inspect: the
      // full filename WITH extension sits as the text content of a div
      // with class "e70accd6". NOTE: unlike the other four providers'
      // class names (semantic, utility-style — e.g. "truncate",
      // "text-sm"), this one is a short, hash-style identifier typical
      // of auto-generated build tooling, and genuinely more likely to
      // change on a future DeepSeek deploy without any real UI change at
      // all — a real, different risk profile than the other four, not
      // something to treat as equally stable. Uses queryAllDeep() rather
      // than plain document.querySelectorAll(), matching this same
      // provider's own getPrompt() above, since DeepSeek's page has
      // already been confirmed to need shadow-DOM piercing elsewhere.
      // Filtered by a real file-extension match at the end of the text,
      // same safety pattern as the other class-name-based providers.
      // Confirmed present in the thread without clicking or hovering on
      // anything first.
      getAttachments: function() {
        var attachments = [];
        try {
          var els = queryAllDeep('.e70accd6');
          var extPattern = /\.(pdf|docx?|xlsx?|pptx?|md)$/i;
          els.forEach(function(el) {
            var text = (el.textContent || '').trim();
            var m = text.match(extPattern);
            if (m && text.length > m[1].length + 1) {
              attachments.push({ filename: text, type: m[1].toLowerCase() });
            }
          });
        } catch(_) {}
        return attachments;
      }
    },
    grok: {
      _prompts: window.__diaryInputPrompts.grok, _hooked: false,
      // NOTE: promptSelectors added — confirmed live this was actually
      // still missing here despite being claimed fixed previously.
      // getAllCapturedPrompts() (the separate, multi-question bolding
      // system) checks _prompts first but falls through to
      // promptSelectors when empty — a path that was never available
      // here at all without this.
      promptSelectors: ['[data-testid="user-message"]'],
      // See claude's identical comment above — same dedup guard against
      // double-capture from Enter + a possible internal synthetic click.
      _hookInput: function() {
        var self = registry.grok; if(self._hooked) return; self._hooked = true;
        // NOTE: seed _prompts from the DOM before attaching listeners —
        // same fix as Meta AI's identical bug, applied here proactively
        // since both providers share the exact same _prompts/
        // _hookInput/promptSelectors structure. See Meta AI's detailed
        // comment for the full rationale: without this, a conversation's
        // already-sent first question never enters _prompts at all, and
        // if a fresh follow-up is then typed in this session, _prompts
        // ends up containing ONLY that later question — which
        // getAllCapturedPrompts() returns immediately, completely
        // skipping promptSelectors, silently missing the first question
        // and throwing off all the position-based interleaving math
        // after it.
        try {
          var seedEls = document.querySelectorAll(self.promptSelectors[0]);
          Array.from(seedEls).forEach(function(el) {
            var t = (el.textContent || '').trim();
            if (t && t.length > 2 && self._prompts.indexOf(t) === -1) self._prompts.push(t);
          });
        } catch(e) {}
        document.addEventListener('keydown', function(e) {
          if(e.key==='Enter'&&!e.shiftKey){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2&&t!==self._prompts[self._prompts.length-1])self._prompts.push(t);}}
        }, true);
        document.addEventListener('click', function(e) {
          var btn=e.target.closest('button[type="submit"]');if(btn){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2&&t!==self._prompts[self._prompts.length-1])self._prompts.push(t);}}
        }, true);
      },
      getPrompt: function() { registry.grok._hookInput(); return (registry.grok._prompts&&registry.grok._prompts[0])||''; },
      // ── Attachment detection (lightweight index, not the files) ──────────
      // Confirmed live, directly from real DOM captured via Inspect: the
      // full filename WITH extension sits as the text content of
      // span.truncate.text-sm.text-fg-primary — same pattern as ChatGPT
      // (filename+extension together in one place, not split across a
      // title attribute and a separate type element like Claude/Gemini).
      // Same genericity risk as ChatGPT's classes too, so filtered the
      // same way: only counted as an attachment if the text actually
      // ends in a known file extension, verified against a decoy element
      // (same classes, ordinary non-file text) before shipping this.
      // Confirmed present in the thread without clicking or hovering on
      // anything first.
      getAttachments: function() {
        var attachments = [];
        try {
          var els = document.querySelectorAll('span.truncate.text-sm.text-fg-primary');
          var extPattern = /\.(pdf|docx?|xlsx?|pptx?|md)$/i;
          els.forEach(function(span) {
            var text = (span.textContent || '').trim();
            var m = text.match(extPattern);
            if (m && text.length > m[1].length + 1) {
              attachments.push({ filename: text, type: m[1].toLowerCase() });
            }
          });
        } catch(_) {}
        return attachments;
      }
    },
    mistral: {
      // NOTE: promptSelectors replaced — all three previously-configured
      // selectors ('[data-message-role="user"] p', '[class*="UserMessage"]',
      // '[data-testid="user-message"]') confirmed live to be completely
      // dead (0 matches each) on Mistral's current page. Replaced with
      // '.ms-auto span.whitespace-pre-wrap' — confirmed live to correctly
      // match exactly the real questions in a multi-turn conversation, in
      // the right order. ms-auto (right-aligning the user's own message
      // bubble) is a reasonable anchor precisely because AI responses
      // wouldn't share that alignment.
      promptSelectors: ['.ms-auto span.whitespace-pre-wrap'],
      getPrompt: function() {
        var sels = ['.ms-auto span.whitespace-pre-wrap'];
        for (var i = 0; i < sels.length; i++) {
          var els = document.querySelectorAll(sels[i]);
          if (els.length > 0) { var t = (els[0].textContent||'').trim().replace(/\s*\d{1,2}:\d{2}(?:am|pm)?\s*/gi,'').slice(0,500); if(t.length>2) return t; }
        }
        return '';
      },
      // ── Attachment detection (lightweight index, not the files) ──────────
      // NOTE: fixed — confirmed live, directly from real DOM captured via
      // Inspect, that the span.line-clamp-2 pattern this previously
      // relied on no longer matches anything on Mistral's current page
      // at all: the canvas feature's own export control is a dropdown
      // offering "Markdown"/"PDF" as generic format labels, with NO
      // filename anywhere in it — that dropdown was the only thing
      // actually captured by the earlier selector's assumptions. The
      // real document title lives entirely separately, in the canvas
      // panel's own header row, as a plain <span class="...truncate">
      // with NO file extension in its text at all (e.g. "Finnmaster
      // Boat Financing in Norway – Brief Summary") — meaning even a
      // corrected selector alone couldn't have worked with the
      // old extension-suffix requirement, since that title will never
      // end in .pdf/.md by design.
      //
      // Anchored on button[aria-label="Export as"] — a stable, semantic
      // attribute — rather than the surrounding utility-class soup,
      // then walks up to the shared header row to find the title
      // sibling. Tracks BOTH possible export types (pdf, md) for the
      // same document, since the user can choose either from that same
      // dropdown — the real download's own reported MIME type (via
      // deriveRealFileType in background.js) correctly resolves to
      // whichever one was actually chosen, no ambiguity in practice.
      getAttachments: function() {
        var attachments = [];
        try {
          var exportBtns = document.querySelectorAll('button[aria-label="Export as"]');
          exportBtns.forEach(function(btn) {
            var header = btn.closest('.rounded-t-xl') || (btn.parentElement && btn.parentElement.parentElement);
            var titleSpan = header ? header.querySelector('span.truncate') : null;
            var text = titleSpan ? (titleSpan.textContent || '').trim() : '';
            if (text) {
              attachments.push({ filename: text, type: 'pdf' });
              attachments.push({ filename: text, type: 'md' });
            }
          });
        } catch(_) {}
        return attachments;
      }
    },
    meta: {
      _prompts: window.__diaryInputPrompts.meta, _hooked: false,
      // NOTE: promptSelectors added — same underlying fix as Grok's
      // identical gap: getAllCapturedPrompts() (the separate, multi-
      // question bolding system) checks _prompts first but falls
      // through to promptSelectors when empty — a path that was never
      // available here before, since it was never defined.
      promptSelectors: ['[data-message-type="user"] .text-response'],
      // See claude's identical comment above — same dedup guard against
      // double-capture from Enter + a possible internal synthetic click.
      _hookInput: function() {
        var self = registry.meta; if(self._hooked) return; self._hooked = true;
        // NOTE: seed _prompts from the DOM BEFORE attaching listeners —
        // confirmed live this was the actual root cause of subsequent
        // questions in a multi-question thread being dumped at the very
        // end of the saved content instead of correctly interleaved.
        // getAllCapturedPrompts() checks _prompts FIRST and returns it
        // immediately whenever it's non-empty, completely skipping
        // promptSelectors — but _prompts only ever gets populated by
        // these Enter/click listeners, which can only fire for messages
        // typed DURING this page session. A conversation's first
        // question, already sent before the page loaded, would never
        // trigger them at all — so if a follow-up was then typed fresh
        // in this same session, _prompts ended up containing ONLY that
        // later question, silently missing the first one entirely. That
        // one missing entry at the start throws off all the position-
        // based interleaving math for everything captured after it.
        // Seeding from the DOM here, using the same promptSelectors
        // query, means _prompts always starts with every already-sent
        // question already in place, with the listeners below only ever
        // appending genuinely new ones on top.
        try {
          var seedEls = document.querySelectorAll(self.promptSelectors[0]);
          Array.from(seedEls).forEach(function(el) {
            var t = (el.textContent || '').trim();
            if (t && t.length > 2 && self._prompts.indexOf(t) === -1) self._prompts.push(t);
          });
        } catch(e) {}
        document.addEventListener('keydown', function(e) {
          if(e.key==='Enter'&&!e.shiftKey){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2&&t!==self._prompts[self._prompts.length-1])self._prompts.push(t);}}
        }, true);
        document.addEventListener('click', function(e) {
          var btn=e.target.closest('button[type="submit"],button[aria-label*="Send"]');if(btn){var inp=document.querySelector('[contenteditable="true"]')||document.querySelector('textarea');if(inp){var t=(inp.value||inp.innerText||inp.textContent||'').replace(/^\n+|\n+$/g,'').trim();if(t&&t.length>2&&t!==self._prompts[self._prompts.length-1])self._prompts.push(t);}}
        }, true);
      },
      getPrompt: function() {
        // NOTE: DOM-scrape added as the PRIMARY path — same fix pattern
        // as Grok's identical bug, but built from the CORRECT Meta AI
        // DOM this time (an earlier version of this fix was mistakenly
        // built from Claude's HTML, pasted here by accident, and has
        // been fully reverted). The event-listener capture below only
        // grabs whatever is CURRENTLY in the generic
        // [contenteditable="true"]/<textarea> selector at the moment of
        // Enter/click, which is fragile and can pick up unrelated
        // surrounding UI text — confirmed live as the cause of a real,
        // garbled prompt (filename, file-type badge, and a "Today"
        // timestamp all concatenated together with no spaces).
        // [data-message-type="user"] is an explicit, purpose-built
        // attribute confirming a genuine user-message container — but
        // that container ALSO includes a timestamp span and a "Copy
        // response" button nested inside it, so grabbing its full
        // textContent would reintroduce the exact same concatenation
        // bug (verified directly: it would append the message date).
        // Scoped further to the inner .text-response span specifically,
        // confirmed via direct simulation to correctly isolate just the
        // clean message text before shipping this. Cached in a window-
        // backed variable, same as Grok, in case Meta AI also
        // virtualizes older messages out of the DOM as a conversation
        // grows — untested here specifically, but cheap insurance
        // against the same failure mode already confirmed for Grok.
        if (window.__diaryMetaFirstPrompt) return window.__diaryMetaFirstPrompt;
        var container = document.querySelector('[data-message-type="user"]');
        var textEl = container ? container.querySelector('.text-response') : null;
        if (textEl) {
          var scraped = (textEl.textContent || '').trim().slice(0, 500);
          if (scraped.length > 2) { window.__diaryMetaFirstPrompt = scraped; return scraped; }
        }
        registry.meta._hookInput();
        var fallbackResult = (registry.meta._prompts&&registry.meta._prompts[0])||'';
        if (fallbackResult) window.__diaryMetaFirstPrompt = fallbackResult;
        return fallbackResult;
      },
      // ── Attachment detection (lightweight index, not the files) ──────────
      // Confirmed live, directly from real DOM captured via Inspect: same
      // split pattern as Claude/Gemini — filename WITHOUT extension in
      // one element (.text-subheadline-medium.truncate), type in a
      // separate sibling (.text-footnote.truncate) sharing the same
      // parent container. Paired via the shared parent rather than
      // assuming DOM order, then reconstructed into a single
      // filename.extension string, matching the other providers' output
      // shape. Sanity-checked the type value (short, alphanumeric) to
      // avoid false positives — verified against a decoy filename-style
      // element with no matching type sibling before shipping this.
      // Confirmed present in the thread without clicking or hovering on
      // anything first.
      getAttachments: function() {
        var attachments = [];
        try {
          var nameEls = document.querySelectorAll('.text-subheadline-medium.truncate');
          nameEls.forEach(function(nameEl) {
            var parent = nameEl.parentElement;
            if (!parent) return;
            var typeEl = parent.querySelector('.text-footnote.truncate');
            if (!typeEl) return;
            var type = (typeEl.textContent || '').trim();
            var name = (nameEl.textContent || '').trim();
            if (name && type && type.length <= 6 && /^[A-Za-z0-9]+$/.test(type)) {
              attachments.push({ filename: name + '.' + type.toLowerCase(), type: type.toLowerCase() });
            }
          });
        } catch(_) {}
        return attachments;
      }
    }
  };

  const PROVIDER_CONFIG = registry[PROVIDER_ID];

function queryAllDeep(selector) {
    const roots = [document], collected = [];
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      try { collected.push(...Array.from(root.querySelectorAll(selector))); } catch (_) {}
      try {
        for (const host of root.querySelectorAll('*')) {
          if (host.shadowRoot && !roots.includes(host.shadowRoot))
            roots.push(host.shadowRoot);
        }
      } catch (_) {}
    }
    return collected;
  }

  // ── Auth detection ──────────────────────────────────────────────────────────
  const AUTH_SIGNALS = {
    chatgpt:    () => !!document.querySelector('#prompt-textarea, [data-testid="profile-button"], [data-testid="user-menu"]'),
    claude:     () => !!document.querySelector('.ph-no-capture, [class*="ConversationList"], [data-testid="user-menu"], [class*="UserMenu"]') || (window.location.hostname === 'claude.ai' && !window.location.pathname.includes('login') && !window.location.hash.includes('magic')),
    gemini:     () => !!document.querySelector('[data-ogsr-up], bard-sidenav, .conversation-list, [aria-label*="Google Account"]'),
    // For API providers, detect the chat interface being present (only shown when logged in)
    perplexity: () => !!document.querySelector('textarea, [placeholder*="Ask"], [data-testid="search-input"], main'),
    deepseek:   () => !!document.querySelector('textarea, [id*="chat"], [class*="chat-input"], main'),
    grok:       () => !!document.querySelector('textarea, [data-testid="tweetTextarea_0"], [aria-label*="Ask"], main'),
    mistral:    () => !!document.querySelector('textarea, [placeholder*="Ask"], [class*="chat"], main'),
    meta:       () => !!document.querySelector('textarea, [placeholder*="Ask"], [class*="chat"], main'),
  };

  function isAuthenticated() {
    try { return (AUTH_SIGNALS[PROVIDER] || (() => false))(); } catch (_) { return false; }
  }

  // Report auth status
  function reportAuthStatus() {
    window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'AUTH_STATUS', provider: PROVIDER, authenticated: isAuthenticated() }}, '*');
  }
  setTimeout(reportAuthStatus, 2000);
  setTimeout(reportAuthStatus, 5000);

  // ── Prompt injection (ported from main.js injectTextChatgpt / injectText) ───
  const normalize = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const getInputText = (el) => {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return String(el.value || '');
    return String(el.innerText || el.textContent || '');
  };

  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return true;
    // Relax for Claude ProseMirror (height=0 when empty)
    const tag = (el.tagName || '').toLowerCase();
    return rect.width > 0 && (tag === 'textarea' || tag === 'input' || el.isContentEditable === true);
  };

  // Provider-specific input selectors (from main.js)
  const INPUT_SELECTORS = {
    chatgpt: [
      'div.ProseMirror[contenteditable="true"]',
      '#prompt-textarea',
      'textarea#prompt-textarea',
      'textarea[data-testid*="prompt"]',
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
      'textarea'
    ],
    claude: [
      '[data-testid="chat-input"]',
      '.tiptap.ProseMirror[contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]',
      'main form textarea',
      'form textarea',
      'textarea[placeholder*="How can I help"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Reply"]',
      'main [contenteditable="true"][role="textbox"]',
      'main [contenteditable="true"]'
    ],
    gemini: [
      'textarea[aria-label*="Ask Gemini"]',
      'textarea[aria-label*="Enter a prompt"]',
      'textarea[placeholder*="Ask Gemini"]',
      'rich-textarea textarea',
      'main textarea',
      'main [contenteditable="true"][role="textbox"]',
      'main [contenteditable="true"]'
    ],
    perplexity: [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Search"]',
      '[contenteditable="true"][class*="editor"]',
      'textarea'
    ],
    deepseek: [
      'textarea#chat-input',
      'textarea[placeholder*="Send a message"]',
      'textarea[placeholder*="Ask"]',
      'textarea',
      '[contenteditable="true"]'
    ],
    grok: [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      '[contenteditable="true"][data-lexical-editor]',
      'textarea'
    ],
    mistral: [
      'textarea[placeholder*="Ask"]',
      'textarea[placeholder*="Message"]',
      '[contenteditable="true"]',
      'textarea'
    ]
  };

  function findInput() {
    const selectors = INPUT_SELECTORS[PROVIDER] || ['textarea', '[contenteditable="true"]'];
    const candidates = [];

    for (const selector of selectors) {
      let nodes = [];
      try {
        nodes = PROVIDER === 'deepseek' || PROVIDER === 'mistral'
          ? queryAllDeep(selector)
          : Array.from(document.querySelectorAll(selector));
      } catch (_) { continue; }

      for (const el of nodes) {
        if (!isVisible(el)) continue;
        let score = 0;
        const placeholder = String(el.getAttribute('placeholder') || '').toLowerCase();
        const ariaLabel   = String(el.getAttribute('aria-label')  || '').toLowerCase();
        const testId      = String(el.getAttribute('data-testid') || '').toLowerCase();
        if (el.id === 'prompt-textarea') score += 500;
        if (el.getAttribute('data-testid') === 'chat-input') score += 500;
        if (el.classList.contains('tiptap') || el.classList.contains('ProseMirror')) score += 400;
        if (el.id === 'prompt-textarea' || el.getAttribute('data-id') === 'root') score += 300;
        if (testId.includes('prompt'))   score += 220;
        if (placeholder.includes('ask') || placeholder.includes('message')) score += 140;
        if (ariaLabel.includes('ask')   || ariaLabel.includes('message'))   score += 120;
        if (el.closest('main, [role="main"]')) score += 100;
        if (el.closest('form'))  score += 90;
        const rect = el.getBoundingClientRect();
        if (rect.top > window.innerHeight * 0.45) score += 80;
        if (el.closest('aside, nav, [class*="sidebar"]')) score -= 500;
        candidates.push({ el, score });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].el;
  }

  function setInputValue(input, text) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const proto = input.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
      const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
      if (descriptor?.set) descriptor.set.call(input, text);
      else input.value = text;
      input.focus();
      if (input.setSelectionRange) input.setSelectionRange(text.length, text.length);
      input.dispatchEvent(new Event('input',  { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    } else {
      // contenteditable — use execCommand for Tiptap/ProseMirror compatibility
      input.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      const inserted = document.execCommand('insertText', false, text);
      if (!inserted) {
        input.textContent = text;
        input.innerText = text;
        input.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, inputType: 'insertText', data: text
        }));
      }
    }
  }

  function clickSend(input, text) {
    const root = input.closest('form, main, [role="main"], article') || document;
    const promptNeedle = normalize(text).slice(0, 48);
    const preSendText  = normalize(getInputText(input));

    // First try document-wide priority selectors
    const priorityBtn = document.querySelector('[data-testid="send-button"]:not([disabled]), [id="composer-submit-button"]:not([disabled])');
    if (priorityBtn && isVisible(priorityBtn)) {
      priorityBtn.click();
      return;
    }

    const sendButtons = Array.from(root.querySelectorAll(
      'button, [role="button"], [type="submit"], [data-testid]'
    )).filter((btn) => {
      if (!isVisible(btn) || btn.disabled) return false;
      const type    = String(btn.getAttribute('type')         || '').toLowerCase();
      const txt     = String(btn.textContent                  || '').toLowerCase();
      const label   = String(btn.getAttribute('aria-label')   || '').toLowerCase();
      const testId  = String(btn.getAttribute('data-testid')  || '').toLowerCase();
      if (type === 'submit') return true;
      if (testId === 'send-button') return true;
      if (testId === 'composer-submit-button') return true;
      if (txt.includes('send') || label.includes('send') || testId.includes('send')) return true;
      // Proximity to input
      const inRect  = input.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      return Math.abs(btnRect.top - inRect.top) < 120 && Math.abs(btnRect.left - inRect.right) < 220;
    });

    if (sendButtons.length > 0) {
      sendButtons[0].click();
    } else {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
      input.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
    }
  }

  async function injectPrompt(text) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    if (!isAuthenticated()) {
      console.warn(`[Forge] ${PROVIDER}: not signed in`);
      return false;
    }

    // Wait for input to be available
    let input = null;
    for (let i = 0; i < 20; i++) {
      input = findInput();
      if (input) break;
      await sleep(500);
    }

    if (!input) {
      console.warn(`[Forge] ${PROVIDER}: input not found`);
      return false;
    }

    setInputValue(input, text);
    await sleep(300);

    const staged = normalize(getInputText(input));
    const needle = normalize(text).slice(0, 48);
    if (!staged || (needle && !staged.includes(needle))) {
      console.warn(`[Forge] ${PROVIDER}: text not staged correctly`);
      return false;
    }

    clickSend(input, text);
    console.log(`[Forge] ${PROVIDER}: prompt submitted`);
    return true;
  }

  // ── Response capture (ported from response-capture.js) ──────────────────────
  



  

  // Collect image URLs from response DOM, send to background for fetch+upload
  async function captureResponseImages(token) {
    try {
      const selectors = PROVIDER_CONFIG.responseSelectors || [];
      let bestEl = null, bestLen = 0;
      for (const sel of selectors) {
        const els = Array.from(document.querySelectorAll(sel));
        const last = els.filter(el => el.textContent.trim().length > 30).pop();
        if (last && last.textContent.trim().length > bestLen) {
          bestLen = last.textContent.trim().length;
          bestEl = last;
        }
      }
      if (!bestEl) return [];

      // Look in response element first, then fall back to provider-specific image containers
      var imgEls = Array.from(bestEl.querySelectorAll('img'));
      
      // Claude: web search images are outside the response container
      if (PROVIDER === 'claude' && imgEls.length === 0) {
        imgEls = Array.from(document.querySelectorAll('img.absolute, img[class*="object-cover"]'));
      }
      // Gemini: search result images
      if (PROVIDER === 'gemini' && imgEls.length === 0) {
        imgEls = Array.from(document.querySelectorAll('img[src*="googleapis"], img[src*="gstatic"]'));
      }
      // Perplexity: search result images — confirmed live these actually
      // render in a dedicated carousel (data-testid="image-carousel-img")
      // outside the main response container entirely. The previous
      // fallback here ('img[src*="pplx"], img[class*="result"]') was a
      // stale, never-verified guess that didn't match the real, confirmed
      // structure at all — the real image URLs don't contain "pplx", and
      // the real <img> class doesn't contain "result" either.
      if (PROVIDER === 'perplexity' && imgEls.length === 0) {
        imgEls = Array.from(document.querySelectorAll('[data-testid="image-carousel-img"] img'));
      }

      const imgUrls = imgEls.map(function(img) {
        return img.src || '';
      }).filter(function(src) {
        if (!src || src.startsWith('data:image/svg') || src.startsWith('data:image/gif') || src.startsWith('data:image/png;base64')) return false;
        if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) return false;
        // NOTE: excludes Gemini's generic file-type icon graphics
        // specifically — confirmed live from real DOM captured during
        // yesterday's attachment work: the small icon shown on each
        // attachment card (<img class="file-icon-lr" src="https://
        // drive-thirdparty.googleusercontent.com/32/type/application/
        // pdf">) is also just a plain <img> tag, so it was being
        // collected here as if it were a real, meaningful image (a
        // photo/screenshot) — the URL itself doesn't contain "icon" (only
        // its alt text does, which isn't checked here), so the existing
        // icon-keyword filter above never caught it. This URL pattern is
        // Google's generic file-type icon CDN path specifically, not
        // content generated by or relevant to the conversation itself.
        if (src.includes('drive-thirdparty.googleusercontent.com/32/type/')) return false;
        if (src.includes('gstatic.com/gemini/maps/')) return false;
        return true;
      }).slice(0, 5);

      if (!imgUrls.length) return [];

      // Send to background script which bypasses CORS restrictions
      return await new Promise(function(resolve) {
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: {
          type: 'UPLOAD_IMAGES',
          token: token,
          urls: imgUrls
        }}, '*');
        var handler = function(e) {
          if (e.data && e.data.type === '__DIARY_IMAGES_UPLOADED__') {
            window.removeEventListener('message', handler);
            resolve(e.data.urls || []);
          }
        };
        window.addEventListener('message', handler);
        setTimeout(function() { window.removeEventListener('message', handler); resolve([]); }, 30000);
      });
    } catch(e) {
      console.warn('[Diary] captureResponseImages error:', e.message);
      return [];
    }
  }

  // ── Shared: collect ALL captured questions, not just the first ─────────────
  // Every DOM-provider's getPrompt() intentionally still returns only the
  // FIRST question (used for the diary title's initial value, proven
  // working) — this is a SEPARATE function, not a change to getPrompt(),
  // used only by the content-merge step to give the saved content a fresh
  // bolded question on every save, matching how Claude/ChatGPT's content
  // already works (every turn's question bolded throughout). Reuses
  // whatever data source each provider's registry entry already exposes:
  // an already-collected _prompts array (Grok/Meta's input-hook, DeepSeek's
  // DOM-scan) if present, otherwise a live DOM query using that provider's
  // own promptSelectors (Gemini/Perplexity/Mistral) — which already
  // matches every rendered question, not just the first; the old code just
  // never looked past index 0.
  //
  // IMPORTANT: must live at true top-level IIFE scope, not inside any
  // nested block. Confirmed via AST analysis that a first attempt at this
  // insertion accidentally landed inside the "Forge Control Bar" bare
  // block — the exact same class of bug as an earlier session's
  // buildGeminiThread regression. Verified via direct inspection of the
  // outer IIFE's real direct children that this location (immediately
  // before injectSaveDiaryButton, itself a confirmed direct child) is
  // genuinely safe.
  function getAllCapturedPrompts() {
    var config = (typeof PROVIDER_CONFIG !== 'undefined') ? PROVIDER_CONFIG : null;
    if (!config) return [];
    if (config._hookInput) { try { config._hookInput(); } catch(e) {} }
    if (config._prompts && config._prompts.length) {
      return config._prompts.slice();
    }
    // Live DOM-query providers (Gemini/Perplexity/Mistral): confirmed live
    // that a fresh document.querySelectorAll() count is NOT reliable to
    // build promptCountAtCapture tagging against — Gemini can recycle
    // OLDER .query-text-line nodes out of the DOM the same way it recycles
    // response nodes (already confirmed for content), once a conversation
    // grows past a virtualization threshold. If the live count SHRINKS
    // between an earlier capture and a later one, the interleaving math
    // has no way to detect that, and produces exactly the kind of
    // misaligned/corrupted-looking question-answer pairing reported live.
    // Fix: merge live query results into a persistent, NEVER-SHRINKING
    // cache (keyed per host, since this function can be called across
    // different provider tabs) — same principle Claude/Grok/Meta's
    // input-hook _prompts array already relies on, applied here via
    // set-union instead of an event-driven push. Verified via mechanical
    // simulation of a live DOM count shrinking mid-conversation before
    // being wired in here.
    var sels = config.promptSelectors || [];
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = document.querySelectorAll(sels[i]);
        if (els.length > 0) {
          var live = Array.from(els).map(function(el) { return (el.textContent || '').trim(); }).filter(function(t) { return t.length > 2; });
          if (!window.__diaryPromptCache) window.__diaryPromptCache = {};
          var cacheKey = canonicalUrl();
          if (!window.__diaryPromptCache[cacheKey]) window.__diaryPromptCache[cacheKey] = [];
          var cache = window.__diaryPromptCache[cacheKey];
          live.forEach(function(t) {
            if (cache.indexOf(t) === -1) cache.push(t);
          });
          return cache.slice();
        }
      } catch(e) {}
    }
    return [];
  }

  // ── Shared: generic DOM-based question/answer pairing ───────────────────────
  // Reads the ACTUAL live DOM structure at save time, instead of inferring
  // pairing from timing/counting — the same principle behind Gemini's
  // dedicated version below, generalized so it can be reused across
  // providers without duplicating the walking/joining logic each time.
  // Only the SELECTORS differ per provider (unavoidable, since each site
  // has its own HTML); the pairing mechanism itself is identical. Takes a
  // single combined CSS selector matching both question and answer
  // elements (walked in true document order) plus a function to tell them
  // apart, and per-type inner selectors for extracting the actual text.
  // Returns null if nothing is found, so callers can safely fall back to
  // older logic without risk of silently producing worse output.
  // ── Shared: strip a leading echo of the question from an answer ────────────
  // Some providers' responses restate the question verbatim as the first
  // line of their own answer — confirmed live on Grok specifically in
  // "deep research"/web-search-enabled replies (visible as "Ran N
  // searches" before the answer). Since the question is already shown
  // separately, bolded, this produces what looks like a duplicated title
  // but is actually two different things sitting back to back: our own
  // label, and the provider's own restatement of it. Requires a true
  // word-boundary match right after the echoed text (not just a string-
  // prefix match) to avoid incorrectly truncating an answer that merely
  // starts with similar-looking words. Falls back to the original answer
  // untouched if stripping would leave nothing at all. Verified via
  // mechanical test against the real captured case plus deliberate
  // false-positive scenarios before being wired in here.
  // ── Shared: convert citations to Wikipedia-style footnotes ─────────────────
  // Explicit decision (refines the earlier "hide citations" fix): rather
  // than dropping URLs entirely, citations are converted to a numbered
  // inline marker (deduplicated — the same source cited multiple times
  // gets one shared number) with a "Sources" list collected at the very
  // end, matching the standard academic/reference-document convention
  // (APA/MLA/Chicago, Wikipedia's own house style) — keeps body text
  // readable without losing the underlying, verifiable source
  // information. Handles both citation styles confirmed live across
  // providers: named inline links [label](url) (Claude's style) and
  // reference-style [label][N] + a footer definition list (ChatGPT's
  // style) — both get renumbered into one unified sequence. Bare
  // footnote definitions are only ever trusted when a real, matching
  // "[N]: url" definition line is confirmed present in the same text —
  // never a blind pattern match — specifically to avoid reintroducing
  // the exact corruption bug found and fixed earlier tonight, where
  // legitimate bracketed numbers in real content (e.g. "[42]" as a
  // genuine reference) were being incorrectly altered. Verified via
  // direct test — including a same-source-cited-twice deduplication
  // case — against real content shape from actual Claude/ChatGPT saves
  // before being wired in here.
  function stripCitations(text) {
    if (!text) return text;
    // NOTE: strips inline, favicon-only images — confirmed live via a
    // real Grok entry that Google's favicon-proxy pattern
    // (google.com/s2/favicons?domain=...) shows up as genuine inline
    // ![]() markdown image syntax, not just in the separate images[]
    // array where filterCapturedImageUrls() already excludes generic
    // icons. That separate filter never touches this shared function's
    // own text at all, so these tiny site icons — not real, meaningful
    // photos — were being saved and rendered as if they were actual
    // images. This pattern isn't provider-specific (Google's favicon
    // service could appear in any provider's captured text), so this
    // lives here in the shared cleaning step, not inside a single
    // provider's own block.
    text = text.replace(/!\[[^\]]*\]\(https?:\/\/www\.google\.com\/s2\/favicons\?[^)]*\)\n*/g, '');
    var footnoteDefs = {};
    var defRegex = /^\[(\d+)\]:\s+(\S+).*$/gm;
    var m;
    while ((m = defRegex.exec(text)) !== null) {
      footnoteDefs[m[1]] = m[2];
    }

    var sources = [];
    var sourceIndex = {};
    function getFootnoteNumber(label, url) {
      if (sourceIndex[url] !== undefined) return sourceIndex[url];
      sources.push({ label: label, url: url });
      var num = sources.length;
      sourceIndex[url] = num;
      return num;
    }

    // NOTE: splits a compound "pillLabel␟footerLabel␟faviconUrl" string
    // (U+241F separator) back into its parts — see parseHistorySeed() in
    // diary-interceptor.js for why this exists: Claude's own page uses a
    // SHORT site name for the compact, inline citation pill, but a
    // fuller article title for the separate Sources list, and a single
    // shared label couldn't serve both at once. The favicon part is
    // newer and optional — added per direct user request to show the
    // source's logo in the hover popup, matching Claude's own page.
    // Providers that never encode a separator at all (every provider
    // besides Claude, which only ever had one simple label to begin
    // with) safely fall back to using that same single label for pill
    // and footer, with no favicon at all.
    function splitCompoundLabel(label) {
      var sepIdx = label.indexOf('\u241F');
      if (sepIdx === -1) return { pill: label, footer: label, favicon: '' };
      var rest = label.slice(sepIdx + 1);
      var secondSepIdx = rest.indexOf('\u241F');
      if (secondSepIdx === -1) return { pill: label.slice(0, sepIdx), footer: rest, favicon: '' };
      return { pill: label.slice(0, sepIdx), footer: rest.slice(0, secondSepIdx), favicon: rest.slice(secondSepIdx + 1) };
    }

    // NOTE: (?<!!) lookbehind added to both patterns below — confirmed
    // live as the actual root cause of two separate, previously-
    // unexplained Gemini symptoms: icon URLs (e.g. a PDF's generic file-
    // type icon) appearing in the "Sources:" footer as if they were real
    // citations, and broken "![1]"-style references with no URL. Neither
    // pattern previously excluded a preceding "!" — meaning Turndown's
    // own image syntax "![alt](url)" matched identically to a genuine
    // citation link "[label](url)", since the match starts at "[",
    // ignoring anything before it. That caused an image to be silently
    // treated as a citation: its [alt](url) got replaced with a bare
    // footnote number, stranding the leading "!" behind it in the text
    // (producing the broken "![1]"), while its label and URL were
    // simultaneously pushed into the Sources list as if genuinely cited.
    // This does NOT fix raw, untouched "![](url)" image syntax appearing
    // as plain text elsewhere — that's Turndown's own separate,
    // unrelated image-conversion output, a different, still-open issue.
    // Verified via direct regex test against both real patterns
    // (a genuine citation link + an image) before applying here.
    var body = text
      .replace(/(?<!!)\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, function(full, label) {
        var urlMatch = /\((https?:\/\/[^)]+)\)/.exec(full);
        // NOTE: marker format now carries FOUR fields — pill label,
        // full title, url, and favicon/logo url — needed for the hover
        // popup added in forge-api.js, which shows the title, source
        // name, and a small logo together, matching Claude's own page.
        // Truncation removed per direct user request ("let's write out
        // the entire label") — full pill label now always shown, no
        // longer cut short with an ellipsis at 20 characters. Splits the
        // label into its pill/footer parts (see splitCompoundLabel
        // above) — the FULL footer part is what getFootnoteNumber()
        // stores for the separate Sources list below, and now ALSO what
        // gets carried into the marker for the hover popup, while the
        // pill itself still uses the shorter, site-name part. Uses a
        // private-use Unicode delimiter sequence (same category of
        // approach as the existing question-bubble marker), rather than
        // markdown [label](url) syntax, so the renderer in forge-api.js
        // can tell a citation pill apart from a genuine, regular
        // markdown link and style it differently. This function is
        // shared, unmodified per-provider — this change applies
        // identically to every provider's citations, not just Claude's.
        var parts = splitCompoundLabel(label);
        getFootnoteNumber(parts.footer, urlMatch[1]);
        return '\uE000' + parts.pill + '\uE003' + parts.footer + '\uE001' + urlMatch[1] + '\uE004' + parts.favicon + '\uE002';
      })
      .replace(/(?<!!)\[([^\]]+)\]\[(\d+)\]/g, function(full, label, num) {
        if (!footnoteDefs[num]) return full;
        var parts = splitCompoundLabel(label);
        getFootnoteNumber(parts.footer, footnoteDefs[num]);
        return '\uE000' + parts.pill + '\uE003' + parts.footer + '\uE001' + footnoteDefs[num] + '\uE004' + parts.favicon + '\uE002';
      })
      .replace(/^\[\d+\]:\s+\S+.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .trim();

    if (!sources.length) return body;

    // NOTE: now outputs real markdown link syntax [label](url) instead
    // of plain "label — url" text — the diary-web renderer's own new
    // markdown-link rule (see forge-api.js) turns this into a genuinely
    // clickable citation, matching the same "make links and citations
    // active/clickable" request that also prompted adding link support
    // there in the first place.
    var footer = '\n\n---\n\n**Sources:**\n' + sources.map(function(s, i) {
      return (i + 1) + '. [' + s.label + '](' + s.url + ')';
    }).join('\n');

    return body + footer;
  }

  // ── Shared: mark EVERY question for diary-web's bubble rendering ───────────
  // Explicit decision, extending the original title-only marker: every
  // question in a multi-turn conversation should get the same bubble
  // treatment, not just the first (title) one — otherwise subsequent
  // questions are visually indistinguishable from the AI's own bolded
  // section headers within its answers, confirmed as a genuine,
  // cross-provider gap even though the underlying saved data was always
  // correct. Applied at the SOURCE — the exact point each provider's own
  // code inserts a real, captured question into the thread — rather
  // than guessing from the final string's shape, since shape alone
  // (a standalone bolded line) cannot distinguish a real question from
  // a genuine bolded header like "**Key Risks**" within an answer.
  // Deliberately NOT applied to the generic HTML-to-markdown <strong>/<b>
  // converter used for arbitrary bold text within AI answers — doing so
  // would incorrectly mark every piece of emphasis or every real header
  // in every answer as if it were a question. Uses the same invisible
  // Unicode separator (U+2063) as before, so it degrades safely (no
  // visible artifact) if the stripping logic on diary-web's side is
  // ever bypassed. The previous title-only, post-processing version
  // (markTitleQuestion, anchored to the start of the string) is now
  // redundant given every question is marked at its actual insertion
  // point, and has been removed to avoid any risk of double-marking.
  function boldQuestion(text) {
    if (!text) return text;
    var TITLE_MARK = '\u2063';
    return TITLE_MARK + '**' + text + '**' + TITLE_MARK;
  }

  function stripLeadingEcho(question, answer) {
    if (!question || !answer) return answer;
    var q = question.trim();
    var a = answer.trim();
    if (!q || !a) return answer;
    var qNorm = q.toLowerCase();
    var aNorm = a.toLowerCase();
    if (aNorm.indexOf(qNorm) !== 0) return answer;
    var nextChar = a.charAt(q.length);
    if (nextChar && /[a-zA-Z0-9]/.test(nextChar)) return answer;
    var stripped = a.slice(q.length).trim();
    return stripped || answer;
  }

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
  function stripEntityArtifacts(s) {
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
    return out;
  }

  function cleanDomText(text) {
    return stripEntityArtifacts(text)
      .replace(/[-\u2013]\s*(?:\d+\s+)+[-\u2013]/g, '')
      // NOTE: a `.replace(/\[\d+\]/g, '')` used to live here, stripping
      // plain-text citation markers like "[1]" from the old innerText-only
      // era. Removed — confirmed via direct test that it corrupts real
      // markdown links Turndown now produces (e.g. "[1](https://source)"
      // loses its "[1]" and label, leaving a dangling, broken URL behind)
      // and also strips legitimate bracketed numbers from real content
      // (e.g. "ref. [42] in the handbook"). Turndown already handles
      // citation/reference HTML structure correctly on its own; this was
      // solving a problem that no longer exists in the same form now that
      // real HTML structure is being read instead of flattened innerText.
      .replace(/^Recognized .{0,100}$/gm, '')
      .replace(/^Searched the web$/gm, '')
      .replace(/^Read \d+ web pages?$/gm, '')
      .replace(/^Worked for \d+s$/gm, '')
      // NOTE: Grok-specific research-process chrome, confirmed live to
      // leak into saved content ("Ran 3 searches", "Opened page[...]"
      // appearing as standalone lines within the captured answer,
      // matching Grok's own "deep research" mode UI). Same principle as
      // the other search/read-chrome patterns above — only matches an
      // ENTIRE standalone line, verified via direct test not to touch a
      // real sentence that happens to mention "search" or a page being
      // opened as part of its actual content.
      .replace(/^Ran \d+ search(es)?$/gim, '')
      .replace(/^Opened page\[.*?\]\(.*?\)$/gim, '')
      .replace(/^Add to chat$/gim, '')
      .replace(/maps\.apple[^\s]*/g, '')
      // NOTE: three more patterns removed here by the same reasoning as
      // above — legacy plain-text-era artifact stripping, now more likely
      // to corrupt real content than catch anything Turndown's proper HTML
      // reading doesn't already handle correctly on its own. Confirmed via
      // direct test before removal:
      //   .replace(/\+\d+\s*$/gm, '') — was stripping legitimate content
      //   ending in "+N" (e.g. "increased by roughly +12"), not just
      //   citation-count badges.
      //   .replace(/^[A-Z][a-zA-Z]+(\.[a-z]+)?\s*$/gm, '') — was stripping
      //   ANY line that's just a single capitalized word, which could wipe
      //   out a genuine short standalone answer (e.g. "Zurich" as a
      //   one-word answer), not just citation-source-name artifacts.
      //   The four Source:-stripping variants below were also removed —
      //   they risked deleting legitimate citations an AI's own answer
      //   makes as real content (e.g. "Source: Swiss Federal Statistical
      //   Office" stated as part of a genuine, sourced answer).
      // NOTE: fixed — this previously also consumed any following
      // non-whitespace characters (.replace(/\u2060[^\s]*/g, '')), which
      // is the actual, confirmed, definitive root cause of a serious,
      // long-chased bug: Grok's own page prefixes EVERY citation label
      // with exactly this U+2060 word-joiner character (confirmed live
      // across many real citations: "⁠Wikipedia", "⁠Sculatiandpartners",
      // etc.). Since a markdown link like "[⁠Wikipedia](https://...)" has
      // zero whitespace anywhere in it, the old, greedy pattern consumed
      // the entire label, the closing bracket, and the whole URL in one
      // match — leaving only a bare, dangling "[" behind, with the
      // citation completely gone and no Sources entry for it at all.
      // U+2060 is a genuinely invisible, zero-width character regardless
      // of what follows it, so simply removing the character itself,
      // without touching anything after it, is safe for whatever this
      // rule's original, undocumented purpose was, while no longer
      // destroying real citation links. Verified via direct simulation
      // against the exact, real, previously-broken citation pattern
      // before applying here.
      .replace(/\u2060/g, '')
      .replace(/^You said\s*/gim, '')
      .replace(/^Gemini said\s*/gim, '')
      .replace(/^Gemini\s*$/gm, '')
      .replace(/^(?:New York University|Encyclopedia Britannica|Live More, Travel More|Wikipedia|Britannica|BBC|CNN|Reuters|AP News|Forbes|Bloomberg|World Population Review|Texas State Historical Association|Arctic Race|Life in Norway|Guidesly|Wikivoyage|Statbel|statbel\.fgov\.be|Census Bureau|worldpopulationreview\.com|Point2Homes|Cstx\.gov|Kiddle)\s*$/gm, '')
      .replace(/Click to open side panel for more information/g, '')
      .replace(/^Open·.*$/gm, '')
      .replace(/^Closes at.*$/gm, '')
      .replace(/^\d+\s+sources?\s*$/gm, '')
      .replace(/\d+\s+sources?$/gm, '')
      .replace(/^wikipedia\s*$/gim, '')
      // NOTE: two patterns used to live here — one converting markdown
      // links "[text](url)" down to just "text", the other stripping any
      // remaining bare URLs entirely. Both removed by explicit decision:
      // link-stripping was never sustainable long-term, and now that
      // Turndown correctly produces real markdown link syntax for
      // citations, this shared/global cleaner was immediately undoing
      // that — every citation link, for every provider, was being
      // silently downgraded to plain text or removed outright. Confirmed
      // via direct test that removing both preserves real markdown links
      // and bare URLs intact.
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+$/gm, '')
      .trim();
  }

  function injectSaveDiaryButton(responseText) {
    var existingBtn = document.getElementById('diary-save-btn');
    if (existingBtn) existingBtn.remove();

    var btn = document.createElement('button');
    btn.id = 'diary-save-btn';
    btn.textContent = String.fromCharCode(55357,56613) + ' Save to Diary';
    btn.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'right:20px',
      'z-index:2147483640',
      'background:#F97316',
      'color:#fff',
      'border:none',
      'border-radius:10px',
      'padding:10px 18px',
      'font-size:13px',
      'font-weight:700',
      'cursor:pointer',
      'font-family:system-ui,sans-serif',
      'box-shadow:0 4px 16px rgba(249,115,22,0.4)',
      'transition:all 0.2s',
      'display:flex',
      'align-items:center',
      'gap:6px'
    ].join(';');

    btn.onmouseenter = function() { this.style.background = '#ea580c'; this.style.transform = 'translateY(-2px)'; };
    btn.onmouseleave = function() { this.style.background = '#F97316'; this.style.transform = ''; };

    // ── Save-to-Diary logic, extracted into a standalone, reusable
    // function (Sync feature groundwork) ──────────────────────────────
    // Was previously an inline btn.onclick handler. Extracted so a new
    // Sync feature can trigger the exact same capture logic remotely
    // (via a chrome.runtime.onMessage listener below), reusing this
    // one save path rather than maintaining a second, parallel one that
    // could drift out of sync with it over time.
    //
    // `btn` is now an OPTIONAL parameter — confirmed via direct check
    // before this refactor: the function has ZERO dependency on the
    // click event object itself (no event.target, preventDefault(),
    // stopPropagation(), or focus-state reads anywhere in the body) —
    // but it DOES close over `btn` throughout, purely for visual
    // feedback (textContent/disabled/style/remove()). That's fine for a
    // real click; for a remote trigger (no button was ever clicked at
    // all), every btn.* reference below is now guarded so it's simply
    // skipped rather than throwing on a missing element.
    async function performSaveToDiary(btn) {
      if (PROVIDER === 'mistral') {
        console.log('[Diary DIAG] === Mistral save clicked ===');
        if (window.__diaryCapture && window.__diaryCapture.turns) {
          console.log('[Diary DIAG] turns count:', window.__diaryCapture.turns.length);
          window.__diaryCapture.turns.forEach(function(t, i) {
            console.log('[Diary DIAG] turn', i, '| length:', t.text.length, '| promptCountAtCapture:', t.promptCountAtCapture, '| ts:', t.ts, '| preview:', t.text.slice(0, 60));
          });
        }
        console.log('[Diary DIAG] promptCache:', JSON.stringify(window.__diaryPromptCache));
        try { console.log('[Diary DIAG] getAllCapturedPrompts() now:', JSON.stringify(getAllCapturedPrompts())); } catch(e) { console.log('[Diary DIAG] getAllCapturedPrompts() threw:', e.message); }
      }
      if (btn) { btn.textContent = 'Saving...'; btn.disabled = true; }
      try {
        var token = null;
        await new Promise(function(resolve) {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'GET_AUTH_TOKEN' } }, '*');
          var handler = function(e) {
            if (e.data && e.data.type === '__DIARY_AUTH_TOKEN__') {
              token = e.data.token;
              window.removeEventListener('message', handler);
              resolve();
            }
          };
          window.addEventListener('message', handler);
          setTimeout(resolve, 2000);
        });

        if (!token) {
          if (btn) {
            btn.textContent = 'Sign in to Diary first';
            btn.style.background = '#6B6B88';
            setTimeout(function() { btn.remove(); }, 3000);
          }
          return { success: false, error: 'not_authenticated' };
        }

        var prompt = '';
        // Claude-specific: try historySeed's own, true first question
        // BEFORE the generic getPrompt() override below — confirmed,
        // precisely-diagnosed bug, not a guess: getPrompt() returns
        // _prompts[0], the first message TYPED IN THIS PAGE SESSION —
        // correct for a brand-new conversation (where that IS the
        // conversation's own first question), but wrong for a reopened,
        // ongoing conversation where the user types a new, Nth message:
        // that new message becomes _prompts[0] for this session even
        // though it's actually the LATEST question, not the first one.
        // Since getPrompt() is checked with a plain `if (!prompt)`, it
        // was winning unconditionally whenever ANY message was typed
        // this session, which meant the historySeed fallback below —
        // built specifically to handle the reopened-conversation case —
        // never got a chance to run in exactly that case. Confirmed
        // live: this caused entry.prompt to get silently overwritten
        // with the newest question on re-save, which downstream (in
        // Diary's own Continue-in-Forge feature) then read as a second,
        // duplicate copy of that latest question, incorrectly inserted
        // at the very top of the reconstructed conversation. A
        // historySeed existing at all reliably means this is an
        // existing, ongoing conversation with a real, known first
        // question — checking for it first, unconditionally, fixes this
        // without needing to distinguish "new vs. reopened" any other
        // way. boldQuestion() (used to build historySeed's text) wraps
        // each question in U+2063 + "**...**" + U+2063 — extracting the
        // FIRST such wrapped span directly gives the first question,
        // without needing to touch the DOM at all.
        if (PROVIDER === 'claude') {
          try {
            var seedForPrompt = window.__diaryCapture && window.__diaryCapture.historySeed;
            if (seedForPrompt && seedForPrompt.text) {
              var qMatch = /\u2063\*\*([\s\S]*?)\*\*\u2063/.exec(seedForPrompt.text);
              if (qMatch && qMatch[1]) prompt = qMatch[1].trim().slice(0, 500);
            }
          } catch(_) {}
        }
        // Use provider getPrompt override if available — for Claude,
        // this now only fires when no historySeed existed at all (a
        // genuinely brand-new conversation), where _prompts[0] IS
        // correctly the conversation's own first question.
        if (!prompt && PROVIDER_CONFIG.getPrompt) {
          try { prompt = PROVIDER_CONFIG.getPrompt() || ''; } catch(_) {}
        }
        // Otherwise use registry promptSelectors
        if (!prompt) {
          var pSelectors = PROVIDER_CONFIG.promptSelectors || ['[data-message-author-role="user"]', '[class*="user-message"]'];
          for (var ps = 0; ps < pSelectors.length; ps++) {
            try {
              var pEls = document.querySelectorAll(pSelectors[ps]);
              if (pEls.length > 0) {
                var pText = pEls[0].textContent.trim().slice(0, 500);
                pText = pText.replace(/^You said\s*/i,'').replace(/^User:\s*/i,'').trim();
                // Strip timestamps appended to question text
                pText = pText.replace(/\s*\d{1,2}:\d{2}(?:am|pm)/gi, '').trim();
                if (pText && pText.length > 2 && !/^\d{1,2}:\d{2}/.test(pText) && !/^\d{1,2} \w+ \d{4}/.test(pText)) {
                  prompt = pText;
                  break;
                }
              }
            } catch(_) {}
          }
        }

        // Collect images from all captured turns (DOM path stores images per turn)
        var images = [];
        if (window.__diaryCapture && window.__diaryCapture.turns) {
          window.__diaryCapture.turns.forEach(function(t) {
            if (t.images) images = images.concat(t.images);
          });
        }
        // Claude-specific: history-seed images — confirmed live these
        // come from a genuinely separate, JSON-based API capture path
        // (parseHistorySeedImages() in diary-interceptor.js), not the
        // DOM_SELECTORS-based pipeline every other provider uses at all
        // (Claude has no DOM_SELECTORS entry). Covers images already in
        // an existing conversation before this page load, same
        // "reopening loses everything but new turns" problem the text
        // seed itself already solves.
        if (PROVIDER === 'claude') {
          var seedForImages = window.__diaryCapture && window.__diaryCapture.historySeed;
          if (seedForImages && Array.isArray(seedForImages.images)) {
            images = images.concat(seedForImages.images);
          }
        }
        if (images.length === 0 && ['claude','chatgpt','gemini','perplexity'].includes(PROVIDER)) {
          images = await captureResponseImages(token);
        }
        images = images.filter(function(s,i,a){ return a.indexOf(s)===i; }); // dedupe

        // Use interceptor-captured turns (clean API text, no DOM artifacts)
        var fullThread = null;
        // Force a fresh DOM re-read before building fullThread from
        // window.__diaryCapture.turns below — see
        // refreshLatestDomCaptureForRetry()'s own comment for the full
        // rationale. Called here, unconditionally, for every non-Claude
        // provider (not just on Sync's own retries) so a normal, manual
        // save benefits from the same freshness guarantee — genuinely
        // harmless on a first, non-retried call too, since it no-ops
        // entirely when nothing has changed since the last capture.
        // Claude is unaffected: it has no DOM_SELECTORS entry at all, so
        // this reads nothing and returns immediately for it.
        console.log('[Diary Sync DIAG] about to call refreshLatestDomCaptureForRetry() — PROVIDER:', PROVIDER);
        if (PROVIDER !== 'claude') {
          try { refreshLatestDomCaptureForRetry(); }
          catch(e) { console.log('[Diary Sync DIAG] refreshLatestDomCaptureForRetry() THREW:', e && e.message, e && e.stack); }
        }
        if (PROVIDER === 'claude') {
          // ChatGPT moved to the DOM-provider branch below (see the 'else'
          // clause) — confirmed via live evidence that ChatGPT delivers
          // responses through React Router's inline server-streaming, not
          // a fetch/XHR call the interceptor can see, on both normal and
          // "Fast answer" responses. The historySeed/interceptor path above
          // remains Claude-only.
          var currentHost = window.location.hostname;
          var threadParts = [];

          // History seed: reconstructed from claude.ai's bulk conversation-fetch
          // endpoint (see diary-interceptor.js parseHistorySeed). Covers turns
          // that were already in the conversation before this page load —
          // the streaming-delta capture below can only see turns that stream
          // in AFTER the page loads, so without this, reopening an existing
          // chat (e.g. via "Open original") would only capture new turns and
          // silently drop everything that came before.
          var seed = window.__diaryCapture && window.__diaryCapture.historySeed;
          if (seed && seed.text) {
            try {
              // Exact URL match, with tolerance for a "/new" placeholder
              // transitioning to a real conversation ID — see the
              // captureTurns filter below for the full rationale (matches
              // the same fix, applied consistently to the seed too).
              var curUrl = canonicalUrl();
              if (seed.url === curUrl || /\/new(\?|$)/.test(seed.url)) {
                threadParts.push(seed.text);
              }
            } catch(e) {}
          }

          if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length) {
            // Match turns belonging to THIS SPECIFIC conversation, not just
            // this hostname. Confirmed live: window.__diaryCapture.turns
            // persists for the whole tab's lifetime (only cleared on a true
            // page reload), and these are single-page apps — switching to a
            // DIFFERENT conversation via the app's own sidebar never
            // triggers a reload. A hostname-only filter let turns from a
            // completely different, earlier conversation silently bleed
            // into an unrelated save (confirmed: an old nursing-conversation
            // answer appeared in a save for a new retail-conversation
            // question). Exact URL match fixes this, while still tolerating
            // a "/new" placeholder URL becoming a real conversation-ID URL
            // after the first message — the one legitimate case where the
            // current URL and a turn's stored URL are expected to differ
            // within the SAME conversation.
            var captureTurns = window.__diaryCapture.turns.filter(function(t) {
              var curUrl = canonicalUrl();
              return t.url === curUrl || /\/new(\?|$)/.test(t.url);
            });
            if (captureTurns.length) {
              var prompts = PROVIDER_CONFIG._prompts || [];
              console.log('[Diary DIAG] captureTurns.length:', captureTurns.length, '| prompts:', JSON.stringify(prompts));
              for (var ci = 0; ci < captureTurns.length; ci++) {
                // The history endpoint can refetch mid-session (not just at page
                // load), so historySeed may already contain turns that were also
                // captured live here. Skip anything already present in the seed
                // to avoid duplicating it.
                var turnText = captureTurns[ci].text.replace(/\n{3,}/g,'\n\n').trim();
                var skippedBySeed = !!(seed && seed.text && turnText && seed.text.includes(turnText.slice(0, 200)));
                console.log('[Diary DIAG] ci:', ci, '| prompts[ci]:', JSON.stringify(prompts[ci]), '| skippedBySeed:', skippedBySeed);
                if (skippedBySeed) {
                  continue;
                }
                if (prompts[ci]) threadParts.push(boldQuestion(prompts[ci].slice(0,2000)));
                threadParts.push(turnText);
              }
            }
          }

          if (threadParts.length) {
            fullThread = threadParts.join('\n\n');
            console.log('[Diary] thread parts:', threadParts.length, '(history seed:', !!seed, ') ', fullThread.slice(0,80));
          }
        } else if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length) {
          // Same cross-conversation contamination fix as the Claude branch
          // above — see the detailed comment there for the full rationale.
          var captureTurns = window.__diaryCapture.turns.filter(function(t) {
            var curUrl = canonicalUrl();
            return t.url === curUrl || /\/new(\?|$)/.test(t.url);
          });
          // Sort by capture timestamp — confirmed live as a real, necessary
          // fix, not a defensive-only safeguard: when a tab is reused
          // across multiple, SEPARATE Sync attempts (rather than freshly
          // reloaded each time), turns can genuinely accumulate out of
          // chronological order — each attempt captures whatever's
          // visible AT THAT MOMENT, in the order those attempts happened
          // to run, not the order those turns actually occurred in the
          // conversation itself. The interleaving logic below processes
          // captureTurns via a plain forEach, in array order, and uses
          // promptCountAtCapture to decide which questions precede each
          // turn's own text — an out-of-order array silently produces a
          // garbled thread (the newest turn consuming the FIRST question
          // slot instead of the last), with the newest answer's own text
          // never correctly appearing at all despite being fully, cleanly
          // captured. Sorting first makes the array's own push order
          // irrelevant to the final result.
          captureTurns.sort(function(a, b) { return a.ts - b.ts; });
          if (captureTurns.length) {
            // DOM providers: merge ALL captured snapshots into one growing
            // thread per conversation (reverted from a brief "one entry
            // per exchange" experiment, explicitly ruled out — the product
            // requires a single thread containing multiple exchanges, not
            // separate standalone entries). Confirmed live on a real
            // 6-question DeepSeek conversation: the saved entry contained
            // ONLY the last question's answer, even though each individual
            // capture's console log showed correct, distinct content for
            // every single turn as it happened — some virtual-list
            // implementations recycle the same DOM nodes, silently
            // overwriting old content with new content in place. Each
            // snapshot was correct AT ITS OWN TIME, so merging every
            // stored snapshot (deduped by paragraph, first-seen order)
            // recovers everything even if any single later snapshot lost
            // earlier content to this kind of recycling.
            //
            // Interleave questions with their own answers, matching how
            // Claude's content is naturally structured (question, answer,
            // question, answer...). Each captured turn is tagged (at
            // capture time) with promptCountAtCapture: turns.length + 1 —
            // the turn's OWN POSITION when it was pushed, NOT a live
            // question count. This is the second, more robust fix for the
            // interleaving race condition: tagging from a live count broke
            // if the user typed a follow-up question before the current
            // turn finished being captured (the live count would already
            // include the next question, causing both to bunch together
            // before the wrong answer). Position-based tagging is immune
            // to this entirely, since it never depends on timing — only on
            // how many answers have actually been captured so far.
            // Verified via mechanical simulation of the exact race before
            // being wired in here.
            var mergeSeen = {};
            var promptsShownCount = 0;
            var allPromptsFinal = getAllCapturedPrompts();
            var interleavedParts = [];
            captureTurns.forEach(function(turn) {
              var countAtCapture = (typeof turn.promptCountAtCapture === 'number') ? turn.promptCountAtCapture : allPromptsFinal.length;
              var newPrompts = allPromptsFinal.slice(promptsShownCount, countAtCapture);
              var turnText = turn.text;
              if (newPrompts.length) {
                newPrompts.forEach(function(p) { interleavedParts.push(boldQuestion(p.slice(0, 2000))); });
                promptsShownCount = countAtCapture;
              }
              // Strip a leading echo of the most recently bolded question
              // from the first genuinely NEW paragraph only (not the
              // whole accumulated turnText) — see stripLeadingEcho's
              // comment for the full rationale. Confirmed live and via
              // mechanical test that checking only the START of the whole
              // accumulated blob (the original version of this fix) only
              // caught an echo on the very first turn processed — by the
              // second turn, turnText contains ALL previous answers too
              // (readDomResponse joins every response element on the
              // page), so a second echo sits in the MIDDLE of the string,
              // never at position 0, and silently survived untouched.
              // Checking each paragraph individually as it's about to be
              // added — rather than the whole blob up front — catches the
              // echo regardless of which turn it appears in, since the
              // paragraph-level dedup already isolates exactly the new
              // content each turn actually introduces.
              var lastQuestionForTurn = newPrompts.length ? newPrompts[newPrompts.length - 1] : null;
              var checkedFirstNewParagraph = false;
              var paras = turnText.split(/\n{2,}/);
              paras.forEach(function(p) {
                var trimmed = p.trim();
                if (!trimmed || trimmed.length < 10) return;
                var key = trimmed.slice(0, 80);
                if (mergeSeen[key]) return;
                mergeSeen[key] = true;
                if (lastQuestionForTurn && !checkedFirstNewParagraph) {
                  trimmed = stripLeadingEcho(lastQuestionForTurn, trimmed);
                  checkedFirstNewParagraph = true;
                  if (!trimmed) return;
                }
                interleavedParts.push(trimmed);
              });
            });
            // Any question asked after the last captured answer (e.g. its
            // response hasn't finished rendering/being captured yet) still
            // gets shown — better to display an unanswered question than
            // silently drop it.
            if (promptsShownCount < allPromptsFinal.length) {
              allPromptsFinal.slice(promptsShownCount).forEach(function(p) { interleavedParts.push(boldQuestion(p.slice(0, 2000))); });
            }
            fullThread = interleavedParts.join('\n\n');
            // Safety fallback: if interleaving somehow produced nothing
            // (e.g. every paragraph got filtered out for being too short),
            // fall back to the single already-proven `prompt` prepended to
            // whatever raw merged content exists, so this can only improve
            // on the previous fix, never regress below it.
            if (!fullThread && prompt) {
              var mergedPartsFallback = [];
              captureTurns.forEach(function(turn) {
                var paras2 = turn.text.split(/\n{2,}/);
                paras2.forEach(function(p) { var t = p.trim(); if (t && t.length >= 10) mergedPartsFallback.push(t); });
              });
              fullThread = boldQuestion(prompt) + '\n\n' + mergedPartsFallback.join('\n\n');
            }
            console.log('[Diary] interleaved', captureTurns.length, 'snapshots,', allPromptsFinal.length, 'question(s) total:', fullThread.slice(0,80));
          }
        }
        // Gemini-specific override: prefer true DOM-based question/answer
        // pairing over the count-based interleaving above. Only replaces
        // fullThread if it actually finds the expected structure, so this
        // can only improve on the fallback above, never regress below it.
        if (PROVIDER === 'gemini') {
          var pairedThread = buildGeminiPairedThread();
          if (pairedThread && pairedThread.length > 50) {
            fullThread = pairedThread;
            console.log('[Diary] Gemini DOM-paired thread used, length:', fullThread.length);
          }
        }
        // Perplexity-specific override: same principle as Gemini above,
        // using the generic buildDomPairedThread helper. Confirmed live:
        // questions (.max-h-[144px].overflow-hidden — see the registry
        // entry above for why '.line-clamp-6' was replaced a second
        // time) and answers ([data-renderer="lm"]) alternate correctly
        // in true document order, with no per-exchange wrapper container
        // (unlike Gemini) — Perplexity's DOM just has them as a flat,
        // correctly-ordered sequence, which the generic walker handles
        // the same way. Only replaces fullThread if it actually finds
        // the expected structure.
        if (PROVIDER === 'perplexity') {
          var pplxThread = buildDomPairedThread({
            combinedSelector: '.max-h-\\[144px\\].overflow-hidden, [data-renderer="lm"]',
            isQuestion: function(el) { return el.classList && el.classList.contains('overflow-hidden') && el.className.indexOf('max-h-[144px]') !== -1; },
            questionInnerSelector: null,
            answerInnerSelector: null
          });
          if (pplxThread && pplxThread.length > 50) {
            fullThread = pplxThread;
            console.log('[Diary] Perplexity DOM-paired thread used, length:', fullThread.length);
          }
        }
        // Meta AI-specific override: same principle as Gemini/Perplexity
        // above, using the generic buildDomPairedThread helper — replaces
        // the earlier _prompts-seeding fix as the actual solution to
        // multi-question interleaving here, not just a partial one.
        // Confirmed live via real DOM captured through Inspect: each
        // exchange sits under its own <div data-message-item="true"
        // data-message-id="..._user"> / "..._assistant"> wrapper, but the
        // more specific, purpose-built [data-message-type="user"] and
        // [data-testid="assistant-message"] attributes sit one level
        // in — confirmed present on both sides and used here directly.
        // Question text isolated via .text-response specifically (NOT
        // the whole [data-message-type="user"] container's textContent,
        // which was confirmed live to also include a nested timestamp
        // span and "Copy response" button — see getPrompt()'s identical
        // fix above for the full rationale). Answer text read from
        // .ur-markdown — NOTE: an earlier version of this targeted
        // .markdown-content instead, which turned out to only be present
        // for some response types. Confirmed live on a "Show thinking"-
        // style response that .markdown-content was silently missing
        // there entirely (breaking answer capture for that turn, while
        // the question side kept working fine, since it uses a separate
        // selector) — .ur-markdown was confirmed present in BOTH that
        // response type and the earlier, simpler one already tested, so
        // it's the more consistently-present element to anchor on. Only
        // replaces fullThread if it actually finds the expected
        // structure, so this can only improve on the _prompts-seeding
        // fallback, never regress below it. Verified via direct
        // simulation of a two-question conversation before wiring in
        // here.
        if (PROVIDER === 'meta') {
          var metaThread = buildDomPairedThread({
            combinedSelector: '[data-message-type="user"], [data-testid="assistant-message"]',
            isQuestion: function(el) { return el.getAttribute('data-message-type') === 'user'; },
            questionInnerSelector: '.text-response',
            answerInnerSelector: '.ur-markdown'
          });
          if (metaThread && metaThread.length > 50) {
            fullThread = metaThread;
            console.log('[Diary] Meta AI DOM-paired thread used, length:', fullThread.length);
          }
        }
        // Grok-specific override: same principle as Gemini/Perplexity/
        // Meta AI above. Confirmed live via diagnostic logging that the
        // counting-based capture system's "wait until the answer has
        // finished streaming" detection is genuinely unreliable here —
        // real evidence showed the SAME first answer captured three
        // times in a row at growing lengths (2827 → 5382 → 7940 chars)
        // as it streamed in, never once captured after it had actually
        // finished — meaning the second and third real questions' own
        // answers were never captured as their own turns at all. Reads
        // the live DOM directly instead, sidestepping that timing
        // problem entirely. Both roles already confirmedly share the
        // same '.message-bubble' class, distinguished only by
        // data-testid="user-message" on the user's side (see this
        // file's own DOM_SELECTORS['grok.com'] comment for the original
        // confirmation) — no inner sub-selector needed for either role,
        // since that bubble element is already the right, clean scope
        // for both (same one getPrompt() already uses directly for
        // clean text). Verified via direct simulation of a two-question
        // conversation before wiring in here.
        if (PROVIDER === 'grok') {
          var grokThread = buildDomPairedThread({
            combinedSelector: '.message-bubble',
            isQuestion: function(el) { return el.getAttribute('data-testid') === 'user-message'; },
            questionInnerSelector: null,
            answerInnerSelector: null
          });
          if (grokThread && grokThread.length > 50) {
            // NOTE: widget-text stripping ("Worked for Xm Ys", "N
            // sources") now happens per-turn, inside buildDomPairedThread
            // itself (see its own comment there) rather than once here
            // on the final, combined thread — confirmed live this is
            // more robust for a multi-question conversation, where the
            // leak could appear at the end of ANY turn, not just the
            // very last one in the whole conversation.
            fullThread = grokThread;
            console.log('[Diary] Grok DOM-paired thread used, length:', fullThread.length);
          }
        }
        // Mistral-specific override: same principle as Gemini/Perplexity/
        // Meta AI/Grok above. Confirmed live via diagnostic logging that
        // the counting-based capture system can produce a duplicate turn
        // for the SAME answer (turn count of 3 for only 2 real
        // questions, with two turns starting with near-identical text),
        // throwing off the position-based interleaving math and dumping
        // later questions' real content out of place. Both inner
        // selectors used here are already independently confirmed live
        // and working — see this file's own DOM_SELECTORS
        // ['chat.mistral.ai'] comments above for their full history —
        // just never previously combined into a single, document-order
        // walk together. answer elements are distinguished from question
        // elements purely by carrying the data-message-part-type
        // attribute at all, which only ever appears on the confirmed
        // answer selector, never on the confirmed prompt one. Verified
        // via direct simulation of a two-question conversation before
        // wiring in here. NOTE: this was built, then briefly reverted
        // when Mistral's "Save to Diary" button appeared unresponsive —
        // confirmed afterward that this was Mistral's own, unrelated
        // transient server-side delay, not caused by this code at all —
        // re-applied here unchanged from its original, verified form.
        if (PROVIDER === 'mistral') {
          var mistralThread = buildDomPairedThread({
            combinedSelector: '.ms-auto span.whitespace-pre-wrap, [data-message-part-type="answer"]',
            isQuestion: function(el) { return !el.hasAttribute('data-message-part-type'); },
            questionInnerSelector: null,
            answerInnerSelector: null
          });
          if (mistralThread && mistralThread.length > 50) {
            fullThread = mistralThread;
            console.log('[Diary] Mistral DOM-paired thread used, length:', fullThread.length);
          }
        }
        // ChatGPT-specific: use ChatGPT's OWN native "Copy response" button
        // per turn, then read the clipboard — this has been 100% clean in
        // every manual test tonight (no PUA-artifact stripping needed, no
        // backend-propagation-delay risk, no virtualization risk), unlike
        // both the DOM-reading and history-fetch approaches this session,
        // which each had a real, evidenced failure mode. This is now the
        // primary method; the history-fetch-with-retry logic below remains
        // as a fallback if clipboard access fails (e.g. permission denied)
        // or a turn's copy button can't be found.
        //
        // NOTE: this temporarily overwrites the user's system clipboard —
        // we save and restore whatever was there beforehand so Save to
        // Diary doesn't have a surprising side effect on unrelated
        // copy/paste the user may be in the middle of.
        var chatgptClipboardWorked = false;
        if (PROVIDER === 'chatgpt') {
          try {
            var originalClipboard = '';
            try { originalClipboard = await navigator.clipboard.readText(); } catch(e) {}

            // ChatGPT virtualizes the conversation view — confirmed live:
            // turn counts changed after scrolling to the top. A SINGLE
            // scroll + fixed 800ms wait was NOT enough on its own — also
            // confirmed live: user-turn and assistant-turn counts came back
            // MISMATCHED (2 vs 3) even after that scroll, meaning
            // virtualization hadn't settled AND, separately, the previous
            // code paired userSections[i] with assistantSections[i] by raw
            // array index — when those two counts differ, that silently
            // pairs the wrong question with the wrong answer rather than
            // just leaving a gap, which is a worse failure mode than
            // missing content. Fixed two ways: (1) walk turns in actual
            // DOCUMENT ORDER via a single combined query, using each
            // element's own data-turn attribute, instead of pairing two
            // separately-indexed NodeLists that virtualization can make
            // inconsistent with each other, and (2) below — the polling
            // used to just wait for the DOM count to "stop changing", but
            // that's NOT the same as "correct": confirmed live, it
            // stabilized at 9 turns for a conversation that actually had
            // 10, and silently accepted that as done. Polling now compares
            // against the TRUE turn count from the history-JSON endpoint
            // (ChatGPT's actual backend record, not the rendered/
            // virtualized DOM) instead of just checking for its own
            // agreement with itself.
            //
            // The history-fetch itself can transiently fail — confirmed
            // live: diary-content.js issuing its OWN fetch() to this
            // endpoint at Save-click time reliably got a 404, while the
            // interceptor's PASSIVE capture (eavesdropping on a fetch
            // ChatGPT's own client code issues, moments earlier, on the
            // identical URL) succeeded. That's not random flakiness — our
            // own constructed request is very likely missing something
            // ChatGPT's own client attaches internally (an in-memory auth
            // token, a custom header, etc. — not something a plain fetch()
            // call replicates). Read from the interceptor's cache
            // (window.__diaryCapture.historySeed, already populated by a
            // request that's proven to succeed) instead of re-fetching
            // ourselves; only attempt our own fetch as a last resort if no
            // cache is available at all.
            var trueTurnCount = null;
            try {
              var cachedSeed = window.__diaryCapture && window.__diaryCapture.historySeed;
              if (cachedSeed && typeof cachedSeed.turnCount === 'number') {
                trueTurnCount = cachedSeed.turnCount;
                console.log('[Diary] ChatGPT true turn count from CACHED history JSON (age', Math.round((Date.now() - cachedSeed.ts) / 1000), 's):', trueTurnCount);
              } else {
                console.error('[Diary] ChatGPT no cached history JSON available yet — attempting a direct fetch as last resort (may 404)');
                var convMatchForCount = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
                if (convMatchForCount) {
                  var countResp = await fetch('/backend-api/conversation/' + convMatchForCount[1]);
                  if (countResp.ok) {
                    var countJson = await countResp.json();
                    var mapping = countJson && countJson.mapping;
                    if (mapping) {
                      trueTurnCount = 0;
                      for (var mid in mapping) {
                        var mmsg = mapping[mid] && mapping[mid].message;
                        if (mmsg && mmsg.content && mmsg.content.content_type === 'text') {
                          var mrole = mmsg.author && mmsg.author.role;
                          if (mrole === 'user' || mrole === 'assistant') trueTurnCount++;
                        }
                      }
                      console.log('[Diary] ChatGPT true turn count from direct fetch (last resort, succeeded):', trueTurnCount);
                    }
                  } else {
                    console.error('[Diary] ChatGPT last-resort direct fetch also failed, HTTP', countResp.status, '— proceeding with stability-only polling');
                  }
                }
              }
            } catch(e) {
              console.error('[Diary] ChatGPT could not determine true turn count, falling back to stability-only polling:', e);
            }

            var scrollRoot = document.querySelector('[data-scroll-root]') || document.getElementById('thread');
            if (scrollRoot) {
              scrollRoot.scrollTop = 0;
              var lastTurnCount = -1;
              for (var settleAttempt = 0; settleAttempt < 12; settleAttempt++) {
                await new Promise(function(r){ setTimeout(r, 500); });
                var curCount = document.querySelectorAll('section[data-turn="user"], section[data-turn="assistant"]').length;
                // Success condition: reached the known-true count (best
                // case), OR — if we couldn't determine a true count —
                // fall back to the old "stopped changing" heuristic, which
                // is weaker but better than nothing.
                if (trueTurnCount !== null && curCount >= trueTurnCount) { lastTurnCount = curCount; break; }
                if (trueTurnCount === null && curCount === lastTurnCount) break;
                lastTurnCount = curCount;
                scrollRoot.scrollTop = 0; // re-assert in case virtualization shifted the scroll position back
              }
              console.log('[Diary] ChatGPT scroll-settle finished, DOM turn count:', lastTurnCount, 'true turn count:', trueTurnCount);
              if (trueTurnCount !== null && lastTurnCount < trueTurnCount) {
                console.error('[Diary] ChatGPT scroll-settle NEVER reached the true turn count (', lastTurnCount, 'of', trueTurnCount, ') — the DOM is known-incomplete, skipping clipboard method entirely and falling through to the JSON-based fallback instead');
              }
            }

            // If we know the true count and the DOM never reached it, don't
            // even attempt the clipboard method — proceeding would build
            // expectedCount from the DOM's own (wrong, too-low) count,
            // which would make the all-or-nothing check "succeed" against
            // an incorrect target and silently save an incomplete result
            // again, exactly the failure this whole check exists to catch.
            var domKnownIncomplete = (trueTurnCount !== null && lastTurnCount < trueTurnCount);

            // Combined query, document order — each element carries its own
            // role via data-turn, so pairing no longer depends on two
            // separate NodeLists having matching lengths.
            var allTurnEls = domKnownIncomplete ? [] : document.querySelectorAll('section[data-turn="user"], section[data-turn="assistant"]');
            var clipParts = [];
            var expectedCount = allTurnEls.length;
            var clipSuccessCount = 0;
            var firstUserClip = ''; // used for the title, replacing the old DOM-based getPrompt() path
            var sawFirstUser = false;
            var lastGenuineClipText = originalClipboard; // updated after each GENUINE success

            for (var ti = 0; ti < allTurnEls.length; ti++) {
              var turnEl = allTurnEls[ti];
              var role = turnEl.getAttribute('data-turn');
              var copyBtn = turnEl.querySelector('button[data-testid="copy-turn-action-button"]');
              if (!copyBtn) {
                console.error('[Diary] ChatGPT copy button not found on', role, 'turn at position', ti, '— treating whole attempt as failed');
                continue;
              }
              copyBtn.click();
              await new Promise(function(r){ setTimeout(r, 400); }); // let the clipboard write complete
              try {
                var clipText = await navigator.clipboard.readText();
                // Confirmed live as a real, serious bug — not cosmetic:
                // this previously only checked "is clipText non-empty,"
                // with no check at all that the clipboard actually,
                // genuinely changed as a result of clicking Copy above.
                // When the write silently fails (as it always will here —
                // this window never has document focus at all), the read
                // simply returns whatever was ALREADY on the user's own,
                // completely unrelated clipboard beforehand — and since
                // that's typically non-empty, the old check wrongly
                // treated it as a successful, genuine capture. Reproduced
                // live: unrelated terminal/git output the user had
                // copied for an entirely different purpose ended up
                // saved into a Diary entry as if it were the AI's own
                // response. Compares against lastGenuineClipText — the
                // most recent value we KNOW genuinely changed — not just
                // the original, pre-loop value: if turn 1's copy
                // genuinely succeeds but turn 2's silently fails, turn 2
                // would read back turn 1's own text, which differs from
                // the ORIGINAL clipboard but is still stale, not turn 2's
                // own content — comparing only against the original would
                // miss this and incorrectly duplicate turn 1's text as
                // turn 2's.
                if (clipText === lastGenuineClipText) {
                  console.error('[Diary] ChatGPT clipboard unchanged after Copy click on', role, 'turn at position', ti, '— write silently failed (no document focus); refusing to trust stale clipboard content');
                } else if (clipText && clipText.trim().length > 0) {
                  var ct = clipText.trim();
                  if (role === 'user') {
                    clipParts.push(boldQuestion(ct.slice(0, 2000)));
                    if (!sawFirstUser) { firstUserClip = ct; sawFirstUser = true; }
                  } else {
                    clipParts.push(ct);
                  }
                  clipSuccessCount++;
                  lastGenuineClipText = clipText;
                } else {
                  console.error('[Diary] ChatGPT clipboard empty on', role, 'turn at position', ti);
                }
              } catch(e) {
                console.error('[Diary] ChatGPT clipboard read failed on', role, 'turn at position', ti, e);
              }
            }

            try { if (originalClipboard) await navigator.clipboard.writeText(originalClipboard); } catch(e) {}

            // ALL-OR-NOTHING across BOTH roles: only trust this method if
            // every single turn (user AND assistant) succeeded. A partial
            // success must NOT be silently accepted — that would produce
            // exactly the kind of quietly-incomplete save this whole
            // rebuild was meant to fix, just via a different mechanism.
            // Falls through to the history-fetch fallback below instead.
            if (expectedCount > 0 && clipSuccessCount === expectedCount) {
              chatgptClipboardWorked = true;
              fullThread = clipParts.join('\n\n');
              if (firstUserClip) prompt = firstUserClip.slice(0, 500); // overrides the earlier DOM-based getPrompt() result for the title
              console.log('[Diary] ChatGPT clipboard-copy method, ALL', expectedCount, 'turns (both roles) succeeded, length:', fullThread.length, 'title:', prompt.slice(0,60));
            } else {
              console.error('[Diary] ChatGPT clipboard-copy method: only', clipSuccessCount, 'of', expectedCount, 'turns succeeded — rejecting partial result, falling back');
            }
          } catch(e) {
            console.error('[Diary] ChatGPT clipboard-copy method FAILED entirely:', e);
          }
        }
        // ChatGPT-specific FALLBACK: fetch the conversation-history endpoint
        // fresh at Save-click time and parse it with the same history-JSON
        // parser used for reload-recovery (window.__diaryParseChatGPTHistorySeed,
        // exposed by diary-interceptor.js). This replaces DOM-reading as
        // the content source for ChatGPT — DOM reading proved unreliable
        // for long responses (confirmed live: content missing from the
        // MIDDLE of a response, matching viewport virtualization dropping
        // scrolled-out-of-view content, not a timing issue at all). The
        // history endpoint reads ChatGPT's actual backend data model
        // directly — no rendering, no viewport, nothing to virtualize.
        // Runs unconditionally for chatgpt (outside the branches above), so
        // it still works even if the DOM MutationObserver never captured
        // anything at all.
        //
        // A SINGLE fetch immediately after Save is clicked is not enough —
        // confirmed live: the first save came back partial, and simply
        // returning and saving again (after time had passed) produced a
        // complete result with no code changes in between. That points to
        // a genuine backend propagation delay — ChatGPT's UI finishes
        // streaming and displays the answer before its own backend has
        // fully persisted that last message into the record this endpoint
        // reads from. Retry with a short delay, only accepting the result
        // once two consecutive fetches agree, so we don't save a
        // known-transient partial state.
        // ChatGPT-specific FALLBACK: use the cached history-JSON text from
        // the interceptor's PASSIVE capture (window.__diaryCapture.historySeed)
        // instead of fetching the endpoint ourselves — confirmed live that
        // our own fetch() to this endpoint reliably 404s at Save-click time
        // while the interceptor's eavesdropped capture of ChatGPT's own
        // client-issued fetch succeeds consistently (see trueTurnCount
        // block above for the full explanation). Only attempts a direct
        // fetch as a last resort if no cache exists at all.
        if (PROVIDER === 'chatgpt' && !chatgptClipboardWorked) {
          try {
            var cachedSeedForContent = window.__diaryCapture && window.__diaryCapture.historySeed;
            if (cachedSeedForContent && cachedSeedForContent.text && cachedSeedForContent.text.length > 50) {
              fullThread = cachedSeedForContent.text;
              console.log('[Diary] ChatGPT using CACHED history text (age', Math.round((Date.now() - cachedSeedForContent.ts) / 1000), 's), length:', fullThread.length);
            } else {
              console.error('[Diary] ChatGPT no cached history text available — attempting a direct fetch as last resort (may 404)');
              var convMatch = window.location.pathname.match(/\/c\/([a-f0-9-]+)/i);
              if (convMatch && window.__diaryParseChatGPTHistorySeed) {
                var histLastText = null;
                // Reduced from 5 attempts to 2 — confirmed live, across
                // multiple, separate ChatGPT tests today, that this
                // endpoint 404s consistently and reliably for this
                // last-resort path, never once succeeding partway
                // through the retry window. 5 attempts x 1500ms meant up
                // to 6 seconds of pure, wasted waiting on a failure that
                // never actually resolved. 2 attempts keeps a small
                // safety margin for a genuinely transient case, without
                // the same, confirmed-unnecessary cost.
                for (var histAttempt = 0; histAttempt < 2; histAttempt++) {
                  var histResp = await fetch('/backend-api/conversation/' + convMatch[1]);
                  if (!histResp.ok) {
                    console.error('[Diary] ChatGPT last-resort history-fetch got HTTP', histResp.status, 'on attempt', histAttempt + 1);
                    histLastText = null;
                    if (histAttempt < 1) await new Promise(function(r){ setTimeout(r, 1500); });
                    continue;
                  }
                  var histJson = await histResp.json();
                  var histText = window.__diaryParseChatGPTHistorySeed(histJson);
                  console.log('[Diary] ChatGPT last-resort history-fetch attempt', histAttempt + 1, 'length:', histText.length);
                  if (histText && histText.length > 50 && histText === histLastText) {
                    fullThread = histText;
                    console.log('[Diary] ChatGPT last-resort history-fetch stable, length:', fullThread.length);
                    break;
                  }
                  histLastText = histText;
                  if (histAttempt < 1) await new Promise(function(r){ setTimeout(r, 1500); });
                }
                if (!fullThread && histLastText && histLastText.length > 50) {
                  fullThread = histLastText;
                  console.log('[Diary] ChatGPT last-resort history-fetch used last attempt (never fully stabilized), length:', fullThread.length);
                }
              }
            }
          } catch(e) {
            console.error('[Diary] ChatGPT history fallback FAILED:', e);
          }
        }
        // NOTE: no longer calls markTitleQuestion here — every question
        // is now marked at its actual point of insertion into the
        // thread (see boldQuestion()), not as a single, title-only
        // post-processing step. Calling it here too would be redundant
        // at best and risk double-marking at worst.
        var contentToSave = stripCitations(fullThread);
        // Guard MUST come before the diagnostic log below, not after —
        // confirmed live as the actual, root cause of a "Cannot read
        // properties of null (reading 'slice')" crash: this pre-
        // existing log line unconditionally called .slice() on
        // contentToSave with no null check at all, throwing BEFORE the
        // guard below ever got a chance to run, in exactly the
        // no-real-content scenario the guard exists to catch (Sync's
        // own proactive injectSaveDiaryButton() call can now legitimately
        // reach this code before a provider's own capture logic has
        // populated fullThread at all, even after the page reports
        // 'complete'). The only existing guard in this whole function
        // was for authentication — none at all for "is there actually
        // anything here to save," and no reference to contentToSave
        // before that check can assume it's non-null.
        if (!contentToSave || contentToSave.trim().length < 10) {
          console.log('[Diary Sync DIAG] refusing to save — no real content captured (conversation likely deleted or not yet loaded)');
          if (btn) {
            btn.textContent = 'Nothing to save';
            btn.style.background = '#6B6B88';
            setTimeout(function() { btn.remove(); }, 3000);
          }
          return { success: false, error: 'no_content_found' };
        }
        // Guard against a DIFFERENT, more subtle incomplete-capture case
        // than "nothing at all" — confirmed live for ChatGPT specifically,
        // whose own comment in DOM_SELECTORS explains why: its responses
        // arrive via inline, streaming script tags executing during page
        // load, with NO network-based fallback at all (unlike Claude's own
        // historySeed) — meaning capture depends entirely on the DOM
        // already being fully rendered at the moment of reading it. A
        // long conversation can report the page as 'complete' in the
        // browser's own, technical sense while React is still hydrating
        // the very latest response — confirmed directly: a real, live
        // conversation had its final question's answer fully visible on
        // the actual page, yet completely absent from what got captured
        // moments earlier. If the captured text ends right at a marked
        // question with nothing substantial after it, that's a strong,
        // specific signal the last answer wasn't there yet when this ran.
        var TITLE_MARK_CHECK = '\u2063';
        var endsWithUnansweredQuestionRe = new RegExp(TITLE_MARK_CHECK + '\\*\\*[^*]+\\*\\*' + TITLE_MARK_CHECK + '\\s*$');
        if (endsWithUnansweredQuestionRe.test(contentToSave)) {
          console.log('[Diary Sync DIAG] refusing to save — captured text ends at a question with no answer after it (likely still rendering)');
          console.log('[Diary Sync DIAG] DIAGNOSTIC — full contentToSave length:', contentToSave.length, '| last 400 chars:', JSON.stringify(contentToSave.slice(-400)));
          console.log('[Diary Sync DIAG] DIAGNOSTIC — window.__diaryCapture.turns:', JSON.stringify((window.__diaryCapture && window.__diaryCapture.turns || []).map(function(t){ return {url:t.url, len:t.text.length, preview:t.text.slice(0,60)}; })));
          if (btn) {
            btn.textContent = 'Still loading…';
            btn.style.background = '#6B6B88';
            setTimeout(function() { btn.remove(); }, 3000);
          }
          return { success: false, error: 'incomplete_response' };
        }
        console.log('[Diary] contentToSave preview:', contentToSave.slice(0,300));
        // saveUrl: use most specific URL available
        //
        // NOTE: fixed — confirmed live as a real, reproduced, serious
        // bug: this previously considered EVERY turn ever captured in
        // this tab's lifetime, across however many different, unrelated
        // conversations were visited via the app's own sidebar (SPA
        // navigation never reloads the page, so window.__diaryCapture.
        // turns genuinely accumulates turns from multiple conversations
        // within one tab session — already known and handled correctly
        // for the CONTENT itself via captureTurns' own URL filter above,
        // but this separate saveUrl computation never applied that same
        // filter). Blindly picking whichever turn's URL happened to be
        // longest meant a save could compute its content correctly from
        // only the current conversation, yet compute its OWN saveUrl
        // from a completely different, unrelated, earlier conversation's
        // turn — causing the save to silently overwrite THAT unrelated
        // entry instead of its own (confirmed: a Reagan conversation's
        // saved entry ended up with an unrelated Michael Jackson
        // conversation's content merged into it this way).
        //
        // Now walks backward from the most recently captured turn and
        // stops at the first one that doesn't belong to the current,
        // ongoing conversation (exact URL match, or the turn's own URL
        // still being an unresolved "/new" placeholder) — this only
        // ever considers the CURRENT conversation's own, contiguous run
        // of turns, naturally excluding anything from an earlier,
        // different conversation without needing to solve the harder,
        // more general problem of telling two different "/new"
        // conversations apart from their URL alone.
        var saveUrl = canonicalUrl();
        if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length) {
          var turnUrls = [];
          for (var saveUrlTurnIdx = window.__diaryCapture.turns.length - 1; saveUrlTurnIdx >= 0; saveUrlTurnIdx--) {
            var _t = window.__diaryCapture.turns[saveUrlTurnIdx];
            var _tUrl = _t.url ? _t.url.split('?')[0] : '';
            if (_tUrl === saveUrl || /\/new(\?|$)/.test(_t.url)) {
              if (_tUrl.length > saveUrl.length) turnUrls.push(_tUrl);
            } else {
              break;
            }
          }
          if (turnUrls.length) {
            turnUrls.sort(function(a, b) { return b.length - a.length; });
            saveUrl = turnUrls[0];
          }
        }

                var data = await new Promise(function(resolve, reject) {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: {
            type: 'SAVE_TO_DIARY',
            token: token,
            source: PROVIDER,
            prompt: prompt,
            content: contentToSave,
            append: false, // always send complete conversation snapshot
            url: saveUrl,
            images: images,
            // Generic across all providers via registry[PROVIDER] — any
            // provider with its own getAttachments() defined is picked
            // up automatically here with no further change needed to
            // this call site; providers without one correctly send [].
            attachments: (registry[PROVIDER] && registry[PROVIDER].getAttachments) ? registry[PROVIDER].getAttachments() : []
          }}, '*');
          var handler = function(e) {
            if (e.data && e.data.type === '__DIARY_EXT_DATA__' && e.data.savedToDiary) {
              window.removeEventListener('message', handler);
              resolve({ success: e.data.success, error: e.data.error, chatSessionSync: e.data.chatSessionSync });
            }
          };
          window.addEventListener('message', handler);
          setTimeout(function() { reject(new Error('timeout')); }, 10000);
        });
        if (data.success) {
          if (btn) {
            btn.textContent = String.fromCharCode(10003) + ' Saved to Diary';
            btn.style.background = '#22c55e';
            setTimeout(function() { btn.remove(); }, 3000);
          }
          return { success: true, chatSessionSync: data.chatSessionSync };
        } else {
          throw new Error(data.error || 'Save failed');
        }
      } catch(e) {
        if (btn) {
          btn.textContent = 'Failed — try again';
          btn.style.background = '#ef4444';
          btn.disabled = false;
          setTimeout(function() { btn.remove(); }, 4000);
        }
        return { success: false, error: e.message };
      }
    }

    // Expose for remote triggering (Sync feature) — see the new
    // TRIGGER_SYNC_SAVE listener below, which polls for this to become
    // available rather than assuming it's already set the instant the
    // page loads: confirmed directly that this only gets (re-)assigned
    // once injectSaveDiaryButton() itself has run at least once, which
    // for an existing, already-completed conversation depends on either
    // an incidental broad webRequest match on page load (6 of 8
    // providers) or the dedicated 2s existing-conversation fallback
    // (Mistral, DeepSeek) — both reliable, but neither instantaneous.
    window.__diaryPerformSave = performSaveToDiary;

    btn.onclick = () => performSaveToDiary(btn);

    document.body.appendChild(btn);
    // NOTE: no auto-removal timeout here. injectSaveDiaryButton() already
    // removes any existing button at the start before injecting a new one,
    // so a fresh turn naturally replaces a stale button — a fixed timer
    // isn't needed for cleanup and only causes real harm: it silently
    // removes the user's ability to save if they take more than the
    // timeout to read a response, think, or verify something first.
    // Confirmed live: this was firing mid-way through normal use.
  }




  // ── Listen for messages from background (via isolated relay) ───────────────
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== '__DIARY_FROM_EXT__') return;
    const message = event.data.payload;
    if (message.type === 'INJECT_PROMPT' || message.type === 'INJECT_PENDING_PROMPT') {
      injectPrompt(message.prompt).then(ok => {
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'INJECT_RESULT', ok, provider: PROVIDER }}, '*');
      });
    }
    if (message.type === 'CHECK_AUTH') {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'AUTH_RESULT', authenticated: isAuthenticated(), provider: PROVIDER }}, '*');
    }
    // Sync feature's remote-trigger path — see performSaveToDiary's own
    // window.__diaryPerformSave exposure comment for why this polls
    // rather than assumes it's already set: for an existing, already-
    // completed conversation (exactly what Sync operates on), that
    // exposure only happens once injectSaveDiaryButton() has itself run
    // at least once, which depends on either an incidental webRequest
    // match or a dedicated ~2s fallback timer, neither instantaneous on
    // page load. Polling briefly rather than firing immediately avoids
    // a real, likely race: a Sync tab opened fresh, with this message
    // arriving (per background.js's own design) at document_idle, well
    // before either of those completion signals has necessarily fired
    // yet.
    //
    // Ceiling raised from 10s to 35s after a confirmed, live timeout:
    // a genuinely fresh tab opened with active:false (Sync's own,
    // deliberate "never steal focus" choice) is measurably throttled by
    // Chrome — fewer parallel connections during its own page load, and
    // this very setTimeout-based poll itself running slower than its
    // nominal 500ms interval in a background/hidden tab. The same tab,
    // once already warmed up by a prior load, succeeded quickly — this
    // isn't a broken mechanism, just a slower one for a genuinely cold,
    // backgrounded load.
    if (message.type === 'TRIGGER_SYNC_SAVE') {
      console.log('[Diary Sync DIAG] TRIGGER_SYNC_SAVE received (isRetry:', !!message.isRetry, '). window.__diaryPerformSave already set?', !!window.__diaryPerformSave);
      // Confirmed live as a real, genuine, serious bug: this lock alone
      // (no expiry) can get stuck HELD INDEFINITELY if the underlying
      // performSaveToDiary() promise itself never resolves — which is
      // exactly what a genuinely throttled/frozen tab does. Every
      // subsequent retry message then gets silently ignored while
      // background.js keeps waiting on a call that may never finish
      // without the tab being brought into focus first — reproduced
      // live: sync would only ever complete the instant the user
      // clicked into the tab's own DevTools, at which point the
      // ORIGINAL, still-pending call finally resolved once throttling
      // lifted, not because of anything the retry messages themselves
      // did. A staleness window fixes this without removing the
      // lock's own, still-genuinely-necessary protection against real,
      // fast, overlapping concurrent calls (which is what actually
      // caused yesterday's confirmed data corruption) — an attempt
      // considered stuck for this long is either doomed or waiting on
      // exactly the kind of focus-dependent recovery this whole retry
      // mechanism exists to avoid requiring, so letting a fresh attempt
      // through is the safer choice. Set comfortably above
      // background.js's own 10s per-attempt timeout, so a genuinely
      // slow-but-working attempt still gets a fair, undisrupted chance
      // to finish first.
      var LOCK_STALE_MS = 12000;
      if (window.__diarySyncAttemptInProgress && (Date.now() - (window.__diarySyncAttemptStartedAt || 0)) < LOCK_STALE_MS) {
        console.log('[Diary Sync DIAG] ignoring TRIGGER_SYNC_SAVE — an attempt is already in progress on this tab (age:', Date.now() - window.__diarySyncAttemptStartedAt, 'ms)');
        return;
      }
      if (window.__diarySyncAttemptInProgress) {
        console.log('[Diary Sync DIAG] previous attempt exceeded staleness window (', Date.now() - window.__diarySyncAttemptStartedAt, 'ms) — treating as stuck, allowing a fresh attempt through');
      }
      // isRetry distinguishes background.js's own re-sent retry messages
      // from the original, first trigger for this sync attempt — part of
      // moving the retry loop out of this tab entirely (see the note on
      // attemptSaveOnce() below for the full rationale). Only the FIRST
      // message should do the one-time setup below; a retry message
      // skips straight to a single attempt, since window.__diaryPerformSave
      // is already set up by then, AND because re-running the turns
      // reset on every retry would silently reintroduce the exact
      // promptCountAtCapture bug fixed yesterday — resetting turns to
      // empty on every attempt would make refreshLatestDomCaptureForRetry()
      // always take its "first turn for this conversation" branch, which
      // always tags promptCountAtCapture as 1 regardless of how many
      // prompts have actually accumulated by then.
      if (message.isRetry) {
        attemptSaveOnce();
        return;
      }
      // Reset turns (not the whole window.__diaryCapture object — leaves
      // historySeed, relevant for Claude, untouched) at the START of
      // every Sync-triggered save. Confirmed live as a real, necessary
      // fix, not defensive-only: when the SAME tab is reused across
      // multiple, separate Sync attempts (rather than a fresh tab each
      // time), turns accumulates entries from different, unrelated
      // attempts — each capturing whatever was visible AT THAT MOMENT,
      // in the order those attempts happened to run, not the order those
      // turns actually occurred in the conversation. This corrupts BOTH
      // the array's own order AND the promptCountAtCapture values tagged
      // onto each entry (computed from turns.length at push time, which
      // is itself unreliable once entries span unrelated attempts) —
      // reproduced live: a newest, fully-captured, complete answer
      // ending up silently absent from the final saved content, despite
      // sitting right there in turns with the correct, full text. This
      // reset doesn't lose anything the entry itself would still need:
      // Sync's whole purpose is finding content NEW since the last save
      // — the earlier, already-saved part is separately preserved via
      // the backend's own existing-content merge, not via turns at all.
      if (window.__diaryCapture) window.__diaryCapture.turns = [];
      // Confirmed via direct, live testing that passively waiting on
      // this alone is genuinely unreliable, not just slow: the SAME
      // scenario succeeded at poll attempt 62/70 once, then failed to
      // ever become available at all (>70 attempts) on a later,
      // otherwise-identical run. injectSaveDiaryButton() itself is
      // directly callable here (confirmed: both are declared within
      // the same, single, top-level content-script IIFE, so normal JS
      // function-declaration hoisting makes this safe regardless of
      // call order) and, critically, doesn't depend on any DOM/network
      // state to run — it just defines the button and its handler,
      // synchronously setting window.__diaryPerformSave as a direct
      // side effect. Calling it proactively here — rather than only
      // ever reacting to the incidental, unpredictable completion
      // signal it normally waits for — makes it available immediately
      // for Sync's own purposes, without waiting on a signal that may
      // never fire in time (or, per today's live tests, at all) for a
      // fresh, backgrounded tab load specifically.
      if (!window.__diaryPerformSave) {
        // Delayed rather than immediate — confirmed live as a real,
        // separate cause on Meta AI specifically: injecting a DOM
        // element (the button) this early — right when the page merely
        // reports the browser's own 'complete' status, which says
        // nothing about whether a React/Next.js app has actually
        // finished its own initial hydration pass yet — is a
        // well-documented trigger for React's hydration-mismatch error
        // (#418: server-rendered HTML no longer matches the live DOM
        // once something external has already modified it). Reproduced
        // live: immediately after this proactive injection ran, Meta
        // AI's own app threw exactly that error, and its normal
        // AI_RESPONSE_COMPLETE signal only fired well afterward — well
        // past this retry window's own ceiling. A short, fixed delay
        // gives hydration time to genuinely finish before any DOM
        // injection happens at all, for every provider, not just Meta
        // AI — low-risk for the providers already confirmed working
        // today, since they'd still succeed, just slightly later.
        setTimeout(function() {
          try { injectSaveDiaryButton('sync-trigger'); } catch(e) { console.log('[Diary Sync DIAG] proactive injectSaveDiaryButton() call threw:', e.message); }
        }, 1500);
      }
      var syncPollAttempts = 0;
      var syncPollMax = 70; // 70 * 500ms = 35s ceiling
      (function pollForSaveFn() {
        if (window.__diaryPerformSave) {
          console.log('[Diary Sync DIAG] window.__diaryPerformSave available after', syncPollAttempts, 'poll attempt(s) — calling it now');
          attemptSaveOnce();
          return;
        }
        syncPollAttempts++;
        if (syncPollAttempts >= syncPollMax) {
          console.log('[Diary Sync DIAG] gave up after', syncPollAttempts, 'poll attempts — window.__diaryPerformSave never became available');
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SYNC_SAVE_RESULT', success: false, error: 'save_function_unavailable' } }, '*');
          return;
        }
        setTimeout(pollForSaveFn, 500);
      })();

      // Confirmed live as a real, distinct problem from the poll above:
      // proactively calling injectSaveDiaryButton() makes
      // window.__diaryPerformSave available immediately, but that
      // function only sets up the save capability itself — it does NOT
      // populate the actual captured conversation data
      // (window.__diaryCapture.turns etc.), which is a separate,
      // provider-specific mechanism running independently. Confirmed:
      // a genuinely real Perplexity conversation still correctly
      // returned no_content_found, meaning performSaveToDiary() ran
      // before that separate capture logic had populated anything at
      // all yet. Retrying with a short delay gives it that time,
      // rather than either failing immediately on the first empty
      // result, or (the earlier version of this fix) accepting
      // whatever's there right away regardless of whether real capture
      // has actually happened.
      //
      // Also retries on 'incomplete_response' — a different, more subtle
      // case than "nothing at all," confirmed live for ChatGPT
      // specifically: a real conversation's final answer was fully
      // visible on the actual page, yet completely missing from what got
      // captured moments earlier, because ChatGPT's own response
      // rendering (inline streaming script tags, no network-based
      // fallback at all) can still be hydrating the latest turn even
      // after the page reports 'complete'.
      // Raised from 6 (12s) — confirmed live as genuinely insufficient
      // for a specific, real combined scenario: a stale-connection
      // recovery reloads the tab from scratch, and a long ChatGPT
      // conversation's entire history can take meaningfully longer to
      // fully render on a cold, just-reloaded tab than on one that was
      // already warm — waitForTabComplete() only waits for the
      // browser's own technical 'complete' status, not for ChatGPT's
      // own, slower client-side hydration of a long conversation.
      // Raised from 10 (20s) — confirmed live, on Meta AI, that this
      // window was genuinely too short, not caused by React hydration
      // timing as an earlier fix here assumed. Traced the actual event
      // order directly: performSaveToDiary() had already resolved with
      // incomplete_response BEFORE a real, separate React error even
      // fired on the page — the error was coincidental, not the cause.
      // The genuine explanation is simpler: this provider's own
      // response can legitimately take longer to finish than 20
      // seconds, and this window gave up before that genuine
      // completion signal ever arrived. Raised to 25 attempts (50s),
      // leaving real margin within the overall 60s ceiling for tab
      // load and other overhead.
      //
      // RETRY LOOP MOVED OUT OF THIS FILE ENTIRELY — confirmed live, on
      // both ChatGPT and DeepSeek specifically, as a genuine, real,
      // production-affecting bug (not a console-testing artifact —
      // reproduced identically via an actual Sync button click): Chrome
      // documents especially aggressive throttling of CHAINED setTimeout
      // calls in a background (active:false) tab specifically, and this
      // exact retry loop was precisely that pattern (each attempt
      // scheduling the next via its own setTimeout). Confirmed the
      // stall was real and complete, not just slow — the loop never
      // progressed at all until the tab was manually clicked into
      // focus. The six other providers never triggered this because
      // they each succeed within the first attempt or two (a real
      // network completion signal, or Meta AI's own direct DOM-pairing
      // triggered off the genuine completion event) — ChatGPT and
      // DeepSeek are the two structurally forced to lean hardest on
      // this exact mechanism, since neither has a reliable completion
      // signal for Sync's specific "revisit an already-finished
      // conversation" scenario. background.js's own service-worker
      // context isn't a regular tab and isn't subject to the same
      // tab-freezing rules, so it now owns the retry timing instead —
      // this function performs exactly ONE attempt per TRIGGER_SYNC_SAVE
      // message and reports the result immediately; see
      // fetchSyncResultFromTab() in background.js for the retry loop
      // itself.
      function attemptSaveOnce() {
        // Token-based release — confirmed necessary to avoid a second,
        // related race: if the OLD, stale attempt eventually resolves
        // after a fresh attempt has already started (past the
        // staleness window above), its own finally() would otherwise
        // blindly clear the lock — potentially while the NEW attempt is
        // still genuinely, actively in progress, defeating the lock's
        // whole purpose right after fixing its staleness problem. Each
        // attempt only ever clears the lock if it's still the current,
        // active one by the time it finishes.
        var myToken = Date.now() + '_' + Math.random();
        window.__diarySyncAttemptInProgress = true;
        window.__diarySyncAttemptStartedAt = Date.now();
        window.__diarySyncAttemptToken = myToken;
        window.__diaryPerformSave().then(function(result) {
          // Confirmed as a real, direct gap found during a priority-
          // ordering audit: the token check below only ever guarded lock
          // CLEARING, not the actual result being posted at all. A stale
          // attempt that eventually resolves after being superseded (the
          // exact scenario this whole token mechanism exists for) would
          // still post its own SYNC_SAVE_RESULT here regardless — and
          // background.js's own PATCH handler has no way to know this
          // result came from an old, already-superseded attempt rather
          // than the current one. Since that PATCH does a straight
          // content replace (see backend/routes/diary.js), an older,
          // stale attempt's own capture — genuinely older by definition,
          // since it started before the fresh attempt that superseded it
          // — could silently overwrite newer, already-saved content with
          // older content, the exact "older data wins" regression risk
          // this whole staleness window was designed to accept as a
          // trade-off, not to reintroduce as its own new bug. Checking
          // the same token here too closes that gap: a superseded
          // attempt's result is simply discarded rather than ever
          // reaching background.js at all.
          if (window.__diarySyncAttemptToken !== myToken) {
            console.log('[Diary Sync DIAG] a stale attempt resolved after being superseded — discarding its result instead of posting it');
            return;
          }
          console.log('[Diary Sync DIAG] performSaveToDiary() resolved:', JSON.stringify(result));
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SYNC_SAVE_RESULT', success: !!(result && result.success), error: result && result.error, chatSessionSync: result && result.chatSessionSync } }, '*');
        }).catch(function(err) {
          if (window.__diarySyncAttemptToken !== myToken) {
            console.log('[Diary Sync DIAG] a stale attempt threw after being superseded — discarding its result instead of posting it');
            return;
          }
          console.log('[Diary Sync DIAG] performSaveToDiary() threw:', err && err.message);
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SYNC_SAVE_RESULT', success: false, error: err && err.message } }, '*');
        }).finally(function() {
          if (window.__diarySyncAttemptToken === myToken) {
            window.__diarySyncAttemptInProgress = false;
          } else {
            console.log('[Diary Sync DIAG] a stale attempt finally resolved after being superseded — not clearing the current attempt\'s lock');
          }
        });
      }
    }
  });

  // Expose direct injection function for background scripting
  window.__diaryInject = (prompt) => {
    console.log(`[Forge] ${PROVIDER}: __forgeInject called`);
    injectPrompt(prompt);
  };


  // For providers that need submit-time prompt capture, hook inputs early
  if (PROVIDER_CONFIG._hookInput) {
    setTimeout(function() { PROVIDER_CONFIG._hookInput(); }, 1500);
    setTimeout(function() { PROVIDER_CONFIG._hookInput(); }, 5000);
  }

  // Listen for pending prompt pushed from background via isolated world bridge
  (function() {
    window.addEventListener('message', function(ev) {
      if (!ev.data) return;
      // Support both direct injection and __DIARY_FROM_EXT__ wrapper
      var prompt = null;
      if (ev.data.type === '__DIARY_FROM_EXT__' && ev.data.payload && ev.data.payload.type === 'INJECT_PENDING_PROMPT') {
        prompt = ev.data.payload.prompt;
      } else if (ev.data.type === '__DIARY_INJECT_PROMPT__') {
        prompt = ev.data.prompt;
      }
      if (!prompt) return;
      if (!prompt) return;
      console.log('[Forge] Injecting pending prompt:', prompt.slice(0,40));
      setTimeout(function() {
        var inp = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
        if (!inp) return;
        if (inp.tagName === 'TEXTAREA') {
          inp.value = prompt;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          inp.focus();
          document.execCommand('selectAll', false, null);
          document.execCommand('insertText', false, prompt);
        }
        inp.focus();
        console.log('[Forge] Prompt injected');
      }, 500);
    });
  })();

  console.log(`[Forge] ${PROVIDER} ready`);

  // ── Forge Control Bar ───────────────────────────────────────────────────────
  // Injects on ALL 7 provider sites — the bar travels with the user everywhere
  {
    const BAR_ID    = '__diary_control_bar__';
    const FORGE_URL = 'https://diary.projectcoachai.com';

    // All 7 providers and their real sites — all use OPEN_PROVIDER (real chatbot)
    const ALL_PROVIDERS = [
      { id: 'claude',     name: 'Claude',     color: '#d97706' },
      { id: 'chatgpt',    name: 'ChatGPT',    color: '#10b981' },
      { id: 'gemini',     name: 'Gemini',     color: '#3b82f6' },
      { id: 'mistral',    name: 'Mistral',    color: '#f97316' },
      { id: 'deepseek',   name: 'DeepSeek',   color: '#6366f1' },
      { id: 'perplexity', name: 'Perplexity', color: '#20b2aa' },
      { id: 'grok',       name: 'Grok',       color: '#e11d48' },
    ];

    // The current provider's color and display name
    const CURRENT = ALL_PROVIDERS.find(p => p.id === PROVIDER) || { color: '#ffffff', name: PROVIDER };
    // All others shown as switch targets
    const OTHERS  = ALL_PROVIDERS.filter(p => p.id !== PROVIDER);

    // Grab whatever is currently typed in the host AI's input box
    function getCurrentPrompt() {
      const selectors = INPUT_SELECTORS[PROVIDER] || ['textarea', '[contenteditable="true"]'];
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && isVisible(el)) {
            const text = getInputText(el).trim();
            if (text) return text;
          }
        } catch (_) {}
      }
      return '';
    }

    function injectForgeBar() { return; // Replaced by provider-dock.js
      if (document.getElementById(BAR_ID)) return;
      if (!isAuthenticated()) return;

      const bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'height:40px',
        'background:rgba(10,10,15,0.97)', 'backdrop-filter:blur(16px)',
        'border-bottom:1px solid rgba(255,255,255,0.1)',
        'display:flex', 'align-items:center', 'justify-content:space-between',
        'padding:0 12px', 'z-index:2147483647',
        'font-family:-apple-system,sans-serif', 'font-size:12px',
        'color:rgba(255,255,255,0.7)', 'box-sizing:border-box',
        'overflow:hidden',
      ].join(';');

      const btnStyle = (p) =>
        `background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);` +
        `border-radius:6px;padding:3px 9px;color:${p.color};font-size:11px;font-weight:600;` +
        `cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;`;

      bar.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
          <span style="font-weight:700;color:${CURRENT.color};">🔥 Forge</span>
          <span style="opacity:0.35;">|</span>
          <span style="opacity:0.55;font-size:11px;white-space:nowrap;">Using your ${CURRENT.name} subscription</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;overflow:hidden;padding:0 6px;">
          <span style="opacity:0.4;font-size:11px;white-space:nowrap;flex-shrink:0;">Switch:</span>
          ${OTHERS.map(p =>
            `<button data-switch="${p.id}" style="${btnStyle(p)}">${p.name}</button>`
          ).join('')}
          <span style="opacity:0.3;margin:0 3px;flex-shrink:0;">|</span>
          <button id="__forge_compare__" style="background:rgba(255,107,53,0.15);border:1px solid rgba(255,107,53,0.35);border-radius:6px;padding:3px 12px;color:#ff6b35;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;">✦ All Perspectives</button>
        </div>`;

      document.documentElement.insertBefore(bar, document.documentElement.firstChild);
      document.documentElement.style.paddingTop = '40px';

      // Force any sticky/fixed headers on the host page to sit below the Forge bar
      const stickyFix = document.createElement('style');
      stickyFix.id = '__forge_sticky_fix__';
      stickyFix.textContent = `
        body > header[style*="position"],
        body > div > header,
        header.sticky, header[data-fixed], header[class*="sticky"], header[class*="fixed"],
        nav[class*="sticky"], nav[class*="fixed"], nav[style*="position:fixed"],
        [class*="topbar"], [class*="top-bar"], [class*="navbar"],
        [class*="AppHeader"], [class*="header--sticky"] {
          top: 40px !important;
        }
      `;
      document.head.appendChild(stickyFix);

      // All switches go to the real provider site — user gets the real chatbot
      bar.querySelectorAll('[data-switch]').forEach(btn => {
        btn.addEventListener('click', () => {
          const prompt = getCurrentPrompt();
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'OPEN_PROVIDER', provider: btn.dataset.switch, prompt }}, '*');
        });
      });

      document.getElementById('__forge_compare__').addEventListener('click', () => {
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'SET_STORAGE', key: '__forge_quick_compare', value: { provider: PROVIDER, timestamp: Date.now() } }}, '*');
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'OPEN_FORGE', url: FORGE_URL + '?from=' + PROVIDER }}, '*');
      });
    }

    function tryInjectBar() {
      if (!document.getElementById(BAR_ID) && isAuthenticated()) injectForgeBar();
    }

    // Bar injection disabled - using provider-dock.js instead
    // setTimeout(tryInjectBar, 1500);
    setTimeout(tryInjectBar, 3000);
    setTimeout(tryInjectBar, 6000);
    setTimeout(tryInjectBar, 10000);
  }
  // ^ Closes the Forge Control Bar's own bare block (opened above at its
  // section header) — confirmed live, via direct AST parsing (acorn), as
  // a real, genuine, pre-existing bug: this closing brace was missing
  // entirely, so the bare block never actually closed here at all — it
  // silently absorbed the ENTIRE REST OF THE FILE as its own body
  // instead (confirmed: this single block's true end, before this fix,
  // was line 4436 — everything from the DOM reader section onward,
  // including readDomResponse, refreshLatestDomCaptureForRetry, the
  // ChatGPT MutationObserver logic, and the SPA-navigation bar
  // re-injection logic at the very end of the file, was all nested
  // inside it). Function declarations inside a bare block are
  // block-scoped in strict mode, not hoisted to the enclosing function —
  // so none of that code was ever visible to anything defined earlier in
  // the file. This had never caused a visible problem before, since
  // nothing outside this region previously needed to call into it —
  // until refreshLatestDomCaptureForRetry() was wired to be called from
  // performSaveToDiary() (defined much earlier, outside this block),
  // causing a genuine, reproduced "is not defined" ReferenceError on
  // DeepSeek specifically (the provider whose retry path most directly
  // depends on this call succeeding). The matching closing brace that
  // used to sit at the true end of this block (previously line 4436, at
  // the end of the file) has been removed as part of this same fix —
  // see the matching note there.

  // ── DOM reader for providers not captured by fetch interceptor ───────────────
  // Triggered by webRequest completion signal from background.js
  // Reads fully-rendered DOM text after a settle delay

  // Global DOM text cleaner - same artifacts as interceptor cleanText
  var DOM_SELECTORS = {
    'gemini.google.com': {
      response: 'message-content .markdown',
      clean: function(text) {
        // NOTE: `.replace(/\[\d+\]/g, '')` used to live here too (same
        // pattern, same reasoning as cleanDomText() above) — removed for
        // the same confirmed corruption reason: it breaks real markdown
        // links Turndown produces and strips legitimate bracketed numbers
        // from real content.
        return text.replace(/^Sources?\n[\s\S]*?(?=\n\n|$)/m, '')
                   .replace(/\n{3,}/g, '\n\n')
                   .trim();
      }
    },
    'www.perplexity.ai': {
      response: '.prose',
      // NOTE: see the matching registry.perplexity comment above for the
      // full rationale — '.line-clamp-6' was only conditionally present.
      prompt: '.max-h-\\[144px\\].overflow-hidden',
      // NOTE: prompt selector fixed — '[data-testid="user-message"]' was
      // confirmed DEAD (0 matches) on Perplexity's current page. See the
      // matching note on registry.perplexity above for the full context.
      // response left unchanged ('.prose') — already proven working by
      // the existing capture pipeline; the more specific
      // '[data-renderer="lm"]' (confirmed to match the same elements) is
      // used only within the new DOM-pairing logic below, not here, to
      // avoid risking a change to something already working correctly.
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'chat.deepseek.com': {
      response: '.ds-markdown',
      prompt: '[class*="user-message"], .fbb737a4',
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'chat.mistral.ai': {
      // NOTE: response replaced entirely — the old broad, generic-class
      // selector was confirmed live to match BOTH the real visible answer
      // AND Mistral's own hidden "Thought for Xs" reasoning text, since
      // both use the same markdown-container-style class. This explained
      // the saved content starting with internal reasoning ("The user is
      // asking a straightforward medical question...") instead of the
      // actual answer, and "0 question(s) total" downstream, since the
      // merge/interleave logic was working with contaminated data from
      // the start. data-message-part-type="answer" is a genuinely
      // semantic, purpose-built attribute confirmed live to cleanly
      // separate the two — reasoning sections carry
      // data-message-part-type="reasoning" instead, a completely
      // distinct value. Confirmed: exactly 2 matches for 2 real answers,
      // zero reasoning text included.
      response: '[data-message-part-type="answer"]',
      // NOTE: prompt selector fixed — the previously-configured
      // '[class*="UserMessage"], [data-testid="user-message"],
      // [data-message-role="user"]' was confirmed live to be entirely
      // dead. See the matching note on registry.mistral above for the
      // full context.
      prompt: '.ms-auto span.whitespace-pre-wrap',
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'grok.com': {
      // NOTE: response tightened from '.message-bubble' to exclude
      // elements carrying data-testid="user-message" — confirmed live via
      // direct DOM inspection that Grok uses the SAME .message-bubble
      // class for both the user's question and the assistant's answer,
      // distinguished only by this attribute on the user's version. The
      // old, unqualified selector was capturing both roles together,
      // meaning readDomResponse() joined the user's own question text
      // into what was supposed to be just the answer — explaining a real,
      // confirmed duplication (the question appearing correctly bolded
      // once from the real prompt-capture mechanism, then AGAIN as plain
      // text, swept in by this over-broad selector). Verified via direct
      // test against the real confirmed structure before applying.
      response: '.message-bubble:not([data-testid="user-message"])',
      prompt: '[data-testid="user-message"], .user-message',
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    },
    'www.meta.ai': {
      response: '[class*="assistant"] [class*="content"]',
      prompt: '[class*="user"] [class*="content"]',
      clean: function(text) {
        return text.replace(/Here\'s the map.*$/m, '')
                   .replace(/\n{3,}/g, '\n\n')
                   .trim();
      }
    },
    'chatgpt.com': {
      // ChatGPT delivers responses via React Router's inline server-streaming
      // (script tags executing during page load), not a separate fetch/XHR
      // call — confirmed via DevTools: Network tab shows zero matching
      // requests for a completed response, and view-source shows
      // window.__reactRouterContext.streamController.enqueue(...)/close()
      // script tags carrying the content. The interceptor's fetch/XHR
      // patches structurally cannot see this, on ANY response (not just
      // "Fast answer" ones — confirmed on a normal long response too), so
      // DOM reading is the primary capture path here, not a fallback.
      response: 'section[data-turn="assistant"] .text-base',
      prompt: 'section[data-turn="user"] .text-base', // TODO: verify against live DOM — not yet directly confirmed
      clean: function(text) {
        return text.replace(/\n{3,}/g, '\n\n').trim();
      }
    }
  };

  // ── Shared: HTML structure -> Markdown conversion ──────────────────────────
  // Global default per the architecture already documented at the top of
  // this file ("Shared utilities... are defaults that providers can
  // override"). Converts real rendered HTML (headers, lists, tables, bold/
  // italic, links) to markdown syntax, instead of flattening everything to
  // plain text via innerText — which is what every DOM provider did before
  // this, losing all structure. Works at the HTML-tag level (h1-h6, ul/ol/
  // li, table/tr/td, strong/em, a, code/pre) rather than per-provider
  // selectors, since markdown-rendering libraries across these products
  // all produce broadly similar standard HTML for the actual content
  // structure, even though the surrounding wrapper markup differs per site.
  // Verified via unit tests against realistic HTML (nested lists, tables,
  // headers, bold labels, links, empty/malformed elements, deep nesting)
  // before being wired in here.
  function htmlToMarkdown(el) {
    if (!el) return '';

    function walk(node, listDepth) {
      listDepth = listDepth || 0;
      if (node.nodeType === 3) { // TEXT_NODE
        // Whitespace-only text nodes are common between sibling block-level
        // elements in real HTML and carry no content — collapsing them to
        // a single space left stray artifacts in testing; drop them
        // entirely instead.
        if (/^\s*$/.test(node.textContent)) return '';
        return node.textContent.replace(/\s+/g, ' ');
      }
      if (node.nodeType !== 1) return '';

      var tag = node.tagName.toLowerCase();
      var children = Array.from(node.childNodes);

      function childrenText(depth) {
        return children.map(function(c) { return walk(c, depth); }).join('');
      }

      switch (tag) {
        case 'h1': return '\n\n# ' + childrenText(listDepth).trim() + '\n\n';
        case 'h2': return '\n\n## ' + childrenText(listDepth).trim() + '\n\n';
        case 'h3': return '\n\n### ' + childrenText(listDepth).trim() + '\n\n';
        case 'h4': return '\n\n#### ' + childrenText(listDepth).trim() + '\n\n';
        case 'h5': return '\n\n##### ' + childrenText(listDepth).trim() + '\n\n';
        case 'h6': return '\n\n###### ' + childrenText(listDepth).trim() + '\n\n';
        case 'strong': case 'b': {
          var tb = childrenText(listDepth).trim();
          return tb ? '**' + tb + '**' : '';
        }
        case 'em': case 'i': {
          var ti = childrenText(listDepth).trim();
          return ti ? '*' + ti + '*' : '';
        }
        case 'code':
          if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') {
            return childrenText(listDepth);
          }
          return '`' + childrenText(listDepth) + '`';
        case 'pre':
          return '\n\n```\n' + node.textContent.trim() + '\n```\n\n';
        case 'a': {
          var href = node.getAttribute('href') || '';
          var text = childrenText(listDepth).trim();
          if (!href || href.indexOf('javascript:') === 0) return text;
          return '[' + text + '](' + href + ')';
        }
        case 'br': return '\n';
        case 'ul': {
          var itemsUl = children.filter(function(c) { return c.nodeType === 1 && c.tagName.toLowerCase() === 'li'; });
          var outUl = '\n';
          itemsUl.forEach(function(li) {
            var indent = '  '.repeat(listDepth);
            outUl += indent + '- ' + walkListItem(li, listDepth + 1) + '\n';
          });
          return outUl + '\n';
        }
        case 'ol': {
          var itemsOl = children.filter(function(c) { return c.nodeType === 1 && c.tagName.toLowerCase() === 'li'; });
          var outOl = '\n';
          itemsOl.forEach(function(li, i) {
            var indent = '  '.repeat(listDepth);
            outOl += indent + (i + 1) + '. ' + walkListItem(li, listDepth + 1) + '\n';
          });
          return outOl + '\n';
        }
        case 'table':
          return '\n\n' + tableToMarkdown(node) + '\n\n';
        case 'p': case 'div':
          return '\n\n' + childrenText(listDepth).trim() + '\n\n';
        default:
          return childrenText(listDepth);
      }
    }

    function walkListItem(li, depth) {
      return Array.from(li.childNodes).map(function(c) { return walk(c, depth); }).join('').trim();
    }

    function tableToMarkdown(table) {
      var rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) return '';
      var lines = [];
      rows.forEach(function(row, ri) {
        var cells = Array.from(row.querySelectorAll('th,td'));
        var cellTexts = cells.map(function(c) {
          return Array.from(c.childNodes).map(function(n) { return walk(n, 0); }).join('').trim().replace(/\|/g, '\\|');
        });
        lines.push('| ' + cellTexts.join(' | ') + ' |');
        if (ri === 0) {
          lines.push('| ' + cellTexts.map(function() { return '---'; }).join(' | ') + ' |');
        }
      });
      return lines.join('\n');
    }

    var result = walk(el, 0);
    return result.replace(/\n{3,}/g, '\n\n').trim();
  }

  function readDomResponse() {
    var host = window.location.hostname;
    var config = DOM_SELECTORS[host];
    if (!config) { console.log('[Diary Sync DIAG] readDomResponse: no DOM_SELECTORS config for host:', host); return null; }

    var els = document.querySelectorAll(config.response);
    console.log('[Diary Sync DIAG] readDomResponse: host:', host, '| selector:', config.response, '| matched elements:', els.length);
    if (!els.length) return null;

    // Read ALL response elements joined - full conversation, one growing
    // thread per conversation (reverted from a brief "one entry per
    // exchange" experiment — that architecture was explicitly ruled out:
    // the product requires a single thread per conversation containing
    // multiple exchanges, not separate standalone entries per question).
    //
    // Prefer structured markdown (headers, lists, tables, bold/links) over
    // plain innerText, with a safe fallback: if the converter throws, or
    // produces suspiciously little output relative to the raw text (e.g.
    // less than half the length — a sign something about this element's
    // structure broke the walker), fall back to the plain-text behavior
    // that was already working, so this enhancement can only ever improve
    // on the previous baseline, never regress it.
    //
    // Prefers Turndown (a well-established, widely-used HTML-to-Markdown
    // library, loaded via manifest.json ahead of this file) over the
    // custom converter written for an earlier fix. Confirmed via direct
    // side-by-side testing against real conversation HTML that Turndown
    // handles at least one real edge case better (escaping text that looks
    // like a numbered-list marker but isn't one, preventing it from being
    // misread if the markdown is ever re-rendered) while matching on every
    // other tested case — genuinely more robust, not just "more official".
    // Three-layer fallback: Turndown, then the custom converter (in case
    // Turndown fails to load for any reason), then plain text — each layer
    // only used if the one before it is unavailable or throws.
    var seen = {};
    var parts = Array.from(els).map(function(el) {
      var plain = (el.innerText || el.textContent || '').trim();
      try {
        var md = '';
        if (typeof TurndownService !== 'undefined') {
          if (!window.__diaryTurndownInstance) {
            var svc = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
            if (typeof turndownPluginGfm !== 'undefined' && turndownPluginGfm.gfm) {
              svc.use(turndownPluginGfm.gfm);
            }
            // Same escape() override as buildGeminiPairedThread above —
            // see that comment for the full rationale. Kept in both
            // places since they share the same cached singleton, but this
            // guards against either code path creating the instance first.
            svc.escape = function(string) {
              return string
                .replace(/\\/g, '\\\\')
                .replace(/\*/g, '\\*')
                // NOTE: ^- bullet-escape rule removed — see the identical
                // comment on the other two Turndown instances for the
                // full rationale (DeepSeek citation-link corruption fix).
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
            // Same list-item paragraph-spacing fix as buildDomPairedThread
            // and buildGeminiPairedThread above — see that comment for the
            // full rationale.
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
            // See mistralRichTable's identical comment in the other two
            // Turndown instances above for the full rationale.
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
            });            svc.addRule('chatgptCitationPill', {
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
          // Pass the actual DOM node, NOT el.innerHTML as a string.
          // Confirmed root cause of "Gemini shows no markdown structure at
          // all": Turndown's RootNode() takes two completely different
          // code paths depending on input type — a string input goes
          // through htmlParser().parseFromString(), which relies on
          // DOMParser or document.implementation.createHTMLDocument(),
          // BOTH of which Gemini's Trusted Types CSP policy blocks
          // (confirmed via Chrome DevTools Issues panel: "This document
          // requires 'TrustedHTML' assignment. The action has been
          // blocked", reproducible in both Chrome and Opera, ruling out
          // browser-specific or session-state causes — this is driven by
          // Gemini's own server-side CSP header). A DOM-node input instead
          // takes the `input.cloneNode(true)` path, which never touches
          // either blocked API at all. Verified via direct simulation:
          // with both parsing mechanisms genuinely blocked, the string
          // input throws, while the node input converts a table and bold
          // text correctly, completely bypassing the restriction.
          md = window.__diaryTurndownInstance.turndown(el).trim();
        } else if (config.htmlToMarkdown) {
          md = config.htmlToMarkdown(el).trim();
        } else {
          md = htmlToMarkdown(el).trim();
        }
        if (md && md.length >= plain.length * 0.5) return md;
      } catch (e) {
        console.error('[Diary] Markdown conversion failed, falling back to plain text:', e);
      }
      return plain;
    }).filter(function(t) {
      var tooShort = t.length < 20;
      var key = t.slice(0, 50);
      var isDupe = !tooShort && !!seen[key];
      console.log('[Diary Sync DIAG] readDomResponse part: length', t.length, '| tooShort:', tooShort, '| duplicateKey:', isDupe, '| preview:', t.slice(0, 60));
      if (tooShort) return false;
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });

    if (!parts.length) return null;
    return cleanDomText(config.clean(parts.join('\n\n')));
  }

  function readLastPrompt() {
    var host = window.location.hostname;
    var config = DOM_SELECTORS[host];
    if (!config || !config.prompt) return null;
    var els = document.querySelectorAll(config.prompt);
    if (!els.length) return null;
    return (els[els.length - 1].innerText || els[els.length - 1].textContent || '').trim().slice(0, 500);
  }

  // Listen for AI response completion signal from background.js
  var _domSettleTimer = null;
  var _lastAICompleteTs = 0;

  // Shared image-URL filter for all three DOM-capture trigger sites below
  // (captureDomTurn, the settle-timer handler, and the poll handler).
  // NOTE: this used to be copy-pasted separately into each of the three —
  // confirmed live that's exactly why an earlier fix (excluding Gemini's
  // generic attachment-card icons and Maps-rating-star icons) only closed
  // one of three doors: it was applied to captureDomTurn's own inline
  // copy, but the other two sites kept their own, separate, unfixed
  // copies of the same logic, and Gemini's actual capture that day
  // happened to go through one of those. Extracting this into one shared
  // function means any future fix here only ever needs to happen once.
  function filterCapturedImageUrls(rawImgUrls) {
    return rawImgUrls.filter(function(src) {
      if (!src || !src.startsWith('http') || src.includes('svg')) return false;
      if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) return false;
      // Gemini's generic file-type icon on each attachment card
      // (drive-thirdparty.googleusercontent.com/32/type/...) and its
      // Maps/Places-style rating star icon — both confirmed live as
      // generic UI decoration being mistakenly captured as if they were
      // real, meaningful images from the conversation itself.
      if (src.includes('drive-thirdparty.googleusercontent.com/32/type/')) return false;
      if (src.includes('gstatic.com/gemini/maps/')) return false;
      return true;
    });
  }

  // Shared by all three DOM-capture trigger sites below — finds the
  // current turn's image URLs, combining config.response (the normal
  // answer container) with any provider-specific supplementary
  // locations, then applies the shared filter above. Confirmed live that
  // this same "find images within config.response" query used to be
  // separately duplicated across all three call sites (same class of
  // problem already found and consolidated once today for the FILTER
  // logic alone, via filterCapturedImageUrls itself) — extracted here
  // this time specifically so a future provider-specific addition, like
  // the Perplexity one below, only ever needs to happen in one place.
  //
  // NOTE: Perplexity confirmed live to render actual image-search
  // results in a dedicated carousel (data-testid="image-carousel-img")
  // that sits OUTSIDE the .prose answer container entirely — config.
  // response alone would never find these at all, which is why
  // Perplexity was capturing zero images even when a query explicitly
  // asked for them. This carousel query is intentionally NOT scoped to
  // just the latest turn (unlike config.response, which already takes
  // only the last matching element) — there's no confirmed way yet to
  // scope a carousel specifically to its own answer turn if a
  // conversation has more than one separate image search in it. A known,
  // accepted limitation for now: the existing exact-URL dedup already
  // prevents literal duplicate entries, but a later turn's capture could
  // still end up re-associated with an EARLIER turn's carousel images in
  // that specific, multi-image-search-in-one-conversation scenario.
  function getCurrentTurnImageUrls(config) {
    var imgUrls = [];
    if (config) {
      var els = document.querySelectorAll(config.response);
      var el = els[els.length - 1];
      if (el) {
        imgUrls = Array.from(el.querySelectorAll('img')).map(function(img) { return img.src || ''; });
      }
    }
    if (PROVIDER === 'perplexity') {
      var carouselImgs = document.querySelectorAll('[data-testid="image-carousel-img"] img');
      imgUrls = imgUrls.concat(Array.from(carouselImgs).map(function(img) { return img.src || ''; }));
    }
    return filterCapturedImageUrls(imgUrls);
  }

// Shared by all DOM-capture triggers (webRequest signal, window-property
  // poll, and the chatgpt.com MutationObserver) — reads the DOM, dedupes
  // against the last captured turn, and pushes into window.__diaryCapture.
  function captureDomTurn(logLabel) {
    var text = readDomResponse();
    if (!text || text.length <= 50) return;
    if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
    var turns = window.__diaryCapture.turns;
    var last = turns.length ? turns[turns.length - 1] : null;
    var tooSoon = last && (Date.now() - last.ts < 2000);
    // Also skip if the text is genuinely, byte-for-byte unchanged from
    // the last captured turn — confirmed live as a real, necessary fix,
    // not defensive-only: the `tooSoon` check above only ever guards a
    // short, fixed 2-second window, but ChatGPT's own MutationObserver
    // (the only capture trigger it has, given no reliable network
    // completion signal exists for it at all) watches the ENTIRE page
    // subtree and can genuinely fire again well after that window —
    // triggered by any DOM change at all, not necessarily a real,
    // new answer. Reproduced live: four separate, fully identical
    // duplicate turns (same text, same length) accumulated over one
    // long sync attempt, each one a separate, independent firing of
    // this same observer well more than 2 seconds apart each time.
    // refreshLatestDomCaptureForRetry() already had this same, correct
    // check for its own, similar "did this genuinely change" question;
    // this had never been an equivalent risk here before today, since
    // the retry window that gives this repeated-firing pattern time to
    // actually manifest didn't exist until today's own refactor
    // extended it substantially.
    var unchanged = last && last.text === text;
    if (!tooSoon && !unchanged) {
      var host = window.location.hostname;
      var config = DOM_SELECTORS[host];
      var imgUrls = getCurrentTurnImageUrls(config);
      // Tag with this turn's own position (how many turns already exist,
      // +1), NOT a live question count. Confirmed live: tagging from a
      // live/racing question count breaks if the user types a follow-up
      // question before this turn finishes being captured — the live
      // count can already show the NEXT question by the time THIS turn
      // gets tagged, causing both to be shown together before this turn's
      // content instead of properly interleaved. Turn position is immune
      // to this, since it only reflects how many answers have actually
      // been captured, never how many questions have merely been typed.
      turns.push({ text: text, url: canonicalUrl(), ts: Date.now(), images: imgUrls, promptCountAtCapture: turns.length + 1 });
      // Also populate the persistent prompt cache RIGHT NOW, at capture
      // time — not just at save time. Confirmed live: if this is only
      // ever called once, at save time, a question whose DOM node gets
      // recycled/overwritten before the save click (confirmed happening
      // on DeepSeek, the same category of recycling already confirmed
      // for Gemini) is never seen by the cache at all, since by then the
      // live query only shows whatever text currently occupies that node.
      // Calling it here too means each question gets cached at the
      // moment it's still genuinely on screen, before any later
      // recycling can lose it.
      try { getAllCapturedPrompts(); } catch(e) {}
      console.log('[Diary DOM]', logLabel || 'Captured:', text.slice(0, 80));
    }
    window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
      detail: { url: canonicalUrl() }
    }));
  }

  // Forces a fresh DOM re-read of the CURRENT, latest turn specifically —
  // for Sync's own retry loop, which calls performSaveToDiary() repeatedly
  // but, without this, would just keep re-reading whatever captureDomTurn()
  // last, passively pushed via its own trigger (a webRequest completion
  // signal, or — ChatGPT only — a reactive MutationObserver settling once).
  // Confirmed live as a real, reproduced bug on ChatGPT specifically: its
  // own observer settled on an incomplete render before the answer had
  // actually finished, and nothing ever re-checked the live DOM again —
  // ten retries just re-read that same frozen snapshot ten times.
  // Deliberately generalized to ANY DOM-based provider here, not gated to
  // ChatGPT — even a provider with a reliable, network-level completion
  // signal (AI_COMPLETION_PATTERNS) could plausibly fire that signal
  // before the DOM has visually finished rendering (streaming text still
  // typing out, an animation not yet settled), hitting an analogous
  // "captured too early" case via a different, earlier trigger. Safe to
  // call unconditionally on every retry: no-ops entirely if the text is
  // unchanged since the last read (nothing new to report), and REPLACES
  // (rather than appends to) the existing latest turn when it has changed
  // — an updated read of the same turn, not a separate, new one — so
  // repeated calls can never accumulate duplicate-content entries the way
  // naively calling captureDomTurn() on every retry would have.
  function refreshLatestDomCaptureForRetry() {
    console.log('[Diary Sync DIAG] refreshLatestDomCaptureForRetry() ENTERED');
    var text = readDomResponse();
    if (!text || text.length <= 50) {
      console.log('[Diary DOM] fresh retry capture SKIPPED — readDomResponse() returned', text ? ('only ' + text.length + ' chars') : 'nothing at all');
      return;
    }
    if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
    var turns = window.__diaryCapture.turns;
    var curUrl = canonicalUrl();
    var lastIdx = -1;
    for (var i = turns.length - 1; i >= 0; i--) {
      if (turns[i].url === curUrl || /\/new(\?|$)/.test(turns[i].url)) { lastIdx = i; break; }
    }
    if (lastIdx === -1) {
      var host = window.location.hostname;
      var config = DOM_SELECTORS[host];
      var imgUrls = getCurrentTurnImageUrls(config);
      turns.push({ text: text, url: curUrl, ts: Date.now(), images: imgUrls, promptCountAtCapture: turns.length + 1 });
      try { getAllCapturedPrompts(); } catch(e) {}
      console.log('[Diary DOM] fresh retry capture (first for this conversation):', text.slice(0, 80));
      return;
    }
    if (turns[lastIdx].text === text) return; // genuinely nothing new
    turns[lastIdx].text = text;
    turns[lastIdx].ts = Date.now();
    // Also refresh promptCountAtCapture to the CURRENT, full prompt count
    // — confirmed live as a real, genuine bug on DeepSeek without this:
    // readDomResponse() joins ALL response elements on the page into one
    // growing string, so this single turn's text can come to contain
    // several separate answers' worth of content over successive
    // retries, while its own promptCountAtCapture tag stayed frozen at
    // whatever it was when the turn was FIRST pushed. The interleaving
    // logic then associated only the earliest question with this
    // (now-expanded) turn, leaving later questions unclaimed — they got
    // appended as trailing "leftover" questions at the very end, after
    // their own answers, instead of correctly preceding them. Since this
    // turn's text is already the full, cumulative joined text at this
    // point, tagging it with the full, current prompt count is correct.
    try { turns[lastIdx].promptCountAtCapture = getAllCapturedPrompts().length; } catch(e) {}
    console.log('[Diary DOM] fresh retry capture (updated latest turn):', text.slice(0, 80));
  }

// ── ChatGPT: MutationObserver-based capture ────────────────────────────────
  // No network signal exists for ChatGPT (see DOM_SELECTORS comment above),
  // so unlike every other DOM provider, capture here is triggered by
  // watching the DOM directly for new assistant-turn sections appearing,
  // rather than a webRequest completion event.
  //
  // A fixed debounce after the last mutation is NOT sufficient — confirmed
  // live: on a long, table-heavy response, mutations paused (likely while
  // an image carousel's images were still loading over the network) long
  // enough for a fixed 3s timer to fire early, capturing a mid-render DOM
  // state: a truncated table, missing list items, and a raw unresolved
  // "image_group{...}" marker that only fully hydrates moments later.
  // Instead, poll until the extracted text is genuinely stable across
  // repeated checks AND contains no raw image_group/entity markers, with a
  // ceiling so a response that never fully settles still gets captured
  // eventually rather than waiting forever.
  if (window.location.hostname === 'chatgpt.com') {
    var _chatgptSettleTimer = null;
    var _chatgptLastText = null;
    var _chatgptStableCount = 0;
    var _chatgptWaitCount = 0;

    function _chatgptResetPoll() {
      _chatgptLastText = null;
      _chatgptStableCount = 0;
      _chatgptWaitCount = 0;
    }

    function _chatgptCheckStable() {
      // Direct, empirical timestamp logging — added specifically to
      // confirm or rule out background-tab timer throttling as the
      // actual cause of remaining slowness, rather than assuming it
      // from Chrome's general documentation alone. This poll is
      // requested at a fixed 2000ms interval; if throttling is genuinely
      // affecting it, the actual elapsed time between consecutive calls
      // (logged here directly) will measurably exceed that request.
      var _nowTs = Date.now();
      if (window.__chatgptLastCheckTs) {
        console.log('[Diary Sync DIAG] _chatgptCheckStable actual interval:', (_nowTs - window.__chatgptLastCheckTs), 'ms (requested: 2000ms)');
      }
      window.__chatgptLastCheckTs = _nowTs;
      var text = readDomResponse();
      var hasRawMarker = text && /image_group|entity[\uE000-\uF8FF\[]/.test(text);
      _chatgptWaitCount++;
      if (text && text === _chatgptLastText && !hasRawMarker) {
        _chatgptStableCount++;
        if (_chatgptStableCount >= 2) {
          captureDomTurn('ChatGPT captured:');
          _chatgptResetPoll();
          return;
        }
      } else {
        _chatgptLastText = text;
        _chatgptStableCount = 0;
      }
      if (_chatgptWaitCount > 15) {
        captureDomTurn('ChatGPT captured (timeout, may be incomplete):');
        _chatgptResetPoll();
        return;
      }
      _chatgptSettleTimer = setTimeout(_chatgptCheckStable, 2000);
    }

    var _chatgptObserver = new MutationObserver(function() {
      if (_chatgptSettleTimer) clearTimeout(_chatgptSettleTimer);
      _chatgptResetPoll();
      _chatgptSettleTimer = setTimeout(_chatgptCheckStable, 2000);
    });
    var _chatgptObserveTarget = document.getElementById('thread') || document.body;
    // characterData:true is essential — without it, in-place text updates
    // within existing nodes (as opposed to whole node insertion/removal)
    // never fire a mutation event, so the stability poll can wrongly
    // conclude the response is "done" while some list items are still
    // silently populating. Confirmed live: two list items ("Navigation",
    // "Weather") were missing from an otherwise-complete capture under the
    // childList-only config. characterData alone was STILL insufficient on
    // a later long-response test (confirmed via console: it captured via
    // the normal "stable" branch, not the timeout fallback, yet was still
    // missing content) — adding attributes:true to also catch
    // attribute-driven rendering changes (e.g. aria/data-state toggles used
    // to reveal already-present-but-hidden content).
    _chatgptObserver.observe(_chatgptObserveTarget, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  // Poll window.__diaryAIComplete as fallback for when postMessage is blocked by module context
  setInterval(function() {
    var sig = window.__diaryAIComplete;
    if (!sig || sig.ts === _lastAICompleteTs) return;
    _lastAICompleteTs = sig.ts;
    // Skip DOM read if interceptor already captured THIS specific signal —
    // not just "captured something recently". Confirmed live: the old
    // "within 5000ms of now" check treated ANY recent capture (even from
    // an entirely earlier, different turn) as a reason to skip, which
    // silently dropped every turn after the first whenever a response
    // completed within 5 seconds of the previous turn being stored — an
    // entirely normal occurrence under real use, not an edge case. This
    // was confirmed as the actual root cause of "only 1 turn ever
    // captured despite N real exchanges" on both DeepSeek and Mistral.
    // Fixed by comparing against THIS signal's own arrival time instead
    // of "now": only skip if a turn was already stored AT OR AFTER this
    // signal fired, which correctly identifies a genuine duplicate
    // without penalizing a legitimate new turn that simply happens to
    // follow soon after the previous one. Verified via direct simulation
    // of both scenarios before this fix.
    if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length > 0) {
      var lastTurn = window.__diaryCapture.turns[window.__diaryCapture.turns.length - 1];
      if (lastTurn.ts >= sig.ts) return; // interceptor already handled this exact signal
    }
    console.log('[Diary content] AI complete via window property');
    // NOTE: this used to capture a "promptCountAtSignalTime" snapshot here,
    // but that was still vulnerable to the same race condition as the
    // count computed at push-time — just captured slightly earlier.
    // Replaced with position-based tagging at the actual push site below
    // (turns.length + 1), which is immune to timing entirely.
    if (_domSettleTimer) clearTimeout(_domSettleTimer);
    _domSettleTimer = setTimeout(function() {
      var text = readDomResponse();
      if (text && text.length > 50) {
        if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
        var turns = window.__diaryCapture.turns;
        var last = turns.length ? turns[turns.length - 1] : null;
        var tooSoon = last && (Date.now() - last.ts < 2000);
        if (!tooSoon) {
          var turnText = text; // Full conversation snapshot from readDomResponse
          // Capture images from response DOM
          var host = window.location.hostname;
          var config = DOM_SELECTORS[host];
          var imgUrls = getCurrentTurnImageUrls(config);
          // Same position-based fix as captureDomTurn above — see that
          // comment for the full rationale. Not using
          // promptCountAtSignalTime (a still-racing snapshot, just taken
          // slightly earlier) here.
          turns.push({ text: turnText, url: canonicalUrl(), ts: Date.now(), images: imgUrls, promptCountAtCapture: turns.length + 1 });
          // See the identical comment on the first capture site above —
          // same cache-population fix, same rationale.
          try { getAllCapturedPrompts(); } catch(e) {}
          console.log('[Diary DOM] Captured:', text.slice(0, 80));
        }
        window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
          detail: { url: canonicalUrl() }
        }));
      }
    }, 3000);
  }, 500);
  window.addEventListener('message', function(event) {
    if (!event.data) return;
    if (event.data.type) console.log('[Diary content] message received:', event.data.type);
    if (event.data.type !== 'AI_RESPONSE_COMPLETE') return;
    var msg = event.data;
    var signalArrivalTime = Date.now();
    // Skip DOM read if interceptor already captured THIS specific signal —
    // see the identical comment on the other capture path above for the
    // full rationale (confirmed root cause of turns being silently
    // dropped after the first one). Captures its own arrival time here
    // (this message event has no equivalent built-in timestamp) and only
    // skips if a turn was already stored at or after that moment.
    if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length > 0) {
      var lastTurn = window.__diaryCapture.turns[window.__diaryCapture.turns.length - 1];
      if (lastTurn.ts >= signalArrivalTime) return;
    }
    // NOTE: this used to snapshot the prompt count HERE, at signal-arrival
    // time, instead of after the settle-poll delay — an earlier, partial
    // fix for the race where a question typed during that delay gets
    // incorrectly absorbed into the CURRENT turn's tag. That was an
    // improvement but not a complete fix: it's still vulnerable if the
    // user types the next question before THIS signal even arrives.
    // Confirmed live (both questions bunching at the top of a saved
    // entry). Replaced with position-based tagging at the actual push
    // site below (turns.length + 1) — immune to timing entirely, since it
    // never depends on a live question count at all.
    // Poll until readDomResponse() returns text LONGER than the last stored
    // Poll until readDomResponse() has genuinely SETTLED — two consecutive
    // reads returning the identical result — instead of requiring it to be
    // LONGER than the previously stored turn. Confirmed live this was a
    // real, more serious gap: Gemini can hit the same DOM node-recycling
    // behavior already confirmed for DeepSeek, where the total visible
    // content can legitimately stay flat or even shrink for a genuinely
    // NEW response, not just fail to grow — the old "must be longer" check
    // would then poll all 8 attempts, never see growth, and store NOTHING
    // for that turn at all (worse than DeepSeek's bug, which at least
    // stored something incomplete). Since the save-time logic already
    // merges every stored snapshot to recover full history (see the
    // DOM-providers save branch), the poll no longer needs to guarantee
    // growth — only that each snapshot it stores is a genuinely settled,
    // non-mid-render read. On ceiling timeout without settling, still
    // stores the last read (as long as it's not an exact duplicate of the
    // last stored turn) rather than discarding it — an unstable-but-real
    // read is still better than storing nothing.
    // Confirmed as a real, direct bug via live console evidence: settling
    // after just ONE matching consecutive read (no minimum elapsed time
    // at all) falsely concludes "done" during a genuine "thinking" pause
    // — confirmed live on Grok specifically, whose own "Worked for Xs"
    // reasoning phase can run well past 10+ seconds before any answer
    // text even starts rendering. Two 1-second-apart reads taken during
    // that pause are trivially identical (both seeing only the PREVIOUS
    // answers, since the newest one hasn't appeared in the DOM at all
    // yet), so the old check settled after only 2 total attempts,
    // permanently missing the newest turn — reproduced live: a real,
    // fully-thought-out 18-second answer was silently dropped entirely,
    // with the entry and its Forge-forked chat_session never even
    // learning it existed, which is also why Continue Conversation had
    // nothing to pick up for it. Scoped specifically to Grok and Mistral
    // — the two providers confirmed (via their own "Worked for Xs" /
    // "Thought for Xs" widget text, both stripped elsewhere in this
    // file) to genuinely have an extended reasoning phase before any
    // answer text renders at all — rather than applying this slowdown
    // universally to every provider, most of which stream directly with
    // no such delay and would otherwise wait out this longer window for
    // no reason.
    var hasThinkingPhase = (PROVIDER === 'grok' || PROVIDER === 'mistral');
    var MIN_SETTLE_ELAPSED_MS = hasThinkingPhase ? 10000 : 0;
    var DOM_POLL_CEILING = hasThinkingPhase ? 45 : 8;
    if (_domSettleTimer) clearTimeout(_domSettleTimer);
    var _domPollAttempts = 0;
    var _domLastRead = null;
    function _domPollCheck() {
      _domPollAttempts++;
      var text = readDomResponse();
      var elapsed = Date.now() - signalArrivalTime;
      var settled = text && text === _domLastRead && elapsed >= MIN_SETTLE_ELAPSED_MS;
      if (!settled && _domPollAttempts < DOM_POLL_CEILING) {
        _domLastRead = text;
        _domSettleTimer = setTimeout(_domPollCheck, 1000);
        return;
      }
      if (text && text.length > 50) {
        // Store in __diaryCapture.turns same as interceptor
        if (!window.__diaryCapture) window.__diaryCapture = { turns: [] };
        var turns = window.__diaryCapture.turns;
        var last = turns.length ? turns[turns.length - 1] : null;
        var tooSoon = last && (Date.now() - last.ts < 2000);
        var sameAsLast = last && text === last.text;
        if (!tooSoon && !sameAsLast) {
          var turnText = text; // Full conversation snapshot from readDomResponse
          // Capture images from response DOM
          var host = window.location.hostname;
          var config = DOM_SELECTORS[host];
          var imgUrls = getCurrentTurnImageUrls(config);
          // Same position-based fix as the other two capture sites — see
          // captureDomTurn's comment for the full rationale.
          turns.push({ text: turnText, url: canonicalUrl(), ts: Date.now(), images: imgUrls, promptCountAtCapture: turns.length + 1 });
          // See the identical comment on the first capture site above —
          // same cache-population fix, same rationale.
          try { getAllCapturedPrompts(); } catch(e) {}
          console.log('[Diary DOM] Captured (after', _domPollAttempts, 'attempt(s),', settled ? 'settled' : 'ceiling', '):', text.slice(0, 80));
        } else if (sameAsLast) {
          console.log('[Diary DOM] Settled read matched last stored turn exactly — genuinely nothing new, skipping');
        }
        window.dispatchEvent(new CustomEvent('__diaryInterceptorCapture', {
          detail: { url: canonicalUrl() }
        }));
      }
    }
    _domSettleTimer = setTimeout(_domPollCheck, 1000);
  });

    // Global helper: send message to background via isolated world and await response
  // Uses unique msgId to prevent cross-contamination between concurrent requests
  // Cache auth token globally when received - avoids race condition at save time
  var _cachedDiaryToken = null;
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === '__DIARY_AUTH_TOKEN__' && e.data.token) {
      _cachedDiaryToken = e.data.token;
    }
  });
  // Request token proactively on page load
  window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'GET_AUTH_TOKEN' } }, '*');

  // Listen for interceptor capture — show save button when response captured
    window.addEventListener('__diaryInterceptorCapture', function() {
      injectSaveDiaryButton('intercepted');
    });

    // Mistral and DeepSeek specifically: scan for an already-existing
    // conversation on page load, rather than waiting for a network
    // completion signal that will never fire for one. Confirmed live:
    // unlike every other provider here, whose webRequest URL patterns in
    // background.js are broad enough (matching an entire domain/path)
    // that simply loading an old conversation page incidentally
    // satisfies them anyway — via some unrelated request that domain
    // happens to make on load — Mistral's and DeepSeek's patterns are
    // deliberately narrow, anchored specifically to the exact endpoint
    // used only when generating a brand-new response
    // ('/api/chat$', '/api/v0/chat/completion'). That's correct and
    // intentional for THEIR OWN purpose (avoiding the kind of overly
    // broad, incidental-match risk the other providers accept), but it
    // means genuinely nothing fires at all when revisiting an existing,
    // already-finished conversation — confirmed live as a real, user-
    // visible inconsistency: six providers show the Save button
    // automatically on load, these two don't, until the person actually
    // types a new message. Deliberately NOT changed by broadening their
    // webRequest patterns to match the others' style, since that risks
    // reintroducing the same kind of duplicate/premature-capture issues
    // already hunted down elsewhere today — scoped narrowly to just
    // these two providers instead, reusing the same captureDomTurn()
    // used elsewhere rather than duplicating its logic.
    if (PROVIDER === 'mistral' || PROVIDER === 'deepseek') {
      setTimeout(function() {
        if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length > 0) return;
        captureDomTurn('existing conversation on page load');
      }, 2000);
    }

    // Watch for auth loading late — REMOVED. This called into
    // injectForgeBar(), which is itself already a deliberate no-op
    // ("Replaced by provider-dock.js" — see that function's own
    // comment), so this observer never did anything observable even
    // before this removal. Confirmed live as a genuine, real regression
    // from an earlier fix elsewhere in this file: BAR_ID/FORGE_URL/
    // injectForgeBar are declared inside the Forge Control Bar's own
    // bare block, which now correctly closes right after that block's
    // initial setup — but this code sat physically further down the
    // file, past that closing brace, so it lost access to those
    // block-scoped declarations and threw "BAR_ID is not defined" the
    // moment this MutationObserver's callback ever fired. Since the
    // call this genuinely guarded is already inert, removing the dead
    // reference outright is simpler and lower-risk than re-plumbing
    // scope just to keep calling a function that does nothing.

    // ── SPA navigation — re-inject bar when URL changes (claude.ai is a SPA) ──
    let _lastUrl = location.href;
    const navObserver = new MutationObserver(() => {
      if (location.href !== _lastUrl) {
        _lastUrl = location.href;
        // The BAR_ID/tryInjectBar re-injection branch that used to sit
        // here has been removed for the same reason as authObserver
        // above (same broken, block-scope reference; same underlying
        // no-op it was guarding) — the Mistral/DeepSeek re-scan logic
        // below is untouched and unrelated to any of that.
        // Mistral and DeepSeek specifically: re-run the same page-load
        // existing-content scan on SPA navigation to a different
        // conversation (e.g. clicking a different chat in the
        // provider's own sidebar) — confirmed live that the earlier,
        // one-time-on-script-load version of this scan only ever fires
        // once, on a genuine full page navigation (like clicking "Open
        // original" from a diary entry), never on this kind of in-page,
        // no-reload navigation, since the content script itself never
        // re-executes for it at all. Also explicitly resets
        // __diaryCapture — otherwise the PREVIOUS conversation's already-
        // captured turns would still be sitting there (this variable is
        // page-level and doesn't clear itself on SPA navigation), and
        // the existing "skip if turns.length > 0" guard on the scan
        // would incorrectly treat that stale data as if the NEW
        // conversation already had content, skipping the new scan
        // entirely — and worse, risking that old conversation's text
        // ending up mixed into a save of the new one. Also removes any
        // existing Save button immediately, since it would otherwise
        // keep pointing at the conversation that's no longer showing.
        if (PROVIDER === 'mistral' || PROVIDER === 'deepseek') {
          window.__diaryCapture = { turns: [] };
          var existingBtn = document.getElementById('diary-save-btn');
          if (existingBtn) existingBtn.remove();
          setTimeout(function() {
            if (window.__diaryCapture && window.__diaryCapture.turns && window.__diaryCapture.turns.length > 0) return;
            captureDomTurn('existing conversation after SPA navigation');
          }, 2000);
        }
      }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });
  // ^ No brace here — this used to be the accidental, misplaced closing
  // brace for the Forge Control Bar's own bare block (see the matching
  // note near that block's real opening/closing, earlier in the file).
  // Removed as part of the same fix: adding the correct closing brace at
  // its genuine, intended location meant this one became redundant and
  // would otherwise have prematurely closed the top-level IIFE itself.

})()