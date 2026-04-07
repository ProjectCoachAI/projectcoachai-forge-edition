// Forge Extension — Main World Script
// Creates the DOM bridge element that both worlds can access
// Runs in MAIN world via executeScript with world:'MAIN'

(function() {
  if (document.getElementById('__forge_bridge__')) return;
  
  const bridge = document.createElement('div');
  bridge.id = '__forge_bridge__';
  bridge.setAttribute('data-ext-present', '1');
  bridge.setAttribute('data-ext-version', '1.0.0');
  bridge.style.display = 'none';
  document.documentElement.appendChild(bridge);

  // Signal presence via postMessage
  window.postMessage({ type: '__FORGE_EXT_PRESENT__', version: '1.0.0' }, '*');
  
  // Listen for CHECK requests
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (event.data?.type === '__FORGE_EXT_CHECK__') {
      window.postMessage({ type: '__FORGE_EXT_PRESENT__', version: '1.0.0' }, '*');
    }
    // Forward __FORGE_EXT_DATA__ from isolated world response back to page listeners
  });

  console.log('[Forge] Main world bridge created');
})();
