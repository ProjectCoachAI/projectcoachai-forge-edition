// Diary Extension — Forge-installed flag (content script, ISOLATED world,
// document_start, AI provider pages only).
//
// The dock (diary-dock.js) stays out of the way when the separate Forge
// extension is active, because Forge shows its own bar on these pages. Until
// now the background worker pushed that answer into every page through the
// "webNavigation" permission, which browsers describe to the user as
// "Read your browsing history". This does the same job without it: the page
// asks the background worker (which pings Forge exactly as before), and the
// answer is written onto the page's <html> element, where the dock — running
// later, in the page's own world — reads it.
//
// Values of data-diary-forge-active: "1" Forge is active, "0" it is not.
// Absent means the answer hasn't arrived yet; the dock waits briefly for it.
(function () {
  var ATTR = 'data-diary-forge-active';
  var root = document.documentElement;
  if (!root) return;

  function setFlag(active) {
    try { root.setAttribute(ATTR, active === true ? '1' : '0'); } catch (e) {}
  }

  try {
    // Reply comes back as its own message (not via sendResponse), the same
    // pattern the extension's other background requests already use.
    chrome.runtime.onMessage.addListener(function (msg) {
      if (msg && msg.type === 'FORGE_ACTIVE_RESULT') setFlag(msg.active);
    });
    chrome.runtime.sendMessage({ type: 'GET_FORGE_ACTIVE' }, function () {
      void chrome.runtime.lastError;
    });
  } catch (e) {
    setFlag(false);
  }

  // Safety net: if the background never answers (worker unavailable), settle
  // on "not active" so the dock still appears rather than waiting forever.
  setTimeout(function () {
    if (!root.hasAttribute(ATTR)) setFlag(false);
  }, 1500);
})();
