// Diary Extension — Dock UI
(function() {
  if (document.getElementById('diary-dock')) return;
  if (window.__diaryForgeActive === true) return;

  var DIARY_URL = 'https://diary.projectcoachai.com';

  var style = document.createElement('style');
  style.textContent = [
    '#diary-dock{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:2147483640;display:flex;align-items:center;pointer-events:none;}',
    '#diary-tab{pointer-events:all;width:40px;height:76px;background:#1B2A4A;border:1.5px solid #C17D3C;border-right:none;border-radius:12px 0 0 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;box-shadow:-4px 0 20px rgba(193,125,60,0.2);user-select:none;transition:box-shadow 0.2s,background 0.2s;}',
    '#diary-tab:hover{background:#243A63;box-shadow:-4px 0 24px rgba(193,125,60,0.45);}',
    '#diary-mark{width:28px;height:28px;background:#C17D3C;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;font-family:Georgia,serif;pointer-events:none;box-shadow:0 2px 8px rgba(193,125,60,0.4);}',
    '#diary-toggle-btn{width:26px;height:26px;border-radius:5px;background:rgba(193,125,60,0.12);border:1px solid rgba(193,125,60,0.5);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;pointer-events:all;transition:background 0.15s;}',
    '#diary-toggle-btn:hover{background:rgba(193,125,60,0.35);}',
    '#diary-panel{pointer-events:all;position:absolute;right:40px;top:50%;transform:translateY(-50%) scaleX(0);transform-origin:right center;width:0;opacity:0;overflow:hidden;background:#fff;border:1px solid #D6D2C8;border-right:none;border-radius:12px 0 0 12px;box-shadow:-8px 0 32px rgba(27,42,74,0.12);transition:transform 0.25s,opacity 0.2s,width 0.25s;white-space:nowrap;}',
    '#diary-panel.open{width:auto;min-width:260px;opacity:1;transform:translateY(-50%) scaleX(1);overflow:visible;}',
    '#diary-panel-inner{padding:14px 16px;display:flex;flex-direction:column;gap:10px;font-family:system-ui,sans-serif;}',
    '.dp-header{display:flex;align-items:center;justify-content:space-between;}',
    '.dp-brand{font-size:15px;font-weight:600;color:#1B2A4A;font-family:Georgia,serif;}',
    '.dp-close{background:none;border:1px solid #D6D2C8;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:13px;color:#9E9890;display:flex;align-items:center;justify-content:center;}',
    '.dp-close:hover{border-color:#1B2A4A;color:#1B2A4A;}',
    '.dp-label{font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#9E9890;}',
    '.dp-actions{display:flex;gap:6px;}',
    '.dp-btn-primary{flex:1;padding:8px 12px;background:#1B2A4A;color:#F5F3EE;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;display:flex;align-items:center;justify-content:center;}',
    '.dp-btn-primary:hover{background:#243A63;}',
    '.dp-btn-secondary{padding:8px 12px;background:transparent;color:#6B6559;border:1px solid #D6D2C8;border-radius:8px;font-size:12px;cursor:pointer;text-decoration:none;white-space:nowrap;}',
    '.dp-btn-secondary:hover{border-color:#1B2A4A;color:#1B2A4A;}',
    '.dp-footer{font-size:10px;color:#9E9890;text-align:center;}',
    '.dp-footer a{color:#C17D3C;text-decoration:none;}',
    '.dp-context{display:none;border-top:1px solid #E8E4DE;padding-top:10px;margin-top:2px;max-width:280px;}',
    '.dp-context.visible{display:block;}',
    '.dp-context-q{font-size:11px;font-weight:700;color:#1B2A4A;margin-bottom:4px;white-space:normal;}',
    '.dp-context-text{font-size:11px;color:#6B6559;line-height:1.5;max-height:120px;overflow-y:auto;background:#F5F3EE;border-radius:6px;padding:8px;white-space:normal;}',
    '.dp-context-hint{font-size:10px;color:#9E9890;margin-top:6px;font-style:italic;white-space:normal;}',
    // Quick-search styles — replaces the old provider-switcher chips.
    // Getting a token, and the actual search request itself, both
    // route through the isolated-world script and background service
    // worker (this file runs in the page's own MAIN world per the
    // manifest, which has no chrome.* access, and its own fetch() calls
    // are subject to whatever CSP the current page enforces — confirmed
    // live via a real violation on Meta AI specifically, whose own
    // connect-src has no allowance for this extension's own API).
    '.dp-search-row{display:flex;gap:6px;}',
    '.dp-search-input{flex:1;min-width:0;padding:7px 10px;border:1px solid #D6D2C8;border-radius:8px;font-size:12px;font-family:system-ui,sans-serif;color:#1B2A4A;}',
    '.dp-search-input:focus{outline:none;border-color:#C17D3C;}',
    '.dp-search-btn{padding:7px 10px;background:#1B2A4A;color:#F5F3EE;border:none;border-radius:8px;font-size:12px;cursor:pointer;}',
    '.dp-search-btn:hover{background:#243A63;}',
    '.dp-search-btn:disabled{opacity:0.5;cursor:default;}',
    '.dp-search-results{display:none;max-height:220px;overflow-y:auto;}',
    '.dp-search-results.visible{display:flex;flex-direction:column;gap:6px;}',
    '.dp-search-result{display:block;padding:8px 9px;background:#fff;border:1px solid #D6D2C8;border-radius:8px;text-decoration:none;cursor:pointer;}',
    '.dp-search-result:hover{border-color:#C17D3C;}',
    '.dp-search-result-title{font-size:11px;font-weight:600;color:#1B2A4A;white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;}',
    '.dp-search-result-snippet{font-size:10px;color:#6B6559;margin-top:2px;white-space:normal;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4;}',
    '.dp-search-status{font-size:11px;color:#9E9890;padding:4px 2px;white-space:normal;}',
    '.dp-search-status.error{color:#C0392B;}'
  ].join('');
  document.head.appendChild(style);

  var isOpen = false;
  var autoClose;

  var dock = document.createElement('div');
  dock.id = 'diary-dock';

  // Tab — entire tab is clickable for panel
  var tab = document.createElement('div');
  tab.id = 'diary-tab';

  var mark = document.createElement('div');
  mark.id = 'diary-mark';
  mark.textContent = 'D';

  // Toggle button — opens My Diary directly
  var toggleBtn = document.createElement('div');
  toggleBtn.id = 'diary-toggle-btn';
  toggleBtn.title = 'My Diary';
  toggleBtn.textContent = '\uD83D\uDCD4';

  tab.appendChild(mark);
  tab.appendChild(toggleBtn);

  var panel = document.createElement('div');
  panel.id = 'diary-panel';

  var inner = document.createElement('div');
  inner.id = 'diary-panel-inner';

  var hdr = document.createElement('div'); hdr.className = 'dp-header';
  var brand = document.createElement('div'); brand.className = 'dp-brand';
  brand.textContent = 'Diary.';
  var closeBtn = document.createElement('button'); closeBtn.className = 'dp-close';
  closeBtn.textContent = 'x';
  hdr.appendChild(brand); hdr.appendChild(closeBtn);

  var lbl = document.createElement('div'); lbl.className = 'dp-label';
  lbl.textContent = 'Search Diary';

  // Confirmed directly beforehand: /api/diary/search already exists,
  // already does real semantic search (Voyage embeddings, not just
  // keyword matching), already respects a person's own filters, and
  // already handles its own rate limiting (20/day free tier) — this
  // reuses that same, already-working endpoint and the same auth token
  // already stored for Sync, rather than building anything new
  // server-side. Search-on-submit only (Enter key or the button),
  // deliberately not search-as-you-type, since every dock search draws
  // from that same shared daily limit as searching within the full app.
  var searchRow = document.createElement('div'); searchRow.className = 'dp-search-row';
  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'dp-search-input';
  searchInput.placeholder = 'Search your diary…';
  var searchBtn = document.createElement('button');
  searchBtn.className = 'dp-search-btn';
  searchBtn.textContent = 'Go';
  searchRow.appendChild(searchInput);
  searchRow.appendChild(searchBtn);

  var searchResults = document.createElement('div');
  searchResults.className = 'dp-search-results';

  var actWrap = document.createElement('div'); actWrap.className = 'dp-actions';
  var diaryBtn = document.createElement('a');
  diaryBtn.href = DIARY_URL + '/index.html';
  diaryBtn.target = '_self';
  diaryBtn.className = 'dp-btn-primary';
  diaryBtn.textContent = 'Diary';
  var chatBtn = document.createElement('a');
  chatBtn.href = DIARY_URL + '/chat.html';
  chatBtn.target = '_self';
  chatBtn.className = 'dp-btn-secondary';
  chatBtn.textContent = 'Chat';
  actWrap.appendChild(diaryBtn);
  actWrap.appendChild(chatBtn);

  var ftr = document.createElement('div'); ftr.className = 'dp-footer';
  var ftrLink = document.createElement('a');
  ftrLink.href = DIARY_URL;
  ftrLink.target = '_self';
  ftrLink.textContent = 'diary.projectcoachai.com';
  ftr.appendChild(ftrLink);

  inner.appendChild(hdr);
  inner.appendChild(lbl);
  inner.appendChild(searchRow);
  inner.appendChild(searchResults);
  inner.appendChild(actWrap);
  inner.appendChild(ftr);
  panel.appendChild(inner);
  dock.appendChild(tab);
  dock.appendChild(panel);
  document.body.appendChild(dock);

  function openPanel() {
    isOpen = true;
    panel.classList.add('open');
    clearTimeout(autoClose);
    autoClose = setTimeout(function() { closePanel(); }, 6000);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove('open');
  }

  // Entire tab toggles panel EXCEPT the toggle button
  tab.addEventListener('click', function(e) {
    if (e.target === toggleBtn || toggleBtn.contains(e.target)) return;
    isOpen ? closePanel() : openPanel();
  });

  toggleBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    window.location.href = DIARY_URL + '/app.html';
  });

  closeBtn.addEventListener('click', function() { closePanel(); });


  panel.addEventListener('mouseenter', function() { clearTimeout(autoClose); });
  panel.addEventListener('mouseleave', function() {
    autoClose = setTimeout(function() { closePanel(); }, 2000);
  });

  // Confirmed directly before building this: this script runs in the
  // page's own MAIN world (per manifest.json), which has no chrome.*
  // access at all — only the isolated-world script does. Reuses the
  // exact same GET_AUTH_TOKEN message relay diary-content.js already
  // uses for Sync, rather than inventing a second way to reach the
  // same token. fetch() itself runs fine right here afterward, since
  // that's an ordinary web API available in any JS context, not
  // restricted to the isolated world the way chrome.* is.
  function getAuthToken() {
    return new Promise(function(resolve) {
      var timeout = setTimeout(function() {
        window.removeEventListener('message', handler);
        resolve(null);
      }, 2000);
      function handler(e) {
        if (e.source !== window) return;
        if (!e.data || e.data.type !== '__DIARY_AUTH_TOKEN__') return;
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve(e.data.token || null);
      }
      window.addEventListener('message', handler);
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'GET_AUTH_TOKEN' } }, '*');
    });
  }

  function renderSearchStatus(text, isError) {
    searchResults.innerHTML = '';
    searchResults.classList.add('visible');
    var status = document.createElement('div');
    status.className = 'dp-search-status' + (isError ? ' error' : '');
    status.textContent = text;
    searchResults.appendChild(status);
  }

  function renderSearchResults(entries) {
    searchResults.innerHTML = '';
    if (!entries.length) {
      renderSearchStatus('No matching entries found.', false);
      return;
    }
    searchResults.classList.add('visible');
    // Capped at 5 here — the panel is a quick-glance surface, not a
    // full results page; the full app (already linked below) is where
    // browsing every match belongs.
    entries.slice(0, 5).forEach(function(entry) {
      var item = document.createElement('a');
      item.className = 'dp-search-result';
      item.href = DIARY_URL + '/app.html?entryId=' + encodeURIComponent(entry.id);
      item.target = '_self';
      var title = document.createElement('div');
      title.className = 'dp-search-result-title';
      title.textContent = entry.title || entry.prompt || '(untitled entry)';
      item.appendChild(title);
      if (entry.snippet) {
        var snippet = document.createElement('div');
        snippet.className = 'dp-search-result-snippet';
        snippet.textContent = entry.snippet;
        item.appendChild(snippet);
      }
      searchResults.appendChild(item);
    });
  }

  // Confirmed as a real, direct fix for a real, reported bug: calling
  // fetch() directly from here (the page's own MAIN world) subjects
  // the request to the HOST PAGE's own Content Security Policy, not
  // this extension's own permissions — confirmed live via a real CSP
  // violation on Meta AI specifically, whose own connect-src has no
  // allowance for api.projectcoachai.com at all. Routes the actual
  // request through the background service worker instead (a separate,
  // privileged context never subject to any page's own CSP), same as
  // every other real backend call this extension already makes.
  function searchDiaryViaExtension(token, q) {
    return new Promise(function(resolve) {
      var timeout = setTimeout(function() {
        window.removeEventListener('message', handler);
        resolve({ ok: false, status: 0, body: { message: 'timeout' } });
      }, 10000);
      function handler(e) {
        if (e.source !== window) return;
        if (!e.data || e.data.type !== '__DIARY_SEARCH_RESULT__') return;
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve({ ok: e.data.ok, status: e.data.status, body: e.data.body });
      }
      window.addEventListener('message', handler);
      window.postMessage({ type: '__DIARY_TO_EXT__', payload: { type: 'DIARY_SEARCH', token: token, q: q } }, '*');
    });
  }

  async function runDockSearch() {
    var q = searchInput.value.trim();
    if (q.length < 2) {
      searchResults.classList.remove('visible');
      searchResults.innerHTML = '';
      return;
    }
    searchBtn.disabled = true;
    searchInput.disabled = true;
    renderSearchStatus('Searching…', false);
    try {
      var token = await getAuthToken();
      if (!token) {
        renderSearchStatus('Sign in to Diary to search.', true);
        return;
      }
      var result = await searchDiaryViaExtension(token, q);
      var data = result.body || {};
      if (result.status === 402) {
        renderSearchStatus(data.message || 'Search limit reached. Upgrade to Pro for unlimited searches.', true);
      } else if (result.ok && data.success) {
        renderSearchResults(data.entries || []);
      } else {
        renderSearchStatus('Search failed. Please try again.', true);
      }
    } catch (_e) {
      renderSearchStatus('Search failed. Please check your connection.', true);
    } finally {
      searchBtn.disabled = false;
      searchInput.disabled = false;
    }
  }

  searchBtn.addEventListener('click', function(e) { e.stopPropagation(); runDockSearch(); });
  searchInput.addEventListener('click', function(e) { e.stopPropagation(); });
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.stopPropagation(); runDockSearch(); }
  });

})();
