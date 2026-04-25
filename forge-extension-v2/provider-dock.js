// Forge Extension — Provider Page Dock
// Injected into Claude, ChatGPT, Gemini, Mistral, DeepSeek, Perplexity, Grok
// Provides the Forge Quick Switch dock UI on all AI provider pages
(function() {
  'use strict';

  // Prevent double-injection
  if (document.getElementById('forge-dock')) return;

  /* ── INJECT CSS ── */
  const style = document.createElement('style');
  style.id = 'forge-dock-styles';
  style.textContent = '\n/* ============================================================\n   HOST PAGE SIMULATION\n   Simulates a generic AI chat page (Claude / ChatGPT / Gemini)\n   so the dock can be seen in context\n   ============================================================ */\n*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }\n\nbody {\n  font-family: \'DM Sans\', system-ui, sans-serif;\n  background: #0a0a0f;\n  color: #e8e8f0;\n  min-height: 100vh;\n  overflow-x: hidden;\n}\n\n/* Fake host page header */\n.host-header {\n  position: fixed;\n  top: 0; left: 0; right: 0;\n  height: 56px;\n  background: #1a1a22;\n  border-bottom: 1px solid rgba(255,255,255,.08);\n  display: flex;\n  align-items: center;\n  padding: 0 20px;\n  gap: 12px;\n  z-index: 100;\n}\n.host-logo { font-size: 18px; font-weight: 600; color: #e8e8f0; }\n.host-logo span { color: #a78bfa; }\n.host-nav { display: flex; gap: 8px; margin-left: auto; }\n.host-nav-item { font-size: 13px; color: #9090a8; padding: 6px 12px; border-radius: 6px; cursor: pointer; }\n.host-nav-item:hover { background: rgba(255,255,255,.06); color: #e8e8f0; }\n\n/* Fake chat area */\n.host-content {\n  margin-top: 56px;\n  max-width: 720px;\n  margin-left: auto;\n  margin-right: auto;\n  padding: 48px 24px 200px;\n}\n.host-message {\n  display: flex;\n  gap: 14px;\n  margin-bottom: 28px;\n}\n.host-avatar {\n  width: 32px; height: 32px;\n  border-radius: 50%;\n  flex-shrink: 0;\n  display: flex; align-items: center; justify-content: center;\n  font-size: 14px;\n}\n.host-avatar.ai { background: #2d2d3a; color: #a78bfa; }\n.host-avatar.user { background: #1e3a5f; color: #60a5fa; }\n.host-bubble {\n  background: #14141e;\n  border: 1px solid rgba(255,255,255,.06);\n  border-radius: 12px;\n  padding: 14px 18px;\n  font-size: 14px;\n  color: #c8c8d8;\n  line-height: 1.65;\n  max-width: 580px;\n}\n.host-bubble p + p { margin-top: 10px; }\n.host-input-area {\n  position: fixed;\n  bottom: 0; left: 0; right: 0;\n  background: linear-gradient(to top, #0a0a0f 60%, transparent);\n  padding: 20px 24px 28px;\n  display: flex;\n  justify-content: center;\n}\n.host-input {\n  max-width: 720px;\n  width: 100%;\n  background: #16161f;\n  border: 1px solid rgba(255,255,255,.12);\n  border-radius: 14px;\n  padding: 14px 18px;\n  font-size: 14px;\n  color: #9090a8;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n/* Demo controls */\n.demo-controls {\n  position: fixed;\n  bottom: 90px;\n  left: 20px;\n  background: rgba(20,20,30,.95);\n  border: 1px solid rgba(255,255,255,.1);\n  border-radius: 12px;\n  padding: 16px;\n  font-size: 12px;\n  color: #9090a8;\n  z-index: 10000;\n  width: 200px;\n}\n.demo-controls h4 { color: #e8e8f0; font-size: 11px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }\n.demo-btn {\n  display: block;\n  width: 100%;\n  padding: 8px 12px;\n  background: rgba(249,115,22,.12);\n  border: 1px solid rgba(249,115,22,.3);\n  border-radius: 8px;\n  color: #f97316;\n  font-size: 12px;\n  font-weight: 500;\n  cursor: pointer;\n  text-align: center;\n  margin-bottom: 6px;\n  transition: all .2s;\n  font-family: inherit;\n}\n.demo-btn:hover { background: rgba(249,115,22,.22); }\n.demo-btn.active { background: rgba(249,115,22,.25); border-color: rgba(249,115,22,.6); }\n.demo-sep { height: 1px; background: rgba(255,255,255,.06); margin: 10px 0; }\n.demo-label { font-size: 10px; color: #5c5c72; margin-bottom: 4px; }\n\n\n/* ============================================================\n   FORGE EXTENSION DOCK\n   ============================================================\n   IMPLEMENTATION NOTES FOR EXTENSION DEVELOPERS:\n   \n   1. Inject a <div id="forge-dock"> into document.body\n   2. Append the contents of #forge-dock-styles as a <style> tag\n      into the shadow DOM or directly to <head>\n   3. The dock uses position:fixed with high z-index (2147483640)\n      so it sits above all host page content on every host\n   4. All class names are prefixed with "fgd-" to avoid collision\n      with host page CSS\n   5. Uses CSS custom properties scoped to #forge-dock only —\n      never bleeds into host page styles\n   6. No framework dependencies — pure HTML/CSS/JS\n   7. Works identically on Chrome, Edge, Opera, Safari, Firefox\n      (uses only standard CSS and vanilla JS)\n   8. Auto-collapse timeout: 2400ms after last interaction\n   9. The dock respects prefers-reduced-motion\n   10. Shadow DOM version: wrap everything in attachShadow({mode:\'open\'})\n       for maximum isolation — recommended for production\n   ============================================================ */\n\n#forge-dock {\n  /* Viewport anchor — always visible, never scrolls */\n  position: fixed;\n  right: 0;\n  top: 50%;\n  transform: translateY(-50%);\n  z-index: 2147483640; /* Max safe z-index, above most host UIs */\n\n  /* Scoped design tokens — won\'t affect host page */\n  --fgd-orange: #f97316;\n  --fgd-orange-dim: rgba(249,115,22,0.12);\n  --fgd-orange-glow: rgba(249,115,22,0.25);\n  --fgd-orange-border: rgba(249,115,22,0.35);\n  --fgd-purple: #7c3aed;\n  --fgd-green: #22c55e;\n  --fgd-bg: rgba(11,11,18,0.97);\n  --fgd-bg-card: rgba(18,18,28,0.99);\n  --fgd-bg-chip: rgba(28,28,42,0.95);\n  --fgd-border: rgba(255,255,255,0.08);\n  --fgd-border-strong: rgba(255,255,255,0.14);\n  --fgd-text: #f0f0f8;\n  --fgd-text-dim: #8888a0;\n  --fgd-text-muted: #50506a;\n  --fgd-radius: 14px;\n  --fgd-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);\n\n  display: flex;\n  align-items: center;\n\n  /* Pointer events only on visible elements */\n  pointer-events: none;\n}\n\n/* ── COLLAPSED TAB ── */\n.fgd-tab {\n  pointer-events: all;\n  position: relative;\n  right: 0;\n  width: 40px;\n  height: 72px;\n  background: var(--fgd-bg-card);\n  border: 1px solid var(--fgd-border-strong);\n  border-right: none;\n  border-radius: var(--fgd-radius) 0 0 var(--fgd-radius);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  cursor: pointer;\n  transition: width .22s cubic-bezier(.4,0,.2,1),\n              background .2s,\n              border-color .2s,\n              box-shadow .2s;\n  box-shadow: var(--fgd-shadow);\n  overflow: hidden;\n  user-select: none;\n  -webkit-user-select: none;\n}\n\n.fgd-tab:hover {\n  width: 46px;\n  background: rgba(22,22,34,.99);\n  border-color: var(--fgd-orange-border);\n  box-shadow: var(--fgd-shadow), 0 0 0 1px var(--fgd-orange-border) inset;\n}\n\n/* The orange F mark */\n.fgd-mark {\n  width: 26px;\n  height: 26px;\n  background: linear-gradient(135deg, #f97316, #ea580c);\n  border-radius: 7px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-family: \'DM Sans\', system-ui, sans-serif;\n  font-weight: 700;\n  font-size: 15px;\n  color: white;\n  letter-spacing: -0.5px;\n  flex-shrink: 0;\n  transition: transform .2s;\n}\n\n.fgd-tab:hover .fgd-mark { transform: scale(1.06); }\n\n/* Active provider count badge */\n.fgd-count {\n  font-size: 10px;\n  font-weight: 700;\n  color: var(--fgd-orange);\n  line-height: 1;\n  font-family: \'DM Sans\', system-ui, sans-serif;\n}\n\n/* Expand arrow */\n.fgd-arrow {\n  position: absolute;\n  bottom: 8px;\n  font-size: 9px;\n  color: var(--fgd-text-muted);\n  transition: color .2s, transform .2s;\n  line-height: 1;\n}\n\n.fgd-tab:hover .fgd-arrow { color: var(--fgd-orange); transform: translateX(-2px); }\n\n\n/* ── EXPANDED PANEL ── */\n.fgd-panel {\n  pointer-events: all;\n  position: absolute;\n  right: 40px; /* sits flush against the tab */\n  top: 50%;\n  transform: translateY(-50%) scaleX(0);\n  transform-origin: right center;\n  width: 0;\n  opacity: 0;\n  overflow: hidden;\n  background: var(--fgd-bg-card);\n  border: 1px solid var(--fgd-border-strong);\n  border-right: none;\n  border-radius: var(--fgd-radius) 0 0 var(--fgd-radius);\n  box-shadow: var(--fgd-shadow);\n  transition: transform .28s cubic-bezier(.4,0,.2,1),\n              opacity .22s ease,\n              width .28s cubic-bezier(.4,0,.2,1);\n  white-space: nowrap;\n}\n\n/* Expanded state — toggled by JS class on #forge-dock */\n#forge-dock.fgd-open .fgd-panel {\n  width: auto;\n  min-width: 380px;\n  opacity: 1;\n  transform: translateY(-50%) scaleX(1);\n  overflow: visible;\n}\n\n#forge-dock.fgd-open .fgd-tab {\n  border-radius: 0 0 0 0; /* flush join */\n  border-left-color: transparent;\n  background: rgba(22,22,34,.99);\n  border-color: var(--fgd-orange-border);\n}\n\n/* Panel inner layout */\n.fgd-panel-inner {\n  padding: 16px 20px 14px;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  min-width: 380px;\n}\n\n/* Top row: branding + close */\n.fgd-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.fgd-brand {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.fgd-brand-name {\n  font-family: \'DM Sans\', system-ui, sans-serif;\n  font-size: 13px;\n  font-weight: 700;\n  color: var(--fgd-text);\n  letter-spacing: 0.3px;\n}\n\n.fgd-brand-sub {\n  font-size: 10px;\n  color: var(--fgd-text-muted);\n  letter-spacing: 0.3px;\n}\n\n.fgd-close {\n  width: 24px; height: 24px;\n  border-radius: 50%;\n  border: 1px solid var(--fgd-border);\n  background: transparent;\n  color: var(--fgd-text-muted);\n  font-size: 14px;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: all .18s;\n  font-family: inherit;\n  flex-shrink: 0;\n}\n\n.fgd-close:hover {\n  background: rgba(249,115,22,.12);\n  border-color: var(--fgd-orange-border);\n  color: var(--fgd-orange);\n}\n\n/* Session context line */\n.fgd-context {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  background: rgba(34,197,94,.07);\n  border: 1px solid rgba(34,197,94,.18);\n  border-radius: 8px;\n  padding: 5px 10px;\n  font-size: 11px;\n  color: #86efac;\n  line-height: 1.3;\n}\n\n.fgd-context-dot {\n  width: 6px; height: 6px;\n  border-radius: 50%;\n  background: var(--fgd-green);\n  flex-shrink: 0;\n  animation: fgd-pulse 2.4s ease-in-out infinite;\n}\n\n@keyframes fgd-pulse {\n  0%,100% { opacity:1; transform:scale(1); }\n  50% { opacity:.4; transform:scale(.7); }\n}\n\n/* Divider */\n.fgd-divider {\n  height: 1px;\n  background: var(--fgd-border);\n}\n\n/* Provider label row */\n.fgd-providers-label {\n  font-size: 9px;\n  font-weight: 700;\n  letter-spacing: 1.5px;\n  text-transform: uppercase;\n  color: var(--fgd-text-muted);\n  margin-bottom: 2px;\n}\n\n/* Provider chips — single horizontal row */\n.fgd-providers {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 6px;\n}\n\n.fgd-chip {\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  background: var(--fgd-bg-chip);\n  border: 1px solid var(--fgd-border-strong);\n  border-radius: 20px;\n  padding: 5px 10px 5px 7px;\n  font-size: 12px;\n  font-weight: 500;\n  color: var(--fgd-text);\n  cursor: pointer;\n  transition: all .18s;\n  user-select: none;\n  -webkit-user-select: none;\n  font-family: \'DM Sans\', system-ui, sans-serif;\n  text-decoration: none;\n}\n\n.fgd-chip:hover {\n  border-color: rgba(255,255,255,.24);\n  background: rgba(40,40,58,.98);\n  transform: translateY(-1px);\n}\n\n.fgd-chip.fgd-chip-active {\n  border-color: rgba(34,197,94,.3);\n  background: rgba(34,197,94,.06);\n}\n\n.fgd-chip-dot {\n  width: 7px; height: 7px;\n  border-radius: 50%;\n  flex-shrink: 0;\n}\n\n.fgd-chip-check {\n  font-size: 9px;\n  color: var(--fgd-green);\n  line-height: 1;\n  margin-left: 2px;\n}\n\n/* Provider dot colours — matching Forge brand */\n.fgd-dot-claude    { background: #f59e0b; }\n.fgd-dot-chatgpt   { background: #10b981; }\n.fgd-dot-gemini    { background: #3b82f6; }\n.fgd-dot-mistral   { background: #f59e0b; }\n.fgd-dot-deepseek  { background: #7c3aed; }\n.fgd-dot-perplexity{ background: #10b981; }\n.fgd-dot-grok      { background: #ec4899; }\n\n/* Action row */\n.fgd-actions {\n  display: flex;\n  gap: 8px;\n}\n\n.fgd-action-primary {\n  flex: 1;\n  padding: 9px 14px;\n  background: var(--fgd-orange);\n  color: white;\n  border: none;\n  border-radius: 9px;\n  font-size: 13px;\n  font-weight: 600;\n  cursor: pointer;\n  transition: opacity .18s, transform .18s;\n  font-family: \'DM Sans\', system-ui, sans-serif;\n  text-align: center;\n  text-decoration: none;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 5px;\n}\n\n.fgd-action-primary:hover { opacity: .88; transform: translateY(-1px); }\n\n.fgd-action-secondary {\n  padding: 9px 14px;\n  background: transparent;\n  color: var(--fgd-text-dim);\n  border: 1px solid var(--fgd-border-strong);\n  border-radius: 9px;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: all .18s;\n  font-family: \'DM Sans\', system-ui, sans-serif;\n  white-space: nowrap;\n}\n\n.fgd-action-secondary:hover {\n  border-color: rgba(255,255,255,.22);\n  color: var(--fgd-text);\n}\n\n/* Footer note */\n.fgd-footer {\n  font-size: 10px;\n  color: var(--fgd-text-muted);\n  text-align: center;\n  padding-top: 2px;\n}\n\n.fgd-footer a {\n  color: var(--fgd-orange);\n  text-decoration: none;\n}\n.fgd-footer a:hover { text-decoration: underline; }\n\n/* ── MOTION PREFERENCES ── */\n@media (prefers-reduced-motion: reduce) {\n  .fgd-panel,\n  .fgd-tab,\n  .fgd-mark,\n  .fgd-chip { transition: none; }\n  .fgd-context-dot { animation: none; }\n}\n\n/* ── STATE VARIANTS for demo ── */\n\n/* Variant: On a light-bg host (e.g. ChatGPT) */\n#forge-dock.fgd-light-host .fgd-tab,\n#forge-dock.fgd-light-host .fgd-panel {\n  background: rgba(255,255,255,0.97);\n  border-color: rgba(0,0,0,.1);\n  box-shadow: 0 8px 32px rgba(0,0,0,.15), 0 2px 8px rgba(0,0,0,.1);\n}\n#forge-dock.fgd-light-host .fgd-brand-name { color: #111; }\n#forge-dock.fgd-light-host .fgd-brand-sub { color: #888; }\n#forge-dock.fgd-light-host .fgd-text { color: #222; }\n#forge-dock.fgd-light-host .fgd-chip { background: #f4f4f8; border-color: #e0e0e8; color: #222; }\n#forge-dock.fgd-light-host .fgd-chip:hover { background: #eaeaf0; }\n#forge-dock.fgd-light-host .fgd-count { color: var(--fgd-orange); }\n#forge-dock.fgd-light-host .fgd-footer { color: #aaa; }\n#forge-dock.fgd-light-host .fgd-divider { background: rgba(0,0,0,.08); }\n#forge-dock.fgd-light-host .fgd-close { border-color: #ddd; color: #aaa; }\n#forge-dock.fgd-light-host .fgd-action-secondary { border-color: #ddd; color: #555; }\n#forge-dock.fgd-light-host .fgd-action-secondary:hover { border-color: #aaa; color: #222; }\n#forge-dock.fgd-light-host .fgd-providers-label { color: #aaa; }\n\n/* Arrow indicator on tab */\n.fgd-tab-hint {\n  position: absolute;\n  left: 50%;\n  transform: translateX(-50%);\n  bottom: 7px;\n  width: 20px;\n  height: 3px;\n  border-radius: 2px;\n  background: var(--fgd-orange-dim);\n  transition: background .2s;\n}\n\n.fgd-tab:hover .fgd-tab-hint { background: var(--fgd-orange-glow); }\n';
  document.head.appendChild(style);

  /* ── INJECT DOCK HTML (CSP-safe DOMParser) ── */
  function buildDock() {
    const PROVIDERS = [
      { id: 'claude',     url: 'https://claude.ai',             label: 'Claude',     dot: 'fgd-dot-claude',     active: true },
      { id: 'chatgpt',    url: 'https://chat.openai.com',       label: 'ChatGPT',    dot: 'fgd-dot-chatgpt',    active: false },
      { id: 'gemini',     url: 'https://gemini.google.com',     label: 'Gemini',     dot: 'fgd-dot-gemini',     active: false },
      { id: 'mistral',    url: 'https://chat.mistral.ai',       label: 'Mistral',    dot: 'fgd-dot-mistral',    active: false },
      { id: 'deepseek',   url: 'https://chat.deepseek.com',     label: 'DeepSeek',   dot: 'fgd-dot-deepseek',   active: false },
      { id: 'perplexity', url: 'https://www.perplexity.ai',     label: 'Perplexity', dot: 'fgd-dot-perplexity', active: false },
      { id: 'grok',       url: 'https://grok.com',              label: 'Grok',       dot: 'fgd-dot-grok',       active: false },
    ];
    // Detect current host
    const host = window.location.hostname;
    PROVIDERS.forEach(p => { p.active = host.includes(p.id) || (p.id === 'chatgpt' && host.includes('openai')); });

    const dock = document.createElement('div');
    dock.id = 'forge-dock';

    // Tab (collapsed pill)
    const tab = document.createElement('div');
    tab.className = 'fgd-tab'; tab.id = 'fgd-tab'; tab.role = 'button';
    tab.setAttribute('aria-label', 'Open Forge provider switcher');
    tab.setAttribute('aria-expanded', 'false'); tab.tabIndex = 0;
    const tabMark = document.createElement('div'); tabMark.className = 'fgd-mark'; tabMark.setAttribute('aria-hidden','true'); tabMark.textContent = 'F';
    const tabCount = document.createElement('div'); tabCount.className = 'fgd-count'; tabCount.setAttribute('aria-label','7 providers active'); tabCount.textContent = '7';
    const tabHint = document.createElement('div'); tabHint.className = 'fgd-tab-hint'; tabHint.setAttribute('aria-hidden','true');
    tab.appendChild(tabMark); tab.appendChild(tabCount); tab.appendChild(tabHint);
    dock.appendChild(tab);

    // Panel (expanded)
    const panel = document.createElement('div');
    panel.className = 'fgd-panel'; panel.id = 'fgd-panel'; panel.role = 'region';
    panel.setAttribute('aria-label', 'Forge Quick Switch'); panel.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('div'); inner.className = 'fgd-panel-inner';

    // Header
    const hdr = document.createElement('div'); hdr.className = 'fgd-header';
    const brand = document.createElement('div'); brand.className = 'fgd-brand';
    const mark = document.createElement('div'); mark.className = 'fgd-mark';
    mark.style.cssText = 'width:22px;height:22px;font-size:12px;border-radius:6px;'; mark.textContent = 'F';
    const brandText = document.createElement('div');
    const brandName = document.createElement('div'); brandName.className = 'fgd-brand-name'; brandName.textContent = 'Forge';
    const brandSub = document.createElement('div'); brandSub.className = 'fgd-brand-sub'; brandSub.textContent = 'Full Decision Workspace';
    brandText.appendChild(brandName); brandText.appendChild(brandSub);
    brand.appendChild(mark); brand.appendChild(brandText);
    const closeBtn = document.createElement('button'); closeBtn.className = 'fgd-close'; closeBtn.id = 'fgd-close';
    closeBtn.setAttribute('aria-label', 'Close Forge panel'); closeBtn.textContent = '×';
    hdr.appendChild(brand); hdr.appendChild(closeBtn); inner.appendChild(hdr);

    // Context
    const activeProv = PROVIDERS.find(p => p.active) || PROVIDERS[0];
    const ctx = document.createElement('div'); ctx.className = 'fgd-context';
    const dot = document.createElement('div'); dot.className = 'fgd-context-dot';
    const ctxSpan = document.createElement('span'); ctxSpan.textContent = 'Using ' + activeProv.label + ' · Switch provider below';
    ctx.appendChild(dot); ctx.appendChild(ctxSpan); inner.appendChild(ctx);

    // Divider
    inner.appendChild(Object.assign(document.createElement('div'), { className: 'fgd-divider' }));

    // Provider chips
    const provSection = document.createElement('div');
    const provLabel = document.createElement('div'); provLabel.className = 'fgd-providers-label'; provLabel.textContent = 'Switch to';
    const provList = document.createElement('div'); provList.className = 'fgd-providers'; provList.role = 'list';
    PROVIDERS.forEach(p => {
      const chip = document.createElement('a'); chip.className = 'fgd-chip' + (p.active ? ' fgd-chip-active' : '');
      chip.href = p.url; chip.role = 'listitem'; chip.title = p.active ? 'Currently active' : 'Switch to ' + p.label;
      chip.addEventListener('click', function(e) {
        e.preventDefault();
        if (p.active) return;
        try {
          chrome.runtime.sendMessage({ type: 'SWITCH_PROVIDER_TAB', url: p.url }, (res) => {
            if (!res || !res.switched) window.location.href = p.url;
          });
        } catch(_) { window.location.href = p.url; }
      });
      const chipDot = document.createElement('span'); chipDot.className = 'fgd-chip-dot ' + p.dot;
      chip.appendChild(chipDot);
      chip.appendChild(document.createTextNode(' ' + p.label));
      if (p.active) { const chk = document.createElement('span'); chk.className = 'fgd-chip-check'; chk.textContent = '✓'; chip.appendChild(chk); }
      provList.appendChild(chip);
    });
    provSection.appendChild(provLabel); provSection.appendChild(provList); inner.appendChild(provSection);

    // Divider
    inner.appendChild(Object.assign(document.createElement('div'), { className: 'fgd-divider' }));

    // Actions
    const actions = document.createElement('div'); actions.className = 'fgd-actions';
    const persp = document.createElement('a'); persp.className = 'fgd-action-primary';
    persp.href = 'https://forge-app-1u9.pages.dev'; persp.textContent = '✦ All Perspectives';
    persp.addEventListener('click', function(e) {
      e.preventDefault();
      try { chrome.runtime.sendMessage({ type: 'SWITCH_PROVIDER_TAB', url: 'https://forge-app-1u9.pages.dev' }, (res) => { if (!res || !res.switched) window.open('https://forge-app-1u9.pages.dev', '_blank'); }); }
      catch(_) { window.open('https://forge-app-1u9.pages.dev', '_blank'); }
    });
    const excel = document.createElement('button'); excel.className = 'fgd-action-secondary'; excel.id = 'fgd-excel-btn'; excel.textContent = '📊 Excel';
    excel.addEventListener('click', function() {
      try { chrome.runtime.sendMessage({ type: 'SWITCH_PROVIDER_TAB', url: 'https://forge-app-1u9.pages.dev/excel.html' }, (res) => { if (!res || !res.switched) window.open('https://forge-app-1u9.pages.dev/excel.html', '_blank'); }); }
      catch(_) { window.open('https://forge-app-1u9.pages.dev/excel.html', '_blank'); }
    });
    actions.appendChild(persp); actions.appendChild(excel); inner.appendChild(actions);

    // Footer
    const ftr = document.createElement('div'); ftr.className = 'fgd-footer'; ftr.textContent = 'Forge · ';
    const upg = document.createElement('a'); upg.href = 'https://forge-app-1u9.pages.dev/pricing.html'; upg.textContent = 'Upgrade';
    const sep = document.createTextNode(' · ');
    const hlp = document.createElement('a'); hlp.href = 'https://forge-app-1u9.pages.dev/help.html'; hlp.textContent = 'Help';
    [upg, hlp].forEach(a => a.addEventListener('click', e => { e.preventDefault(); window.open(a.href, '_blank'); }));
    ftr.appendChild(upg); ftr.appendChild(sep); ftr.appendChild(hlp); inner.appendChild(ftr);

    panel.appendChild(inner); dock.appendChild(panel);
    document.body.appendChild(dock);
    return dock;
  }
  buildDock();

  /* ── DOCK BEHAVIOUR ── */
  (function() {
  'use strict';

  /* ── CONFIG ── */
  const COLLAPSE_DELAY = 2400; // ms before auto-collapse after last interaction
  const FORGE_HOME = 'https://forge-app-1u9.pages.dev';

  /* ── ELEMENTS ── */
  const dock  = document.getElementById('forge-dock');
  const tab   = document.getElementById('fgd-tab');
  const panel = document.getElementById('fgd-panel');
  const close = document.getElementById('fgd-close');

  /* ── STATE ── */
  let isOpen    = false;
  let collapseTimer = null;
  let isDragging = false;
  let dragStartY = 0;
  let dockOffsetY = 0; // px from centre, positive = down
  let savedOffsetY = 0;
  // Load saved position from chrome.storage.local
  try { chrome.storage.local.get('fgd-offset-y', r => { if (r['fgd-offset-y']) applyOffset(parseInt(r['fgd-offset-y'], 10)); }); } catch(_) {}

  /* ── VERTICAL POSITION (user-draggable) ── */
  function applyOffset(offsetY) {
    // Clamp so dock never goes fully off-screen
    const maxOffset = (window.innerHeight / 2) - 60;
    offsetY = Math.max(-maxOffset, Math.min(maxOffset, offsetY));
    dockOffsetY = offsetY;

    // We use margin-top to shift from the CSS 50% centre point
    dock.style.marginTop = offsetY + 'px';
  }

  applyOffset(savedOffsetY);

  /* ── OPEN / CLOSE ── */
  function open() {
    isOpen = true;
    dock.classList.add('fgd-open');
    tab.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    clearCollapseTimer();
    scheduleCollapse();
  }

  function closePanel() {
    isOpen = false;
    dock.classList.remove('fgd-open');
    tab.setAttribute('aria-expanded', 'false');
    panel.setAttribute('aria-hidden', 'true');
    clearCollapseTimer();
  }

  function toggle() {
    if (isOpen) closePanel(); else open();
  }

  /* ── AUTO-COLLAPSE ── */
  function scheduleCollapse() {
    clearCollapseTimer();
    collapseTimer = setTimeout(() => {
      if (isOpen) closePanel();
    }, COLLAPSE_DELAY);
  }

  function clearCollapseTimer() {
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
  }

  function resetCollapseTimer() {
    if (isOpen) scheduleCollapse();
  }

  /* ── DRAG TO REPOSITION ──
     User can drag the tab vertically to set preferred dock position.
     Position is saved to localStorage and restored across sessions.
     Extension version: use chrome.storage.local instead of localStorage. */
  tab.addEventListener('pointerdown', function(e) {
    isDragging = false;
    dragStartY = e.clientY - dockOffsetY;

    function onMove(e) {
      const deltaY = e.clientY - dragStartY;
      if (Math.abs(deltaY - dockOffsetY) > 3) isDragging = true;
      applyOffset(deltaY);
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (isDragging) {
        // Save position
        try { chrome.storage.local.set({'fgd-offset-y': Math.round(dockOffsetY)}); } catch(_) { localStorage.setItem('fgd-offset-y', Math.round(dockOffsetY)); }
        // Don't toggle after drag
        setTimeout(() => { isDragging = false; }, 50);
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  /* ── CLICK EVENTS ── */
  tab.addEventListener('click', function() {
    if (!isDragging) toggle();
  });

  tab.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });

  close.addEventListener('click', function(e) {
    e.stopPropagation();
    closePanel();
  });

  /* Keep panel open while interacting */
  panel.addEventListener('pointerenter', clearCollapseTimer);
  panel.addEventListener('pointerleave', scheduleCollapse);
  panel.addEventListener('focusin', clearCollapseTimer);
  panel.addEventListener('focusout', scheduleCollapse);

  /* Excel button */
  const excelBtn = document.getElementById('fgd-excel-btn');
  if (excelBtn) {
    excelBtn.addEventListener('click', function() {
      window.open(FORGE_HOME + '/excel', '_blank', 'noopener');
    });
  }

  /* ── KEYBOARD ESCAPE ── */
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) closePanel();
  });

  /* ── HOST PAGE THEME DETECTION ──
     Detects light vs dark host background and applies fgd-light-host
     class for the appropriate dock colour scheme.
     In the extension, run this after injection. */
  function detectHostTheme() {
    const bg = window.getComputedStyle(document.body).backgroundColor;
    // Parse RGB
    const m = bg.match(/\d+/g);
    if (m && m.length >= 3) {
      const luminance = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]);
      if (luminance > 128) {
        dock.classList.add('fgd-light-host');
      } else {
        dock.classList.remove('fgd-light-host');
      }
    }
  }

  // Run on load and after any DOM mutation that might change background
  detectHostTheme();
  const themeObserver = new MutationObserver(detectHostTheme);
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });

  /* ── ACTIVE CHIP: detect current host and highlight correct chip ── */
  function highlightCurrentHost() {
    const host = window.location.hostname;
    const map = {
      'claude.ai': 'claude',
      'chat.openai.com': 'chatgpt',
      'chatgpt.com': 'chatgpt',
      'gemini.google.com': 'gemini',
      'chat.mistral.ai': 'mistral',
      'chat.deepseek.com': 'deepseek',
      'perplexity.ai': 'perplexity',
      'grok.com': 'grok',
      'x.com': 'grok'
    };
    const current = map[host];
    if (!current) return;

    // Update context line
    const ctx = dock.querySelector('.fgd-context span');
    const nameMap = {
      claude:'Claude', chatgpt:'ChatGPT', gemini:'Gemini',
      mistral:'Mistral', deepseek:'DeepSeek', perplexity:'Perplexity', grok:'Grok'
    };
    if (ctx) ctx.textContent = 'Using ' + nameMap[current] + ' · Quick Answer mode active';

    // Highlight chip
    dock.querySelectorAll('.fgd-chip').forEach(chip => {
      chip.classList.remove('fgd-chip-active');
      const dot = chip.querySelector('.fgd-chip-dot');
      if (dot && dot.classList.contains('fgd-dot-' + current)) {
        chip.classList.add('fgd-chip-active');
        // Add checkmark if not present
        if (!chip.querySelector('.fgd-chip-check')) {
          const chk = document.createElement('span');
          chk.className = 'fgd-chip-check';
          chk.textContent = '✓';
          chip.appendChild(chk);
        }
      } else {
        // Remove any errant checkmark
        const existing = chip.querySelector('.fgd-chip-check');
        if (existing) existing.remove();
      }
    });
  }

  // In the extension context, window.location.hostname works directly.
  // This mock is on localhost so we skip it — in production this runs automatically.
  // highlightCurrentHost();


  /* ══════════════════════════════════════════════════
     DEMO HELPERS — remove in production extension
     ══════════════════════════════════════════════════ */
  window.demoOpen  = open;
  window.demoClose = closePanel;
  window.resetTimer = resetCollapseTimer;
  window.setTheme = function(mode) {
    if (mode === 'light') {
      document.body.style.background = '#f9f9f9';
      document.body.style.color = '#111';
      dock.classList.add('fgd-light-host');
      document.querySelector('.host-header').style.background = '#ffffff';
      document.querySelector('.host-header').style.borderColor = 'rgba(0,0,0,.1)';
      document.querySelector('.host-logo').style.color = '#111';
      document.querySelectorAll('.host-bubble').forEach(b => {
        b.style.background = '#ffffff';
        b.style.borderColor = 'rgba(0,0,0,.08)';
        b.style.color = '#333';
      });
    } else {
      document.body.style.background = '#0a0a0f';
      document.body.style.color = '#e8e8f0';
      dock.classList.remove('fgd-light-host');
      document.querySelector('.host-header').style.background = '#1a1a22';
      document.querySelector('.host-header').style.borderColor = 'rgba(255,255,255,.08)';
      document.querySelector('.host-logo').style.color = '#e8e8f0';
      document.querySelectorAll('.host-bubble').forEach(b => {
        b.style.background = '#14141e';
        b.style.borderColor = 'rgba(255,255,255,.06)';
        b.style.color = '#c8c8d8';
      });
    }
  };


})();


})();
