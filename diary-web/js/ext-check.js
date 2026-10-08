/* Diary extension discovery — shared by the landing page (index.html) and
 * Chat with AI (chat.html). app.html carries its own equivalent copy.
 *
 * A user who never installed the Forge Diary browser extension otherwise
 * has no hint that it exists. This asks the extension a harmless question
 * (the same CHECK_TAB_OPEN the Sync button uses, with a probe address that
 * can't match a real tab). Any reply at all means it is installed and
 * enabled. No reply from either known ID means it isn't, and a dismissible
 * banner is shown.
 *
 * Usage:   DiaryExt.check({ banner: true })   // dismissible banner
 *          DiaryExt.check({ gate: true })     // centered window, for pages
 *                                             // that are useless without it
 *          resolves to { supported: boolean, installed: boolean }
 *          DiaryExt.showGate() re-opens the window (e.g. when a blocked
 *          link is clicked after the window was closed).
 *          opts.onInstalled: function called once if the extension shows up
 *          later (see watchForInstall) — no page refresh needed.
 *
 * Dismissal is remembered under the same key app.html uses, so "Not now" on
 * any Diary page hides the banner on all of them (same browser).
 */
(function () {
  'use strict';

  var STORE_URL = 'https://chromewebstore.google.com/detail/lkpnmbpcemiejokgobcodchlhcljkhic';
  // Chrome Web Store release first, then the unpacked/developer copy.
  var EXT_IDS = ['lkpnmbpcemiejokgobcodchlhcljkhic', 'momenmcgdmceejapigodolpekonmaedd'];
  var DISMISS_KEY = 'diaryExtBannerDismissed';
  var PROBE = { type: 'CHECK_TAB_OPEN', conversationUrl: 'https://diary.projectcoachai.com/__extension_probe__' };

  function userAgent() { return navigator.userAgent || ''; }

  // Desktop Chromium browsers only. Chrome, Edge, Opera, Brave and the like
  // all carry "Chrome/"; Safari, Firefox and phones can't install it.
  function browserCanUseExtension() {
    var ua = userAgent();
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
    return /Chrome\//.test(ua);
  }

  function browserName() {
    var ua = userAgent();
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    return 'Chrome';
  }

  function askOne(extId) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(extId, PROBE, function (response) {
          if (chrome.runtime.lastError) { resolve(null); return; }
          resolve(response);
        });
      } catch (e) { resolve(null); }
    });
  }

  async function askAll() {
    if (typeof chrome === 'undefined' || !chrome.runtime) return false;
    for (var i = 0; i < EXT_IDS.length; i++) {
      var reply = await askOne(EXT_IDS[i]);
      if (reply) return true;
    }
    return false;
  }

  async function isInstalled() {
    if (await askAll()) return true;
    // One retry: the extension's background worker can be asleep on the very
    // first message after a browser start.
    await new Promise(function (r) { setTimeout(r, 1200); });
    return askAll();
  }

  function wasDismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function dismissBanner() {
    var el = document.getElementById('diaryExtBanner');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  function injectStyle() {
    if (document.getElementById('diaryExtBannerStyle')) return;
    var css =
      '.diary-ext-banner{background:#F8EDE0;border-bottom:0.5px solid #D6D2C8;width:100%;font-family:Inter,sans-serif;}' +
      '.diary-ext-inner{display:flex;align-items:center;gap:0.9rem;max-width:1100px;margin:0 auto;padding:0.6rem 2rem;font-size:13px;line-height:1.45;color:#4A4035;text-align:left;}' +
      '.diary-ext-text{flex:1;min-width:0;}' +
      '.diary-ext-text strong{color:#1B2A4A;font-weight:500;}' +
      '.diary-ext-hint{display:block;color:#9E9890;font-size:12px;margin-top:2px;}' +
      '.diary-ext-install{flex-shrink:0;font-size:12px;background:#C17D3C;color:#fff;padding:6px 14px;border-radius:5px;font-weight:500;transition:background 0.2s;white-space:nowrap;text-decoration:none;}' +
      '.diary-ext-install:hover{background:#A5682F;}' +
      '.diary-ext-dismiss{flex-shrink:0;background:none;border:none;cursor:pointer;font-family:Inter,sans-serif;font-size:12px;color:#9E9890;padding:4px 2px;}' +
      '.diary-ext-dismiss:hover{color:#1B2A4A;}' +
      '@media (max-width:640px){.diary-ext-inner{flex-wrap:wrap;padding:0.6rem 1rem;gap:0.5rem 0.8rem;}.diary-ext-text{flex-basis:100%;}}';
    var style = document.createElement('style');
    style.id = 'diaryExtBannerStyle';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function showBanner(opts) {
    if (document.getElementById('diaryExtBanner')) return;
    injectStyle();
    var name = browserName();
    var headline = opts.headline || 'Add the Forge Diary extension to save unlimited AI answers from Claude, ChatGPT, Gemini and more.';
    var message = opts.message || '';

    var wrap = document.createElement('div');
    wrap.className = 'diary-ext-banner';
    wrap.id = 'diaryExtBanner';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Browser extension');

    var inner = document.createElement('div');
    inner.className = 'diary-ext-inner';

    var text = document.createElement('div');
    text.className = 'diary-ext-text';
    var strong = document.createElement('strong');
    strong.textContent = headline;
    text.appendChild(strong);
    if (message) text.appendChild(document.createTextNode(' ' + message));
    if (name === 'Opera') {
      var hint = document.createElement('span');
      hint.className = 'diary-ext-hint';
      hint.textContent = 'Opera: if the page shows as unavailable, turn on Settings → Advanced → Allow installation of extensions from other stores, then try again.';
      text.appendChild(hint);
    }

    var install = document.createElement('a');
    install.className = 'diary-ext-install';
    install.href = STORE_URL;
    install.target = '_blank';
    install.rel = 'noopener';
    install.textContent = 'Add to ' + name;

    var dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'diary-ext-dismiss';
    dismiss.textContent = 'Not now';
    dismiss.addEventListener('click', dismissBanner);

    inner.appendChild(text);
    inner.appendChild(install);
    inner.appendChild(dismiss);
    wrap.appendChild(inner);

    // Normal flow directly under the page's nav bar; falls back to the top of the page.
    var nav = document.querySelector('.nav-wrap');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(wrap, nav.nextSibling);
    else document.body.insertBefore(wrap, document.body.firstChild);
  }

  function injectGateStyle() {
    if (document.getElementById('diaryExtGateStyle')) return;
    var css =
      '.diary-gate-overlay{position:fixed;inset:0;z-index:9999;background:rgba(27,42,74,0.55);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:1.5rem;font-family:Inter,sans-serif;}' +
      '.diary-gate-card{position:relative;background:#fff;border:0.5px solid #D6D2C8;border-radius:14px;width:100%;max-width:420px;padding:2.25rem 2rem 2rem;text-align:center;box-shadow:0 20px 60px rgba(27,42,74,0.25);}' +
      '.diary-gate-close{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:7px;border:0.5px solid #D6D2C8;background:#fff;color:#9E9890;font-size:16px;line-height:1;cursor:pointer;font-family:Inter,sans-serif;}' +
      '.diary-gate-close:hover{color:#1B2A4A;background:#F5F3EE;}' +
      '.diary-gate-icon{font-size:34px;display:block;margin-bottom:0.9rem;}' +
      '.diary-gate-title{font-family:Lora,serif;font-size:20px;font-weight:500;color:#1B2A4A;margin-bottom:0.4rem;}' +
      '.diary-gate-sub{font-size:14px;color:#6B6559;line-height:1.6;margin-bottom:1.5rem;}' +
      '.diary-gate-btn{display:inline-block;background:#C17D3C;color:#fff;padding:11px 26px;border-radius:7px;font-size:14px;font-weight:500;text-decoration:none;transition:background 0.2s;}' +
      '.diary-gate-btn:hover{background:#A5682F;}' +
      '.diary-gate-hint{font-size:12px;color:#9E9890;margin-top:1rem;line-height:1.5;}';
    var style = document.createElement('style');
    style.id = 'diaryExtGateStyle';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function closeGate() {
    var el = document.getElementById('diaryExtGate');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.removeEventListener('keydown', onGateKey);
  }

  function onGateKey(e) { if (e.key === 'Escape') closeGate(); }

  function showGate() {
    if (document.getElementById('diaryExtGate')) return;
    injectGateStyle();
    var name = browserName();

    var overlay = document.createElement('div');
    overlay.className = 'diary-gate-overlay';
    overlay.id = 'diaryExtGate';

    var card = document.createElement('div');
    card.className = 'diary-gate-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'diaryExtGateTitle');

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'diary-gate-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', closeGate);

    var icon = document.createElement('span');
    icon.className = 'diary-gate-icon';
    icon.textContent = '📖';

    var title = document.createElement('div');
    title.className = 'diary-gate-title';
    title.id = 'diaryExtGateTitle';
    title.textContent = 'Add the Forge Diary extension';

    var sub = document.createElement('div');
    sub.className = 'diary-gate-sub';
    sub.textContent = 'Save unlimited AI answers from Claude, ChatGPT, Gemini and more \u2014 then find any of them again, instantly, in one place.';

    var btn = document.createElement('a');
    btn.className = 'diary-gate-btn';
    btn.href = STORE_URL;
    btn.target = '_blank';
    btn.rel = 'noopener';
    btn.textContent = 'Add to ' + name;

    card.appendChild(close);
    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(btn);
    if (name === 'Opera') {
      var hint = document.createElement('div');
      hint.className = 'diary-gate-hint';
      hint.textContent = 'Opera: if the page shows as unavailable, turn on Settings → Advanced → Allow installation of extensions from other stores, then try again.';
      card.appendChild(hint);
    }
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onGateKey);
    try { btn.focus(); } catch (e) {}
  }

  // While the extension is missing, quietly re-ask every few seconds (and
  // right away when the tab regains focus). The moment it answers, the
  // window and banner disappear and opts.onInstalled runs, so the person
  // never has to refresh after installing. Gives up after 15 minutes.
  function watchForInstall(opts) {
    var stopped = false, busy = false, timer = null;
    var deadline = Date.now() + 15 * 60 * 1000;
    function stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    }
    async function tick() {
      if (stopped || busy) return;
      if (Date.now() > deadline) { stop(); return; }
      busy = true;
      var ok = false;
      try { ok = await askAll(); } catch (e) {}
      busy = false;
      if (!ok || stopped) return;
      stop();
      closeGate();
      var b = document.getElementById('diaryExtBanner');
      if (b && b.parentNode) b.parentNode.removeChild(b);
      try { if (typeof opts.onInstalled === 'function') opts.onInstalled(); } catch (e) {}
    }
    function onVisible() { if (!document.hidden) tick(); }
    timer = setInterval(tick, 2500);
    document.addEventListener('visibilitychange', onVisible);
  }

  async function check(opts) {
    opts = opts || {};
    var result = { supported: browserCanUseExtension(), installed: false };
    if (!result.supported) return result;
    try {
      result.installed = await isInstalled();
    } catch (e) {
      // Discovery is a nicety. If the check itself breaks, assume installed:
      // never nag on an unknown, and never break the page.
      result.installed = true;
      return result;
    }
    if (!result.installed) {
      if (opts.gate) showGate();
      else if (opts.banner && !wasDismissed()) showBanner(opts);
      if (opts.gate || opts.banner || opts.onInstalled) watchForInstall(opts);
    }
    return result;
  }

  window.DiaryExt = { check: check, dismissBanner: dismissBanner, showGate: showGate };
})();
