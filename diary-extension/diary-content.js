// Diary Extension — Content Script v2
// Provider-registry architecture: each provider is isolated.
// Shared utilities (htmlToMarkdown, cleanText) are defaults that providers can override.
// Bug fix to a default = one edit, reaches all. Behaviour change = provider override only.

(function () {
  'use strict';

  if (window.__diaryProviderActive) return;
  window.__diaryProviderActive = true;

  // ── Provider detection ─────────────────────────────────────────────────────
  const h = window.location.hostname;
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

  if (!PROVIDER_ID) return;
  const PROVIDER = PROVIDER_ID; // alias for legacy infrastructure

  // ── Shared utilities (defaults) ────────────────────────────────────────────

  function defaultHtmlToMarkdown(el) {
    if (!el) return '';
    function walk(node, ctx) {
      if (node.nodeType === 3) return node.textContent || '';
      if (node.nodeType !== 1) return '';
      const tag = (node.tagName || '').toLowerCase();
      if (['script','style','noscript','svg'].includes(tag)) return '';
      const childParts = Array.from(node.childNodes).map(c => walk(c, ctx));
      const children = childParts.reduce(function(acc, cur) {
        if (!acc || !cur) return acc + cur;
        // Add space between word characters to prevent concatenation
        if (/\w$/.test(acc) && /^\w/.test(cur)) return acc + ' ' + cur;
        return acc + cur;
      }, '');
      const trimmed = children.trim();
      if (!trimmed && tag !== 'br' && tag !== 'hr') return '';
      if (tag === 'br') return '\n';
      if (tag === 'p') return ctx === 'li' ? trimmed + ' ' : '\n' + trimmed + '\n';
      if (tag === 'h1') return '\n# ' + trimmed + '\n';
      if (tag === 'h2') return '\n## ' + trimmed + '\n';
      if (tag === 'h3') return '\n### ' + trimmed + '\n';
      if (['h4','h5','h6'].includes(tag)) return '\n#### ' + trimmed + '\n';
      if (tag === 'strong' || tag === 'b') return '**' + trimmed + '**';
      if (tag === 'em' || tag === 'i') return '_' + trimmed + '_';
      if (tag === 'code' && ctx !== 'pre') return '`' + trimmed + '`';
      if (tag === 'pre') return '\n```\n' + (node.textContent||'').trim() + '\n```\n';
      if (tag === 'ul' || tag === 'ol') {
        const isOl = tag === 'ol';
        const items = [];
        Array.from(node.children)
          .filter(c => c.tagName && c.tagName.toLowerCase() === 'li')
          .forEach(function(li) {
            const liText = (li.textContent || '').trim();
            if (!liText || !/\w/.test(liText)) return;
            const parts = [];
            let nestedMd = '';
            li.childNodes.forEach(function(c) {
              if (c.nodeType === 3) { const t = (c.textContent||'').trim(); if (t) parts.push(t); }
              else if (c.nodeType === 1) {
                const ct = (c.tagName||'').toLowerCase();
                if (ct === 'br') return;
                if (ct === 'ul' || ct === 'ol') {
                  const nested = walk(c, ctx).trim();
                  if (nested) nestedMd += nested.split('\n').map(function(l) { return '   ' + l; }).join('\n') + '\n';
                  return;
                }
                const t = walk(c, 'li').trim(); if (t) parts.push(t);
              }
            });
            const text = parts.join(' ').trim();
            if (text && /\w/.test(text)) {
              const bullet = isOl ? (items.length+1)+'. '+text : '* '+text;
              items.push(nestedMd ? bullet + '\n' + nestedMd.trimEnd() : bullet);
            }
          });
        return items.length ? '\n' + items.join('\n') + '\n' : '';
      }
      if (tag === 'li') return trimmed;
      if (tag === 'a') return trimmed;
      if (tag === 'img') return '';
      if (tag === 'table') {
        const rows = Array.from(node.querySelectorAll('tr'));
        return rows.length ? '\n' + rows.map(r => '| ' + Array.from(r.querySelectorAll('td,th')).map(c => c.textContent.trim()).join(' | ') + ' |').join('\n') + '\n' : '';
      }
      if (tag === 'hr') return '\n---\n';
      if (tag === 'blockquote') return trimmed ? '\n> ' + trimmed.replace(/\n/g,'\n> ') + '\n' : '';
      return children;
    }
    let md = walk(el, '');
    // Remove empty bullet lines and blank lines between bullets
    const lines = md.split('\n');
    const result = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (/^[*\-]\s*$/.test(t) || /^\d+\.\s*$/.test(t)) continue;
      if (t === '') {
        const prev = result.length > 0 ? result[result.length-1].trim() : '';
        const next = i+1 < lines.length ? lines[i+1].trim() : '';
        if (/^[*\-]\s+/.test(prev) || /^\d+\.\s+/.test(prev) ||
            /^[*\-]\s+/.test(next) || /^\d+\.\s+/.test(next)) continue;
      }
      result.push(lines[i]);
    }
    let mdOut = result.join('\n').replace(/\n{3,}/g,'\n\n').trim();
    // Fix bold-then-space-colon: "**Word** :" -> "**Word**:"
    mdOut = mdOut.replace(/\*\*([^*]+?)\*\* :/g, '**$1**:');
    // Fix plain word-then-space-colon in bullet lines
    mdOut = mdOut.replace(/^(\*\s+.+?) :/gm, '$1:');
    return mdOut;
  }

  function defaultClean(text) {
    if (!text) return text;
    text = text.replace(/\s*Wikipedia(?:\+\d+)?/g, '');
    text = text.replace(/\s*[a-z][a-z0-9]*(?:\.[a-z]{2,6})+\+\d+/gi, '');
    text = text.replace(/\s*\d{1,2}:\d{2}(?:am|pm)\s*/gi, ' ');
    text = text.replace(/\s*\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\s*/g, ' ');
    text = text.replace(/^\d+\n/, '');
    text = text.replace(/^You said\s*/i, '');
    text = text.replace(/Click to open side panel for more information/gi, '');
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return text;
  }

  function defaultGetPrompt() {
    const PROMPT_SELECTORS = PROVIDER_CONFIG.promptSelectors || [];
    for (const sel of PROMPT_SELECTORS) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          let t = els[els.length - 1].textContent.trim().slice(0, 500);
          t = t.replace(/^You said\s*/i,'').replace(/^User:\s*/i,'').replace(/^Human:\s*/i,'').trim();
          // Strip timestamps anywhere in the prompt text
          t = t.replace(/\s*\d{1,2}:\d{2}(?:am|pm)/gi, '').trim();
          // Strip Mistral spaced "W o r k e d" prefix
          t = t.replace(/^(?:W\s*o\s*r\s*k\s*e\s*d\s*f\s*o\s*r)\s*\d+\s*s\s*/gi, '').trim();
          if (t && t.length > 2 && !/^\d{1,2}:\d{2}/.test(t) && !/^\d{1,2} \w+ \d{4}/.test(t)) return t;
        }
      } catch(_) {}
    }
    return '';
  }

  // placeholder — defaultGetResponse defined after registry

