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
 * Usage:   DiaryExt.check({ banner: true, headline: '...', message: '...' })
 *          resolves to { supported: boolean, installed: boolean }
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
    var headline = opts.headline || 'Save any AI conversation in one click.';
    var message = opts.message ||
      ('Add the Forge Diary extension to ' + name + ' to save from ChatGPT, Claude, Gemini and more, and to keep entries in sync.');

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
    text.appendChild(document.createTextNode(' ' + message));
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
    if (!result.installed && opts.banner && !wasDismissed()) showBanner(opts);
    return result;
  }

  window.DiaryExt = { check: check, dismissBanner: dismissBanner };
})();
