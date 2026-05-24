/**
 * ============================================================
 * FORGE SYNTHESIS ACTIONS — forge-synthesis-actions.js
 * ============================================================
 * Two components in one file:
 *
 * 1. SYNTHESIS MODE SELECTOR
 *    Preset format buttons + custom instruction field.
 *    Shown BEFORE the user runs a synthesis.
 *    Developer calls: ForgeSynthesisMode.getInstruction()
 *    to get the current mode instruction for the API call.
 *
 * 2. EMAIL MODAL
 *    "Email this →" button on any result card.
 *    Opens a send dialog with Gmail MCP integration.
 *    Developer calls: ForgeEmailModal.open(content, subject)
 *
 * INTEGRATION:
 *   <script src="/js/forge-synthesis-actions.js" defer></script>
 *
 * Add the mode selector to synthesis, sweep, and excel pages:
 *   <div id="forge-synthesis-mode"></div>
 *
 * Add the email button to any result card:
 *   <button onclick="ForgeEmailModal.open(resultText, subject)">
 *     Email this →
 *   </button>
 *
 * GMAIL MCP ENDPOINT (developer wires):
 *   POST /api/email/send
 *   Body: { to, subject, body, format }
 *   Uses existing Gmail MCP connection
 *
 * SYNTHESIS MODE (developer wires):
 *   Append ForgeSynthesisMode.getInstruction() to your
 *   synthesis system prompt before the API call.
 * ============================================================
 */