// ── Provider registry ──────────────────────────────────────────────────────
  // Each provider: responseSelectors, promptSelectors, clean (optional override),
  // htmlToMarkdown (optional override), useShadow, reloadUrl (for Phase 3)

  const registry = {

    claude: {
      responseSelectors: [
        '.font-claude-response',
        '.standard-markdown',
        '.font-claude-response-body',
        '[data-is-streaming="false"] .contents',
        '[data-testid="assistant-message"]',
        '[class*="AssistantMessage"]',
        '[data-role="assistant"]'
      ],
      promptSelectors: [
        '[data-testid="user-message"]',
        '.human-bubble',
        '[class*="HumanTurn"]'
      ],
      reloadType: 'url' // Option B — open metadata.url directly
    },

    chatgpt: {
      responseSelectors: [
        '[data-message-author-role="assistant"] .markdown',
        '[data-message-author-role="assistant"] .prose',
        '[data-message-author-role="assistant"]'
      ],
      promptSelectors: [
        '[data-message-author-role="user"] .whitespace-pre-wrap',
        '[data-message-author-role="user"]'
      ],
      clean: function(text) {
        text = defaultClean(text);
        text = text.replace(/\s*Wikipedia(?:\+\d+)?/g, '');
        // Remove stray rating numbers (e.g. "5" from star ratings)
        text = text.replace(/^\d+\s*$/gm, '');
        return text;
      },
      reloadType: 'url' // Option B
    },

    gemini: {
      responseSelectors: [
        '.markdown-main-panel.md-content',
        '.markdown-main-panel',
        '.md-content',
        'message-content .markdown',
        'structured-content-container .markdown',
        'model-response .markdown'
      ],
      promptSelectors: [
        '[class*="query-text"]',
        '.user-query-text',
        '.user-query-bubble-with-background'
      ],
      clean: function(text) {
        text = defaultClean(text);
        text = text.replace(/Click to open side panel for more information/gi, '');
        text = text.replace(/Source: [^\n]+/g, '');
        // Remove citation labels
        text = text.replace(/\s+(?:Britannica|Transfermarkt|Sports Illustrated|Study\.com|YouTube|Wikipedia|Forbes|BBC|CNN|Reuters|AP|ESPN|Sky Sports|Guardian|Times|Mail|Mirror|Telegraph|Independent|Statista|IMDb|OneFootball|Voronoi|Topend Sports|Atlas\.co|worldrivers\.net)(?:\+\s*\d+)?/gi, '');
        text = text.replace(/\s*[A-Z][a-zA-Z]*\.(?:com|org|net|edu|co\.uk)(?:\+\s*\d+)?/g, '');
        // Remove "Yes/No" button text captured at end of response
        text = text.replace(/\n(?:Yes|No|Sure|Okay|OK)\s*$/m, '');
        return text;
      },
      reloadType: 'url' // Option B
    },

    perplexity: {
      responseSelectors: [
        '.prose.dark\\:prose-invert',
        '[class*="prose"][class*="dark:prose-invert"]',
        '[class*="prose"]'
      ],
      promptSelectors: [
        '[class*="query"]',
        '[data-testid="query-text"]',
        '[class*="queryText"]'
      ],
      // Override getResponse: concatenate all top-level prose blocks
      getResponse: function() {
        var els = Array.from(document.querySelectorAll('[class*="prose"]'));
        if (!els.length) return '';
        var topLevel = els.filter(function(el) {
          return !els.some(function(other) { return other !== el && other.contains(el); });
        });
        if (!topLevel.length) return '';
        // Check total text — must be substantial before capturing
        var totalLen = topLevel.reduce(function(s, el) { return s + (el.textContent||'').trim().length; }, 0);
        if (totalLen < 300) return '';
        // Skip image caption elements
        var blocks = topLevel.filter(function(el) {
          var t = (el.textContent || '').trim();
          return t.length > 0 && !/^Map showing/i.test(t);
        });
        var htmlFn = PROVIDER_CONFIG.htmlToMarkdown || defaultHtmlToMarkdown;
        var parts = blocks.map(function(el) {
          return htmlFn(el);
        }).filter(function(t) { return t && t.trim().length > 0; });
        if (!parts.length) return '';
        var combined = parts.join('\n\n');
        var cleanFn = PROVIDER_CONFIG.clean || defaultClean;
        return cleanFn(combined); // cleanFn calls defaultClean internally
      },
      // Override htmlToMarkdown: walk DOM skipping citation/superscript nodes
      htmlToMarkdown: function(el) {
        if (!el) return '';
        function walk(node) {
          if (node.nodeType === 3) return node.textContent || '';
          if (node.nodeType !== 1) return '';
          var tag = (node.tagName || '').toLowerCase();
          var cls = (node.className || '').toString();
          var attr = node.getAttribute ? (node.getAttribute('data-pplx-citation') !== null) : false;
          // Skip citation spans, superscripts, and nbsp spacers
          if (tag === 'sup') return '';
          if (attr) return '';
          if (cls.includes('citation')) return '';
          // For everything else, use defaultHtmlToMarkdown logic inline
          if (['script','style','noscript','svg'].includes(tag)) return '';
          // Handle table BEFORE computing children to avoid text node contamination
          if (tag === 'table') {
            var rows = Array.from(node.querySelectorAll('tr'));
            if (!rows.length) return '';
            var tLines = rows.map(function(r) {
              return '| ' + Array.from(r.querySelectorAll('td,th')).map(function(c) { return c.textContent.trim(); }).join(' | ') + ' |';
            });
            // Insert separator after first row (header)
            if (tLines.length > 1) tLines.splice(1, 0, '| ' + Array.from(rows[0].querySelectorAll('td,th')).map(function() { return '---'; }).join(' | ') + ' |');
            return '\n' + tLines.join('\n') + '\n';
          }
          if (tag === 'thead' || tag === 'tbody' || tag === 'tr' || tag === 'td' || tag === 'th') return ''; // handled by table
          // If this node contains a table, skip plain text nodes (they duplicate table content)
          var hasTable = node.querySelector && !!node.querySelector('table');
          var childNodes = Array.from(node.childNodes);
          var children = childNodes.map(function(c) {
            // Skip text nodes and non-table inline elements when a table is present
            if (hasTable && c.nodeType === 3) return '';
            return walk(c);
          }).join('');
          var trimmed = children.trim();
          if (!trimmed && tag !== 'br' && tag !== 'hr') return '';
          if (tag === 'br') return '\n';
          if (tag === 'p') return '\n' + trimmed + '\n';
          if (tag === 'h1') return '\n# ' + trimmed + '\n';
          if (tag === 'h2') return '\n## ' + trimmed + '\n';
          if (tag === 'h3') return '\n### ' + trimmed + '\n';
          if (['h4','h5','h6'].includes(tag)) return '\n#### ' + trimmed + '\n';
          if (tag === 'strong' || tag === 'b') return '**' + trimmed + '**';
          if (tag === 'em' || tag === 'i') return '_' + trimmed + '_';
          if (tag === 'ul' || tag === 'ol') {
            var isOl = tag === 'ol';
            var items = Array.from(node.children)
              .filter(function(c) { return (c.tagName||'').toLowerCase() === 'li'; })
              .map(function(li) {
                var parts = [];
                li.childNodes.forEach(function(c) {
                  if (c.nodeType === 3) { var t = c.textContent.trim(); if (t) parts.push(t); }
                  else if (c.nodeType === 1 && !['ul','ol'].includes((c.tagName||'').toLowerCase())) {
                    var t = walk(c).trim(); if (t) parts.push(t);
                  }
                });
                return parts.join(' ').trim();
              }).filter(function(t) { return t && /\w/.test(t); });
            return items.length ? '\n' + items.map(function(t, i) { return isOl ? (i+1)+'. '+t : '* '+t; }).join('\n') + '\n' : '';
          }
          if (tag === 'li') return trimmed;
          if (tag === 'a') return trimmed;
          if (tag === 'img') return '';
          return children;
        }
        var md = walk(el);
        var lines = md.split('\n').filter(function(l) { return !/^[*\-]\s*$/.test(l.trim()); });
        return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
      },
      clean: function(text) {
        // Strip tab-separated lines BEFORE defaultClean collapses tabs to spaces
        text = text.replace(/^[^\n]*\t[^\n]*$/gm, '');
        text = text.replace(/\n{3,}/g, '\n\n');
        text = defaultClean(text);
        // Remove duplicate pipe table headers
        text = text.replace(/(\|[^\n]+\|)\n(\|[-| ]+\|\n)?\1/g, '$1');
        // Remove Perplexity citation domain labels
        text = text.replace(/\b(?:en\.wikipedia|cnn|britannica|worldatlas|visitcorpusc|worldrivers|atlas\.co|webuildvalue|onefootball|transfermarkt|flytrippers|mastt|structurecity|jalopnik|scribd|nebulite|aldianews|bbc|reuters|apnews|theguardian|nytimes|forbes)[a-z0-9.]*(?:\+\d+)?/gi, '');
        text = text.replace(/([a-zA-Z\d])([a-z]{2,}\.(?:org|com|net|edu|gov|io))/g, '$1');
        text = text.replace(/\+\d+(?=\s|[.,]|$)/g, '');
        text = text.replace(/([.!?,])([a-z][a-z0-9]{3,})(?=\s|$)/g, '$1');
        text = text.replace(/[ \t]+/g, ' ').trim();
        return text;
      },
      reloadType: 'inject' // Option A
    },

    deepseek: {
      // Override getPrompt: DeepSeek uses shadow DOM, query with queryAllDeep
      getPrompt: function() {
        var selectors = ['[class*="_9663006"]', '[class*="human-turn"]', '[class*="user-message"]', '[class*="fbb737a4"]'];
        for (var i = 0; i < selectors.length; i++) {
          try {
            var els = queryAllDeep(selectors[i]);
            if (els.length > 0) {
              var t = (els[els.length-1].textContent || '').trim();
              if (t && t.length > 2 && t.length < 500) return t;
            }
          } catch(_) {}
        }
        return '';
      },
      responseSelectors: [
        '[class*="ds-markdown"]',
        '[class*="markdown-body"]',
        '[class*="assistant"] [class*="markdown"]',
        '[class*="message-content"]',
        '[class*="message-assistant"]'
      ],
      promptSelectors: [
        '[class*="human-message"] [class*="markdown"]',
        '[class*="human-turn"] [class*="markdown"]',
        '[class*="user-message-text"]',
        '[class*="fad8d1a"]',
        '[class*="human-message"]'
      ],
      useShadow: true,
      // Override htmlToMarkdown to skip Mistral's thinking block and search source cards
      htmlToMarkdown: function(el) {
        if (!el) return '';
        var clone = el.cloneNode(true);
        try {
          // Remove muted/thinking containers
          clone.querySelectorAll('[class*="text-muted"], [class*="thinking"], [class*="chain-of-thought"]').forEach(function(n) { n.remove(); });
          // Remove web search source cards (bg-card border-default)
          clone.querySelectorAll('[class*="bg-card"][class*="border"]').forEach(function(n) { n.remove(); });
          // Remove timestamp elements
          clone.querySelectorAll('time, [class*="timestamp"]').forEach(function(n) { n.remove(); });
        } catch(_) {}
        return defaultHtmlToMarkdown(clone);
      },
      clean: function(text) {
        text = defaultClean(text);
        // Remove DeepSeek inline citation numbers like -1, -6, -1-2-6, " -1"
        text = text.replace(/([a-zA-Z\d\)])-\d+(?:-\d+)*/g, '$1');
        text = text.replace(/\s+-\d+(?:-\d+)*(?=\s|[.,;)]|$)/g, '');
        // Remove period+space before citation: ". -1" -> "."
        text = text.replace(/\.\s+-\d+(?:-\d+)*/g, '.');
        return text;
      },
      reloadType: 'inject' // Option A
    },

    grok: {
      // Submit-time capture: hook input before Grok clears it
      _lastPrompt: '',
      _hookInput: function() {
        var self = registry.grok;
        if (document.body.dataset.diaryGrokHooked) return;
        document.body.dataset.diaryGrokHooked = 'true';
        // Use capture phase on document to intercept before ProseMirror clears editor
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            var inp = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
            if (inp) {
              var t = (inp.value || inp.innerText || inp.textContent || '').replace(/^\n+|\n+$/g,'').trim();
              if (t && t.length > 2) self._lastPrompt = t;
            }
          }
        }, true); // capture phase
        document.addEventListener('click', function(e) {
          var btn = e.target.closest('button[type="submit"]');
          if (btn) {
            var inp = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
            if (inp) {
              var t = (inp.value || inp.innerText || inp.textContent || '').replace(/^\n+|\n+$/g,'').trim();
              if (t && t.length > 2) self._lastPrompt = t;
            }
          }
        }, true);
      },
      getPrompt: function() {
        registry.grok._hookInput();
        return registry.grok._lastPrompt || '';
      },

      responseSelectors: [
        '[class*="response-content"]',
        '[class*="assistant-message"] [class*="content"]',
        '[data-testid="response"]',
        '[class*="message-bubble"]:not([class*="user"])',
        '[class*="message"]:not([class*="user"]) [class*="content"]',
        '[class*="FollowUpSuggestions"]',
        'main [class*="prose"]'
      ],
      promptSelectors: [
        '[data-testid="userMessage"]',
        '[class*="UserMessage"] p',
        '[class*="user-query"] p',
        '[class*="human-turn"] p',
        '[class*="userMessage"]',
        '[class*="user-message"]'
      ],
      clean: function(text) {
        text = defaultClean(text);
        // Remove Grok thinking indicator
        text = text.replace(/^Thought for \d+s\s*/i, '');
        text = text.replace(/\s*Add to chat\s*$/i, '');
        // Remove Grok citation numbers like -1-2-6
        text = text.replace(/([a-zA-Z\d])-\d+(?:-\d+)*/g, '$1');
        // Remove zero-width characters (word joiner U+2060, zero-width space U+200B etc)
        text = text.replace(/[\u2060\u200B\u200C\u200D\uFEFF]/g, '');
        // Fix space before colon in all forms
        text = text.replace(/\*\*([^*]+?) \*\* :/g, '**$1:**');
        text = text.replace(/\*\*([^*]+?) :/g, '**$1:**');
        text = text.replace(/(\w+) :/g, '$1:');
        return text;
      },
      reloadType: 'inject' // Option A
    },

    mistral: {
      responseSelectors: [
        '[data-message-author-role="assistant"]',
        '[class*="prose"]',
        'main article'
      ],
      promptSelectors: [
        '[class*="UserMessage"]',
        '[class*="user-message"]',
        '[data-message-author-role="user"]'
      ],
      useShadow: true,
      // Override htmlToMarkdown to skip Mistral's thinking block and search source cards
      htmlToMarkdown: function(el) {
        if (!el) return '';
        var clone = el.cloneNode(true);
        try {
          // Remove muted/thinking containers
          clone.querySelectorAll('[class*="text-muted"], [class*="thinking"], [class*="chain-of-thought"]').forEach(function(n) { n.remove(); });
          // Remove web search source cards (bg-card border-default)
          clone.querySelectorAll('[class*="bg-card"][class*="border"]').forEach(function(n) { n.remove(); });
          // Remove timestamp elements
          clone.querySelectorAll('time, [class*="timestamp"]').forEach(function(n) { n.remove(); });
        } catch(_) {}
        return defaultHtmlToMarkdown(clone);
      },
      clean: function(text) {
        text = defaultClean(text);
        // Remove "W o r k e d f o r 3 s" — Mistral's spaced thinking indicator
        text = text.replace(/^(?:[Ww]\s*o\s*r\s*k\s*e\s*d\s*f\s*o\s*r|Workedfor|Worked for)\s*[\d.]+\s*s\s*/gi, '');
        // Remove thinking block: "Thought for Xs" + everything until the actual response
        text = text.replace(/^Thought for [\d.]+s[\s\S]*?(?=\n(?:[A-Z]|\d))/m, '');
        text = text.replace(/^Thought for [\d.]+s.*/mi, '');
        // Remove timestamps
        text = text.replace(/\s*\d{1,2}:\d{2}(?:am|pm)\s*/gi, ' ');
        text = text.replace(/\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2},?\s*/g, ' ');
        return text.trim();
      },
      reloadType: 'inject' // Option A
    },

    meta: {
      // Submit-time capture: hook input before Meta clears it
      _lastPrompt: '',
      _hookInput: function() {
        var self = registry.meta;
        if (document.body.dataset.diaryMetaHooked) return;
        document.body.dataset.diaryMetaHooked = 'true';
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            var inp = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
            if (inp) {
              var t = (inp.value || inp.innerText || inp.textContent || '').replace(/^\n+|\n+$/g,'').trim();
              if (t && t.length > 2) self._lastPrompt = t;
            }
          }
        }, true);
        document.addEventListener('click', function(e) {
          var btn = e.target.closest('button[type="submit"], button[aria-label*="Send"]');
          if (btn) {
            var inp = document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');
            if (inp) {
              var t = (inp.value || inp.innerText || inp.textContent || '').replace(/^\n+|\n+$/g,'').trim();
              if (t && t.length > 2) self._lastPrompt = t;
            }
          }
        }, true);
      },
      getPrompt: function() {
        registry.meta._hookInput();
        return registry.meta._lastPrompt || '';
      },
      responseSelectors: [
        '[data-testid="ai-response-message-content"]',
        '[class*="assistant-message-content"]',
        '[data-testid="ai-message"]',
        '[class*="AiMessage"] [class*="content"]',
        '[class*="assistant-message"]',
        '[class*="BotMessage"]'
      ],
      promptSelectors: [
        '[data-testid="user-message-text"]',
        '[class*="HumanMessage"] p',
        '[class*="human-message"] p',
        '[aria-label="Message"]',
        '[class*="HumanMessageBubble"]',
        '[class*="user-message-text"]',
        '[data-testid="user-message"]',
        '[class*="UserMessage"]'
      ],
      clean: function(text) {
        text = defaultClean(text);
        text = text.replace(/^Show thinking\s*/i, '');
        text = text.replace(/^Hide thinking\s*/i, '');
        // Remove Meta's suggested follow-up prompts
        text = text.replace(/\n(?:Zoom in|Show|Make it|Tell me|What|How|Why|Can you)[^\n]{5,}$/gm, '');
        text = text.replace(/\nSources\s*$/m, '');
        // Fix space before period
        text = text.replace(/ \./g, '.');
        // Fix numbered items that appear as "1.\n\n* content" -> "1. content"
        text = text.replace(/^(\d+\.)\s*\n+\s*\*/gm, '$1');
        return text;
      },
      reloadType: 'inject' // Option A
    }

  };

  const PROVIDER_CONFIG = registry[PROVIDER_ID];

  function isLikelyResponse(text) {
    if (text.length < 30) return false;
    if (/self\.__next_f|__next_f|\["\$"/.test(text)) return false;
    if (/@keyframes|@media|intercom/.test(text)) return false;
    const letters  = (text.match(/[a-zA-Z]/g) || []).length;
    const specials = (text.match(/[{}[\]:,"<>]/g) || []).length;
    if (specials > letters * 0.3 && text.length > 500) return false;
    return text.split(/\s+/).filter(w => w.length > 0).length >= 5;
  }

  let lastCaptured  = '';
  let debounceTimer = null;

  function defaultGetResponse() {
    // Allow provider to completely override response capture
    if (PROVIDER_CONFIG.getResponse) {
      try {
        const result = PROVIDER_CONFIG.getResponse();
        if (result && result.length > 30) return result;
      } catch(e) { console.warn('[Diary] getResponse override error:', e.message); }
    }
    const selectors = PROVIDER_CONFIG.responseSelectors || [];
    const useShadow = PROVIDER_CONFIG.useShadow || false;
    let bestText = '', bestEl = null;
    for (const sel of selectors) {
      try {
        const els = useShadow ? queryAllDeep(sel) : Array.from(document.querySelectorAll(sel));
        const SKIP = 'button, input, textarea, nav, header, [class*="input"]';
        const valid = els.filter(el => {
          if (!useShadow && el.closest(SKIP)) return false;
          return isLikelyResponse(el.textContent?.trim() || '');
        });
        if (!valid.length) continue;
        const topLevel = valid.filter(el => !valid.some(o => o !== el && o.contains(el)));
        const last = topLevel[topLevel.length - 1];
        const len = last.textContent?.trim().length || 0;
        if (len > bestText.length) { bestText = last.textContent.trim(); bestEl = last; }
      } catch(_) {}
    }
    if (bestEl) {
      const htmlToMd = PROVIDER_CONFIG.htmlToMarkdown || defaultHtmlToMarkdown;
      try {
        const md = htmlToMd(bestEl);
        if (md && md.length > 30) {
          const clean = PROVIDER_CONFIG.clean || defaultClean;
          return clean(md);
        }
      } catch(e) { console.warn('[Diary] htmlToMarkdown error:', e.message); }
    }
    const clean = PROVIDER_CONFIG.clean || defaultClean;
    return clean(bestText);
  }

  function captureFullThread() {
    try {
      var pSels = PROVIDER_CONFIG.promptSelectors || [];
      var rSels = PROVIDER_CONFIG.responseSelectors || [];
      var pEls = [];
      for (var i=0; i<pSels.length; i++) { var e=Array.from(document.querySelectorAll(pSels[i])); if(e.length){pEls=e;break;} }
      var rEls = [];
      for (var j=0; j<rSels.length; j++) { var e2=Array.from(document.querySelectorAll(rSels[j])).filter(function(el){return isLikelyResponse((el.textContent||'').trim());}); var tl=e2.filter(function(el){return !e2.some(function(o){return o!==el&&o.contains(el);});}); if(tl.length>rEls.length)rEls=tl; }
      var all=pEls.map(function(e){return{el:e,t:'Q'};}).concat(rEls.map(function(e){return{el:e,t:'A'};}));
      all.sort(function(a,b){var p=a.el.compareDocumentPosition(b.el);return(p&Node.DOCUMENT_POSITION_FOLLOWING)?-1:1;});
      var turns=[];
      for(var k=0;k<all.length;k++){var txt=(all[k].el.textContent||'').trim();if(txt.length>10)turns.push((all[k].t==='Q'?'Q: ':'A: ')+txt.slice(0,3000));}
      return turns.length>1?turns.join('

'):null;
    } catch(e){return null;}
  }

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
  
  function getBestResponse() {
    return defaultGetResponse();
  }



  

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
      // Perplexity: search result images
      if (PROVIDER === 'perplexity' && imgEls.length === 0) {
        imgEls = Array.from(document.querySelectorAll('img[src*="pplx"], img[class*="result"]'));
      }

      const imgUrls = imgEls.map(function(img) {
        return img.src || '';
      }).filter(function(src) {
        if (!src || src.startsWith('data:image/svg') || src.startsWith('data:image/gif') || src.startsWith('data:image/png;base64')) return false;
        if (src.includes('avatar') || src.includes('logo') || src.includes('icon')) return false;
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

    btn.onclick = async function() {
      btn.textContent = 'Saving...';
      btn.disabled = true;
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
          btn.textContent = 'Sign in to Diary first';
          btn.style.background = '#6B6B88';
          setTimeout(function() { btn.remove(); }, 3000);
          return;
        }

        var prompt = '';
        // Use provider getPrompt override if available
        if (PROVIDER_CONFIG.getPrompt) {
          try { prompt = PROVIDER_CONFIG.getPrompt() || ''; } catch(_) {}
        }
        // Otherwise use registry promptSelectors
        if (!prompt) {
          var pSelectors = PROVIDER_CONFIG.promptSelectors || ['[data-message-author-role="user"]', '[class*="user-message"]'];
          for (var ps = 0; ps < pSelectors.length; ps++) {
            try {
              var pEls = document.querySelectorAll(pSelectors[ps]);
              if (pEls.length > 0) {
                var pText = pEls[pEls.length - 1].textContent.trim().slice(0, 500);
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

        var images = [];
        if (['claude','chatgpt','gemini','perplexity'].includes(PROVIDER)) {
          images = await captureResponseImages(token);
          console.log('[Diary] captured', images.length, 'images');
        }
        var fullThread = captureFullThread();
        var contentToSave = (fullThread && fullThread.length > responseText.length) ? fullThread : responseText;
        var existingEntryId = null;
        try {
          var lR = await fetch('https://api.projectcoachai.com/api/diary/by-url?url='+encodeURIComponent(window.location.href),{headers:{'Authorization':'Bearer '+token}});
          var lD = await lR.json();
          if(lD.success&&lD.entry){existingEntryId=lD.entry.id;console.log('[Diary] updating entry:',existingEntryId);}
        } catch(e){}
        if(existingEntryId){
          try{
            var pR=await fetch('https://api.projectcoachai.com/api/diary/'+existingEntryId,{method:'PATCH',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({content:contentToSave,metadata:{url:window.location.href,images:images}})});
            var pD=await pR.json();
            if(pD.success){btn.textContent='Updated in Diary';btn.style.background='#22c55e';setTimeout(function(){btn.textContent='Save to Diary';btn.style.background='#F97316';btn.disabled=false;},2000);return;}
          }catch(e){console.warn('[Diary] PATCH failed:',e.message);}
        }
        var data = await new Promise(function(resolve, reject) {
          window.postMessage({ type: '__DIARY_TO_EXT__', payload: {
            type: 'SAVE_TO_DIARY',
            token: token,
            source: PROVIDER,
            prompt: prompt,
            content: contentToSave,
            url: window.location.href,
            images: images
          }}, '*');
          var handler = function(e) {
            if (e.data && e.data.type === '__DIARY_EXT_DATA__' && e.data.savedToDiary) {
              window.removeEventListener('message', handler);
              resolve({ success: e.data.success, error: e.data.error });
            }
          };
          window.addEventListener('message', handler);
          setTimeout(function() { reject(new Error('timeout')); }, 10000);
        });
        if (data.success) {
          btn.textContent = String.fromCharCode(10003) + ' Saved to Diary';
          btn.style.background = '#22c55e';
          setTimeout(function() { btn.remove(); }, 3000);
        } else {
          throw new Error(data.error || 'Save failed');
        }
      } catch(e) {
        btn.textContent = 'Failed — try again';
        btn.style.background = '#ef4444';
        btn.disabled = false;
        setTimeout(function() { btn.remove(); }, 4000);
      }
    };

    document.body.appendChild(btn);
    setTimeout(function() { if (btn.parentNode) btn.remove(); }, 30000);
  }

  function scheduleCapture(text) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (text && text !== lastCaptured && text.length > 30) {
        lastCaptured = text;
        console.log(`[Forge] ${PROVIDER}: captured ${text.length} chars`);
        window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'RESPONSE_CAPTURED', provider: PROVIDER, response: text, timestamp: Date.now(), sourceUrl: window.location.href, capturedAt: new Date().toISOString() }}, '*');
        injectSaveDiaryButton(text);
      }
    }, 3000); // 3s debounce — wait for response to stabilise
  }

  // Watch for DOM changes
  const observer = new MutationObserver(() => {
    const best = getBestResponse();
    if (best) scheduleCapture(best);
  });

  observer.observe(document.body, {
    childList: true, subtree: true, characterData: true
  });

  // Periodic fallback
  const interval = setInterval(() => {
    const best = getBestResponse();
    if (best) scheduleCapture(best);
  }, 4000);
  setTimeout(() => clearInterval(interval), 120000);

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
    if (message.type === 'GET_RESPONSE') {
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'RESPONSE_RESULT', response: lastCaptured, provider: PROVIDER }}, '*');
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

    // Watch for auth loading late
    const authObserver = new MutationObserver(() => {
      if (!document.getElementById(BAR_ID) && isAuthenticated()) injectForgeBar();
    });
    authObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => authObserver.disconnect(), 15000);

    // ── SPA navigation — re-inject bar when URL changes (claude.ai is a SPA) ──
    let _lastUrl = location.href;
    const navObserver = new MutationObserver(() => {
      if (location.href !== _lastUrl) {
        _lastUrl = location.href;
        if (!document.getElementById(BAR_ID)) {
          setTimeout(tryInjectBar, 800);
          setTimeout(tryInjectBar, 2500);
        }
      }
    });
    navObserver.observe(document.body, { childList: true, subtree: true });
  }

})()