(function ForgeActionsInit() {
  'use strict';

  // ── SHARED CSS ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('forge-actions-styles')) return;
    const style = document.createElement('style');
    style.id = 'forge-actions-styles';
    style.textContent = `
      /* ─── SYNTHESIS MODE SELECTOR ─────────────────────────── */

      .fsm-wrap {
        margin: 0 0 16px 0;
      }

      .fsm-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: rgba(148,148,170,0.8);
        margin-bottom: 10px;
        font-family: 'DM Sans', -apple-system, sans-serif;
      }

      .fsm-label-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #f97316;
        flex-shrink: 0;
      }

      .fsm-presets {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }

      .fsm-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: rgba(148,148,170,1);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        font-family: 'DM Sans', -apple-system, sans-serif;
        transition: all .15s;
        white-space: nowrap;
        letter-spacing: .2px;
      }

      .fsm-btn:hover {
        border-color: rgba(255,255,255,0.16);
        color: #f4f4fa;
        background: rgba(255,255,255,0.06);
      }

      .fsm-btn.active {
        background: rgba(249,115,22,0.10);
        border-color: rgba(249,115,22,0.35);
        color: #f97316;
        font-weight: 600;
      }

      .fsm-btn-icon {
        font-size: 13px;
        line-height: 1;
      }

      /* Custom instruction row */
      .fsm-custom-row {
        display: flex;
        gap: 8px;
        align-items: center;
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: max-height .3s ease, opacity .3s ease, margin .3s ease;
        margin-top: 0;
      }

      .fsm-custom-row.open {
        max-height: 60px;
        opacity: 1;
        margin-top: 8px;
      }

      .fsm-custom-input {
        flex: 1;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 8px;
        padding: 8px 12px;
        font-family: 'DM Sans', -apple-system, sans-serif;
        font-size: 13px;
        color: #f4f4fa;
        outline: none;
        transition: border-color .2s;
      }

      .fsm-custom-input:focus {
        border-color: rgba(249,115,22,0.4);
      }

      .fsm-custom-input::placeholder {
        color: rgba(82,82,106,1);
        font-style: italic;
      }

      .fsm-custom-clear {
        padding: 7px 12px;
        border-radius: 7px;
        background: none;
        border: 1px solid rgba(255,255,255,0.08);
        color: rgba(82,82,106,1);
        font-size: 11px;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        transition: all .15s;
        flex-shrink: 0;
      }

      .fsm-custom-clear:hover {
        color: #f4f4fa;
        border-color: rgba(255,255,255,.2);
      }

      /* Active mode indicator */
      .fsm-active-indicator {
        display: none;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: rgba(249,115,22,0.8);
        margin-top: 6px;
        font-style: italic;
        font-family: 'DM Sans', sans-serif;
      }

      .fsm-active-indicator.show { display: flex; }
      .fsm-active-icon { font-size: 12px; }


      /* ─── EMAIL MODAL ──────────────────────────────────────── */

      #fem-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(7,7,13,0.82);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity .25s;
        pointer-events: none;
      }

      #fem-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }

      #fem-modal {
        background: #111118;
        border: 1px solid rgba(255,255,255,0.11);
        border-radius: 20px;
        width: 100%;
        max-width: 540px;
        overflow: hidden;
        transform: translateY(16px) scale(.97);
        transition: transform .3s;
        box-shadow: 0 24px 80px rgba(0,0,0,0.7);
        font-family: 'DM Sans', -apple-system, sans-serif;
      }

      #fem-overlay.open #fem-modal {
        transform: translateY(0) scale(1);
      }

      /* Modal header */
      .fem-header {
        padding: 18px 22px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: relative;
      }

      .fem-header::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, #f97316, transparent);
      }

      .fem-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .fem-header-icon {
        width: 32px; height: 32px;
        border-radius: 8px;
        background: rgba(249,115,22,0.12);
        border: 1px solid rgba(249,115,22,0.28);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        flex-shrink: 0;
      }

      .fem-title {
        font-family: 'Syne', 'DM Sans', sans-serif;
        font-size: 16px;
        font-weight: 800;
        color: #f4f4fa;
        margin-bottom: 1px;
        letter-spacing: -.2px;
      }

      .fem-subtitle {
        font-size: 11px;
        color: rgba(82,82,106,1);
      }

      .fem-close {
        width: 28px; height: 28px;
        border-radius: 7px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        color: rgba(82,82,106,1);
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all .15s;
        flex-shrink: 0;
      }

      .fem-close:hover {
        background: rgba(239,68,68,0.10);
        border-color: rgba(239,68,68,0.28);
        color: #fca5a5;
      }

      /* Modal body */
      .fem-body { padding: 18px 22px; }

      .fem-field { margin-bottom: 14px; }

      .fem-field-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: rgba(82,82,106,1);
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .fem-input {
        width: 100%;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 9px;
        padding: 10px 13px;
        font-family: 'DM Sans', sans-serif;
        font-size: 13px;
        color: #f4f4fa;
        outline: none;
        transition: border-color .2s;
        box-sizing: border-box;
      }

      .fem-input:focus { border-color: rgba(249,115,22,0.4); }
      .fem-input::placeholder { color: rgba(82,82,106,1); }

      /* Format selector */
      .fem-formats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
      }

      .fem-format-btn {
        padding: 9px 10px;
        border-radius: 9px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.02);
        color: rgba(148,148,170,1);
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
        transition: all .15s;
        font-family: 'DM Sans', sans-serif;
        line-height: 1.4;
      }

      .fem-format-btn:hover {
        border-color: rgba(255,255,255,0.14);
        color: #f4f4fa;
        background: rgba(255,255,255,0.05);
      }

      .fem-format-btn.active {
        background: rgba(249,115,22,0.10);
        border-color: rgba(249,115,22,0.32);
        color: #f97316;
        font-weight: 600;
      }

      .fem-format-icon { font-size: 14px; display: block; margin-bottom: 3px; }

      /* Preview panel */
      .fem-preview-wrap {
        margin-top: 14px;
      }

      .fem-preview-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        padding: 8px 0;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: rgba(82,82,106,1);
        transition: color .15s;
        user-select: none;
      }

      .fem-preview-toggle:hover { color: rgba(148,148,170,1); }
      .fem-preview-chevron { transition: transform .2s; font-size: 10px; }
      .fem-preview-wrap.open .fem-preview-chevron { transform: rotate(180deg); }

      .fem-preview-body {
        max-height: 0;
        overflow: hidden;
        transition: max-height .3s ease;
      }

      .fem-preview-wrap.open .fem-preview-body { max-height: 180px; }

      .fem-preview-content {
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 9px;
        padding: 12px 14px;
        font-size: 12px;
        color: rgba(148,148,170,1);
        line-height: 1.65;
        max-height: 160px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .fem-preview-content::-webkit-scrollbar { width: 4px; }
      .fem-preview-content::-webkit-scrollbar-track { background: transparent; }
      .fem-preview-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

      /* Modal footer */
      .fem-footer {
        padding: 14px 22px;
        border-top: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .fem-send-btn {
        flex: 1;
        padding: 11px 20px;
        border-radius: 10px;
        background: #f97316;
        color: #fff;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        transition: opacity .15s;
        letter-spacing: .2px;
      }

      .fem-send-btn:hover { opacity: .88; }
      .fem-send-btn:disabled { opacity: .45; cursor: not-allowed; }

      .fem-send-btn.success {
        background: #22c55e;
        pointer-events: none;
      }

      .fem-mailto-btn {
        padding: 11px 16px;
        border-radius: 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.09);
        color: rgba(148,148,170,1);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        font-family: 'DM Sans', sans-serif;
        transition: all .15s;
        white-space: nowrap;
      }

      .fem-mailto-btn:hover {
        color: #f4f4fa;
        border-color: rgba(255,255,255,.18);
      }

      .fem-footer-note {
        font-size: 11px;
        color: rgba(44,44,62,1);
        padding: 0 22px 14px;
        line-height: 1.5;
      }

      /* Gmail connected badge */
      .fem-gmail-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 9px;
        border-radius: 50px;
        background: rgba(34,197,94,0.08);
        border: 1px solid rgba(34,197,94,0.22);
        font-size: 10px;
        font-weight: 700;
        color: #22c55e;
        letter-spacing: .3px;
      }

      .fem-gmail-dot {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: #22c55e;
      }

      /* Error state */
      .fem-error {
        display: none;
        padding: 8px 12px;
        border-radius: 8px;
        background: rgba(239,68,68,0.08);
        border: 1px solid rgba(239,68,68,0.22);
        font-size: 12px;
        color: #fca5a5;
        margin-top: 10px;
      }

      .fem-error.show { display: block; }


      /* ─── EMAIL THIS BUTTON ────────────────────────────────── */

      .forge-email-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 13px;
        border-radius: 7px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        color: rgba(148,148,170,1);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        font-family: 'DM Sans', -apple-system, sans-serif;
        transition: all .15s;
        white-space: nowrap;
      }

      .forge-email-btn:hover {
        background: rgba(249,115,22,0.08);
        border-color: rgba(249,115,22,0.28);
        color: #f97316;
      }

      .forge-email-btn-icon { font-size: 12px; }


      /* ─── FORGE TOAST ──────────────────────────────────────── */
      #forge-actions-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(8px);
        z-index: 10001;
        padding: 10px 18px;
        border-radius: 10px;
        background: #111118;
        border: 1px solid rgba(255,255,255,0.11);
        font-family: 'DM Sans', sans-serif;
        font-size: 12px;
        color: #f4f4fa;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,.5);
        opacity: 0;
        transition: all .25s;
        pointer-events: none;
        white-space: nowrap;
      }

      #forge-actions-toast.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(style);
  }


  // ══════════════════════════════════════════════════════════════
  // COMPONENT 1 — SYNTHESIS MODE SELECTOR
  // ══════════════════════════════════════════════════════════════

  const MODES = [
    {
      id: 'best-answer',
      label: 'Best Answer',
      icon: '✦',
      description: 'Forge\'s default synthesis — the clearest, most balanced answer.',
      instruction: '',
      isDefault: true,
    },
    {
      id: 'board-memo',
      label: 'Board Memo',
      icon: '📋',
      description: 'Structured board memo: Executive Summary, Key Findings, Recommendation, Risks.',
      instruction: 'Synthesise the responses into a structured board memo with four clearly labelled sections: Executive Summary (2–3 sentences), Key Findings (3–5 bullet points), Recommendation (a clear single recommendation), and Risks (2–3 key risks to be aware of). Use formal, professional language appropriate for a board audience.',
    },
    {
      id: 'bullet-points',
      label: 'Bullet Points',
      icon: '•',
      description: 'Concise bullet points, maximum 7, ordered by importance.',
      instruction: 'Synthesise the responses into a concise bulleted list. Maximum 7 bullets. Order by importance — most important first. Each bullet should be one to two sentences. No introduction, no conclusion — just the bullets.',
    },
    {
      id: 'pros-cons',
      label: 'Pros & Cons',
      icon: '⚖',
      description: 'Structured pros and cons with a weighted verdict.',
      instruction: 'Synthesise the responses as a structured pros and cons analysis. List the strongest arguments FOR and AGAINST clearly. End with a verdict that weighs the balance and gives a clear directional recommendation. Label sections clearly: Pros, Cons, Verdict.',
    },
    {
      id: 'action-plan',
      label: 'Action Plan',
      icon: '🎯',
      description: 'A numbered action plan with clear next steps.',
      instruction: 'Synthesise the responses as a numbered action plan. Focus entirely on what should be done — not analysis of the problem. Each action should be specific, concrete, and sequenced logically. Include a suggested timeline or priority where relevant. Format: numbered list, active verbs, no preamble.',
    },
    {
      id: 'formal-report',
      label: 'Formal Report',
      icon: '📄',
      description: 'Formal report structure: Background, Analysis, Findings, Recommendation.',
      instruction: 'Synthesise the responses as a formal written report with the following sections: Background (context and question), Analysis (key themes and perspectives from the AI responses), Findings (what the evidence shows), and Recommendation (clear, justified conclusion). Use formal, complete sentences throughout.',
    },
    {
      id: 'custom',
      label: 'Custom',
      icon: '+',
      description: 'Write your own synthesis instructions.',
      instruction: null, // pulled from the custom input
    },
  ];

  let activeModeId = 'best-answer';
  let customInstruction = '';

  window.ForgeSynthesisMode = {

    /**
     * Mount the mode selector into a container element.
     * @param {string|HTMLElement} container — ID or element
     * @param {object} options — { compact: bool, label: string }
     */
    mount(container, options = {}) {
      const el = typeof container === 'string'
        ? document.getElementById(container)
        : container;

      if (!el) return;

      injectStyles();
      el.innerHTML = this._buildHTML(options);
      this._bindEvents(el);
    },

    _buildHTML(opts = {}) {
      const label = opts.label || 'Synthesise how?';
      const presets = MODES.filter(m => m.id !== 'custom');
      const customMode = MODES.find(m => m.id === 'custom');

      const presetButtons = presets.map(m => `
        <button
          class="fsm-btn${m.isDefault ? ' active' : ''}"
          data-mode="${m.id}"
          title="${m.description}"
        >
          <span class="fsm-btn-icon">${m.icon}</span>
          ${m.label}
        </button>
      `).join('');

      return `
        <div class="fsm-wrap">
          <div class="fsm-label">
            <span class="fsm-label-dot"></span>
            ${label}
          </div>
          <div class="fsm-presets">
            ${presetButtons}
            <button class="fsm-btn" data-mode="custom" title="${customMode.description}">
              <span class="fsm-btn-icon">✏</span>
              Custom
            </button>
          </div>
          <div class="fsm-custom-row" id="fsm-custom-row">
            <input
              class="fsm-custom-input"
              id="fsm-custom-input"
              type="text"
              placeholder="e.g. Summarise for a non-technical audience in under 100 words…"
              maxlength="300"
            />
            <button class="fsm-custom-clear" id="fsm-custom-clear">Reset</button>
          </div>
          <div class="fsm-active-indicator" id="fsm-active-indicator">
            <span class="fsm-active-icon">✦</span>
            <span id="fsm-active-text"></span>
          </div>
        </div>
      `;
    },

    _bindEvents(el) {
      el.querySelectorAll('.fsm-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const modeId = btn.dataset.mode;
          this.setMode(modeId, el);
        });
      });

      const customInput = el.querySelector('#fsm-custom-input');
      if (customInput) {
        customInput.addEventListener('input', () => {
          customInstruction = customInput.value.trim();
          this._updateIndicator(el);
        });
      }

      const clearBtn = el.querySelector('#fsm-custom-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          this.setMode('best-answer', el);
          const input = el.querySelector('#fsm-custom-input');
          if (input) input.value = '';
          customInstruction = '';
        });
      }
    },

    setMode(modeId, el) {
      activeModeId = modeId;
      el = el || document.querySelector('.fsm-wrap')?.closest('[id]');

      // Update button states
      if (el) {
        el.querySelectorAll('.fsm-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === modeId);
        });

        // Toggle custom input
        const customRow = el.querySelector('#fsm-custom-row');
        if (customRow) {
          customRow.classList.toggle('open', modeId === 'custom');
          if (modeId === 'custom') {
            setTimeout(() => el.querySelector('#fsm-custom-input')?.focus(), 50);
          }
        }

        this._updateIndicator(el);
      }
    },

    _updateIndicator(el) {
      const indicator = el?.querySelector('#fsm-active-indicator');
      const text = el?.querySelector('#fsm-active-text');
      if (!indicator || !text) return;

      const mode = MODES.find(m => m.id === activeModeId);
      if (!mode || mode.isDefault) {
        indicator.classList.remove('show');
        return;
      }

      if (activeModeId === 'custom') {
        if (customInstruction) {
          text.textContent = 'Custom: "' + customInstruction.slice(0, 60) + (customInstruction.length > 60 ? '…' : '') + '"';
          indicator.classList.add('show');
        } else {
          indicator.classList.remove('show');
        }
      } else {
        text.textContent = mode.label + ' mode active';
        indicator.classList.add('show');
      }
    },

    /**
     * Returns the instruction string to append to the synthesis system prompt.
     * Call this immediately before your API call.
     * @returns {string}
     */
    getInstruction() {
      const mode = MODES.find(m => m.id === activeModeId);
      if (!mode) return '';
      if (activeModeId === 'custom') return customInstruction;
      return mode.instruction || '';
    },

    /** Returns the current mode ID */
    getModeId() { return activeModeId; },

    /** Returns the current mode display label */
    getModeLabel() {
      return MODES.find(m => m.id === activeModeId)?.label || 'Best Answer';
    },

    /** Reset to default */
    reset() {
      activeModeId = 'best-answer';
      customInstruction = '';
      document.querySelectorAll('.fsm-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === 'best-answer');
      });
      const rows = document.querySelectorAll('#fsm-custom-row');
      rows.forEach(r => r.classList.remove('open'));
      const indicators = document.querySelectorAll('#fsm-active-indicator');
      indicators.forEach(i => i.classList.remove('show'));
    },
  };


  // ══════════════════════════════════════════════════════════════
  // COMPONENT 2 — EMAIL MODAL
  // ══════════════════════════════════════════════════════════════

  const EMAIL_FORMATS = [
    { id: 'full',      icon: '📄', label: 'Full synthesis' },
    { id: 'summary',   icon: '📋', label: 'Executive summary' },
    { id: 'bullets',   icon: '•',  label: 'Bullet points' },
    { id: 'report',    icon: '📊', label: 'Formal report' },
    { id: 'plain',     icon: '✉',  label: 'Plain text' },
  ];

  let modalContent   = '';
  let selectedFormat = 'full';
  let previewOpen    = false;

  // Build and inject the modal HTML once
  function buildModal() {
    if (document.getElementById('fem-overlay')) return;
    injectStyles();

    const formats = EMAIL_FORMATS.map(f => `
      <button class="fem-format-btn${f.id === 'full' ? ' active' : ''}" data-format="${f.id}">
        <span class="fem-format-icon">${f.icon}</span>
        ${f.label}
      </button>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'fem-overlay';
    modal.innerHTML = `
      <div id="fem-modal">

        <div class="fem-header">
          <div class="fem-header-left">
            <div class="fem-header-icon">✉</div>
            <div>
              <div class="fem-title">Email this</div>
              <div class="fem-subtitle">
                Send this synthesis directly from Forge
                &nbsp;
                <span class="fem-gmail-badge" id="fem-gmail-badge">
                  <span class="fem-gmail-dot"></span>
                  Gmail connected
                </span>
              </div>
            </div>
          </div>
          <button class="fem-close" onclick="ForgeEmailModal.close()">✕</button>
        </div>

        <div class="fem-body">

          <div class="fem-field">
            <div class="fem-field-label">To</div>
            <input
              class="fem-input"
              id="fem-to"
              type="email"
              placeholder="recipient@example.com"
              autocomplete="email"
            />
          </div>

          <div class="fem-field">
            <div class="fem-field-label">Subject</div>
            <input
              class="fem-input"
              id="fem-subject"
              type="text"
              placeholder="Forge synthesis — [your topic]"
            />
          </div>

          <div class="fem-field">
            <div class="fem-field-label">Format</div>
            <div class="fem-formats">${formats}</div>
          </div>

          <div class="fem-error" id="fem-error"></div>

          <div class="fem-preview-wrap" id="fem-preview-wrap">
            <div class="fem-preview-toggle" onclick="ForgeEmailModal.togglePreview()">
              <span>Preview content</span>
              <span class="fem-preview-chevron">▲</span>
            </div>
            <div class="fem-preview-body">
              <div class="fem-preview-content" id="fem-preview-content"></div>
            </div>
          </div>

        </div>

        <div class="fem-footer">
          <button class="fem-mailto-btn" onclick="ForgeEmailModal.sendMailto()" title="Open in your default email app">
            Open in Mail app
          </button>
          <button class="fem-send-btn" id="fem-send-btn" onclick="ForgeEmailModal.send()">
            ✉ Send via Gmail
          </button>
        </div>

        <div class="fem-footer-note" id="fem-footer-note">
          Sent from your connected Gmail account via Forge.
        </div>

      </div>
    `;

    document.body.appendChild(modal);

    // Close on overlay click
    modal.addEventListener('click', e => {
      if (e.target === modal) ForgeEmailModal.close();
    });

    // Format button events
    modal.querySelectorAll('.fem-format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.fem-format-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedFormat = btn.dataset.format;
        updatePreview();
      });
    });
  }

  function updatePreview() {
    const el = document.getElementById('fem-preview-content');
    if (!el) return;
    const formatted = formatContent(modalContent, selectedFormat);
    el.textContent = formatted.slice(0, 600) + (formatted.length > 600 ? '…' : '');
  }

  function formatContent(content, format) {
    if (!content) return '';
    switch (format) {
      case 'full':
        return content;
      case 'summary':
        // Take first 2–3 sentences
        const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
        return sentences.slice(0, 3).join(' ').trim();
      case 'bullets':
        // Convert paragraphs to bullets
        return content.split('\n')
          .filter(l => l.trim())
          .map(l => '• ' + l.trim())
          .join('\n');
      case 'report':
        return '--- Forge Synthesis Report ---\n\n' + content + '\n\n--- Generated by Forge ---';
      case 'plain':
        // Strip any markdown-style formatting
        return content.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1');
      default:
        return content;
    }
  }

  function buildEmailBody(content, format) {
    const formatted = formatContent(content, format);
    const modeLabel = window.ForgeSynthesisMode?.getModeLabel() || 'Best Answer';
    const featureLabel = detectFeature();
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    return `${formatted}

---
Synthesised by Forge · ${featureLabel} · ${modeLabel} mode · ${date}
forge.projectcoachai.com`;
  }

  function detectFeature() {
    const p = window.location.pathname;
    if (p.includes('synthesis')) return 'Synthesis';
    if (p.includes('broadcast') || p.includes('sweep')) return 'Sweep';
    if (p.includes('excel')) return 'Excel';
    if (p.includes('perspectives')) return 'Perspectives';
    return 'Forge';
  }

  function autoSubject(content) {
    if (!content) return 'Forge synthesis';
    // Take first meaningful line or truncated first sentence
    const firstLine = content.split('\n').find(l => l.trim().length > 10) || '';
    const short = firstLine.trim().slice(0, 60);
    return 'Forge: ' + (short || 'synthesis');
  }

  window.ForgeEmailModal = {

    /**
     * Open the email modal with pre-populated content.
     * @param {string} content — The synthesis/result text to email
     * @param {string} subject — Optional subject override
     */
    open(content, subject) {
      buildModal();
      modalContent = content || '';
      selectedFormat = 'full';

      // Reset format buttons
      document.querySelectorAll('.fem-format-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.format === 'full');
      });

      // Set fields
      const toEl      = document.getElementById('fem-to');
      const subjectEl = document.getElementById('fem-subject');
      const sendBtn   = document.getElementById('fem-send-btn');
      const errorEl   = document.getElementById('fem-error');

      if (toEl)      toEl.value = '';
      if (subjectEl) subjectEl.value = subject || autoSubject(content);
      if (sendBtn)   { sendBtn.textContent = '✉ Send via Gmail'; sendBtn.disabled = false; sendBtn.className = 'fem-send-btn'; }
      if (errorEl)   errorEl.classList.remove('show');

      // Update preview
      updatePreview();

      // Check Gmail connection
      this._checkGmailConnection();

      // Show
      const overlay = document.getElementById('fem-overlay');
      if (overlay) {
        overlay.classList.add('open');
        setTimeout(() => toEl?.focus(), 200);
      }
    },

    close() {
      const overlay = document.getElementById('fem-overlay');
      if (overlay) overlay.classList.remove('open');
      previewOpen = false;
      const pw = document.getElementById('fem-preview-wrap');
      if (pw) pw.classList.remove('open');
    },

    togglePreview() {
      previewOpen = !previewOpen;
      const pw = document.getElementById('fem-preview-wrap');
      if (pw) pw.classList.toggle('open', previewOpen);
      updatePreview();
    },

    _checkGmailConnection() {
      // ── DEVELOPER: check if Gmail MCP is connected ──
      // Replace with your actual connection check
      const gmailConnected = true; // assume connected — developer to wire
      const badge = document.getElementById('fem-gmail-badge');
      const sendBtn = document.getElementById('fem-send-btn');
      const note = document.getElementById('fem-footer-note');

      if (!gmailConnected) {
        if (badge) badge.style.display = 'none';
        if (sendBtn) {
          sendBtn.textContent = 'Gmail not connected';
          sendBtn.disabled = true;
        }
        if (note) note.textContent = 'Connect Gmail in Settings to send directly. Use "Open in Mail app" as an alternative.';
      }
    },

    /**
     * Send via Gmail MCP.
     * Developer wires POST /api/email/send to the Gmail MCP.
     */
    async send() {
      const to      = document.getElementById('fem-to')?.value?.trim();
      const subject = document.getElementById('fem-subject')?.value?.trim();
      const sendBtn = document.getElementById('fem-send-btn');
      const errorEl = document.getElementById('fem-error');

      // Validate
      if (!to || !to.includes('@')) {
        this._showError('Please enter a valid email address.');
        document.getElementById('fem-to')?.focus();
        return;
      }

      if (!subject) {
        this._showError('Please enter a subject line.');
        document.getElementById('fem-subject')?.focus();
        return;
      }

      errorEl?.classList.remove('show');

      // Disable button
      if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '⏳ Sending…';
      }

      const body = buildEmailBody(modalContent, selectedFormat);

      try {
        // ── DEVELOPER: replace with real Gmail MCP call ──────
        // const res = await fetch('/api/email/send', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //     'Authorization': 'Bearer ' + Forge.getToken()
        //   },
        //   body: JSON.stringify({ to, subject, body, format: selectedFormat })
        // });
        // if (!res.ok) throw new Error('Send failed');
        // ── END DEVELOPER SECTION ──────────────────────────

        // Mock success for UI demonstration:
        await new Promise(r => setTimeout(r, 1000));

        // Success state
        if (sendBtn) {
          sendBtn.innerHTML = '✓ Sent!';
          sendBtn.className = 'fem-send-btn success';
        }
        showActionsToast('✓ Email sent via Gmail');
        setTimeout(() => this.close(), 1600);

      } catch (err) {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '✉ Send via Gmail';
        }
        this._showError('Send failed. Try "Open in Mail app" as a fallback.');
      }
    },

    /**
     * Fallback: opens default mail client with mailto: link.
     * Works on every device, zero backend required.
     */
    sendMailto() {
      const to      = document.getElementById('fem-to')?.value?.trim() || '';
      const subject = encodeURIComponent(document.getElementById('fem-subject')?.value?.trim() || 'Forge synthesis');
      const body    = encodeURIComponent(buildEmailBody(modalContent, selectedFormat));
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    },

    _showError(msg) {
      const el = document.getElementById('fem-error');
      if (el) { el.textContent = msg; el.classList.add('show'); }
    },
  };


  // ── "EMAIL THIS" BUTTON HELPER ───────────────────────────────
  /**
   * Create a standalone "Email this →" button.
   * Attach to any result card.
   *
   * Usage in HTML:
   *   <div data-forge-email-btn
   *        data-content="the synthesis text"
   *        data-subject="optional subject">
   *   </div>
   *
   * Or in JS:
   *   ForgeEmailModal.open(resultText, subjectLine);
   */
  function initEmailButtons() {
    document.querySelectorAll('[data-forge-email-btn]').forEach(el => {
      if (el.dataset.emailBtnInit) return;
      el.dataset.emailBtnInit = '1';

      const btn = document.createElement('button');
      btn.className = 'forge-email-btn';
      btn.innerHTML = '<span class="forge-email-btn-icon">✉</span> Email this →';
      btn.addEventListener('click', () => {
        const content = el.dataset.content || el.closest('[data-result]')?.dataset?.result || '';
        const subject = el.dataset.subject || '';
        ForgeEmailModal.open(content, subject);
      });
      el.appendChild(btn);
    });
  }


  // ── TOAST ─────────────────────────────────────────────────────
  let actionsToastTimer;
  function showActionsToast(msg) {
    let toast = document.getElementById('forge-actions-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'forge-actions-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(actionsToastTimer);
    actionsToastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }


  // ── INIT ──────────────────────────────────────────────────────
  function init() {
    injectStyles();

    // Auto-mount mode selector if the container exists
    const modeContainer = document.getElementById('forge-synthesis-mode');
    if (modeContainer) {
      ForgeSynthesisMode.mount(modeContainer);
    }

    // Auto-init any email buttons already in the DOM
    initEmailButtons();

    // Watch for dynamically added result cards
    const observer = new MutationObserver(() => initEmailButtons());
    observer.observe(document.body, { childList: true, subtree: true });

    console.log('[ForgeSynthesisActions] Ready — ForgeSynthesisMode + ForgeEmailModal available');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
