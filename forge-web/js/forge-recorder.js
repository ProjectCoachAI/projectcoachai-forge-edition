/**
 * ============================================================
 * FORGE SESSION RECORDER — forge-recorder.js
 * ============================================================
 * Drop this script into any Forge page. It injects:
 *   - A floating recording pill (bottom-right corner)
 *   - ⌘+Shift+R keyboard shortcut to start/stop
 *   - Post-recording modal: save / share / download / discard
 *
 * DEPENDENCIES:
 *   - rrweb (loaded from CDN or bundled)
 *   - forge-api.js (for authenticated API calls)
 *
 * DEVELOPER INTEGRATION:
 *   Add to forge-header.js or as a page-level script:
 *   <script src="/js/forge-recorder.js" defer></script>
 *
 * API ENDPOINTS REQUIRED:
 *   POST /api/recordings          — save recording, returns { id, shareToken }
 *   GET  /api/recordings          — list user's recordings
 *   DELETE /api/recordings/:id    — delete recording
 *
 * ============================================================
 */

(function ForgeRecorder() {
  'use strict';

  // ── CONFIGURATION ────────────────────────────────────────────
  const CONFIG = {
    rrwebCDN:    'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js',
    saveEndpoint: 'https://api.projectcoachai.com/api/recordings',
    replayBase:  'https://forge.projectcoachai.com/replay',
    shortcut:    { key: 'r', meta: true, shift: true }, // ⌘+Shift+R
  };

  // ── STATE ────────────────────────────────────────────────────
  let state = {
    status:    'idle',   // idle | recording | saving | saved
    events:    [],
    startTime: null,
    duration:  0,
    timerInterval: null,
    stopFn:    null,
    currentFeature: detectFeature(),
  };

  // ── DETECT CURRENT FEATURE ───────────────────────────────────
  function detectFeature() {
    const p = window.location.pathname;
    if (p.includes('perspectives')) return 'Perspectives';
    if (p.includes('synthesis'))    return 'Synthesis';
    if (p.includes('broadcast') || p.includes('sweep')) return 'Sweep';
    if (p.includes('excel'))        return 'Excel';
    if (p.includes('quickchat'))    return 'Quick Answer';
    return 'Forge';
  }

  // ── LOAD rrweb ───────────────────────────────────────────────
  function loadRrweb(cb) {
    if (window.rrweb) { cb(); return; }
    const s = document.createElement('script');
    s.src = CONFIG.rrwebCDN;
    s.onload = cb;
    s.onerror = () => console.warn('[ForgeRecorder] Failed to load rrweb');
    document.head.appendChild(s);
  }

  // ── CSS INJECTION ────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('forge-recorder-styles')) return;
    const style = document.createElement('style');
    style.id = 'forge-recorder-styles';
    style.textContent = `
      /* ── PILL ── */
      #forge-rec-pill {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 50px;
        font-family: 'DM Sans', -apple-system, sans-serif;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        border: none;
        transition: all .2s;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        letter-spacing: .2px;
      }
      #forge-rec-pill.idle {
        background: rgba(17,17,24,0.95);
        border: 1px solid rgba(255,255,255,0.12);
        color: rgba(148,148,170,1);
        backdrop-filter: blur(12px);
      }
      #forge-rec-pill.idle:hover {
        border-color: rgba(239,68,68,0.4);
        color: #f4f4fa;
        background: rgba(239,68,68,0.08);
      }
      #forge-rec-pill.recording {
        background: rgba(239,68,68,0.12);
        border: 1px solid rgba(239,68,68,0.35);
        color: #fca5a5;
      }
      #forge-rec-pill.recording:hover {
        background: rgba(239,68,68,0.18);
      }
      #forge-rec-pill.saving {
        background: rgba(249,115,22,0.10);
        border: 1px solid rgba(249,115,22,0.28);
        color: #fdba74;
        pointer-events: none;
      }

      /* ── REC DOT ── */
      .forge-rec-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .forge-rec-dot.pulse {
        background: #ef4444;
        animation: forge-rec-pulse 1.2s ease-in-out infinite;
      }
      .forge-rec-dot.idle-dot { background: rgba(148,148,170,.5); }
      .forge-rec-dot.saving-dot { background: #f97316; }
      @keyframes forge-rec-pulse {
        0%,100% { opacity: 1; transform: scale(1); }
        50%      { opacity: .5; transform: scale(.8); }
      }

      /* ── TIMER ── */
      #forge-rec-timer {
        font-family: 'DM Mono', monospace;
        font-size: 11px;
        letter-spacing: .5px;
        min-width: 36px;
      }

      /* ── SHORTCUT HINT ── */
      #forge-rec-hint {
        position: fixed;
        bottom: 68px;
        right: 24px;
        z-index: 9998;
        font-family: 'DM Sans', -apple-system, sans-serif;
        font-size: 10px;
        color: rgba(82,82,106,1);
        opacity: 0;
        transition: opacity .2s;
        pointer-events: none;
        letter-spacing: .3px;
      }
      #forge-rec-pill:hover ~ #forge-rec-hint,
      #forge-rec-pill.idle:hover + #forge-rec-hint { opacity: 1; }

      /* ── MODAL OVERLAY ── */
      #forge-rec-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(7,7,13,0.85);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity .3s;
      }
      #forge-rec-modal-overlay.show { opacity: 1; }

      /* ── MODAL ── */
      #forge-rec-modal {
        background: #111118;
        border: 1px solid rgba(255,255,255,0.11);
        border-radius: 20px;
        width: 480px;
        max-width: calc(100vw - 40px);
        overflow: hidden;
        transform: translateY(16px) scale(.97);
        transition: transform .3s;
        box-shadow: 0 24px 80px rgba(0,0,0,0.6);
      }
      #forge-rec-modal-overlay.show #forge-rec-modal {
        transform: translateY(0) scale(1);
      }
      .frm-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .frm-header-left {}
      .frm-title {
        font-family: 'Syne', sans-serif;
        font-size: 17px;
        font-weight: 800;
        color: #f4f4fa;
        margin-bottom: 3px;
      }
      .frm-meta {
        font-size: 11px;
        color: rgba(82,82,106,1);
        font-family: 'DM Mono', monospace;
        display: flex;
        gap: 12px;
      }
      .frm-close {
        width: 28px; height: 28px;
        border-radius: 7px;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        color: rgba(148,148,170,1);
        font-size: 14px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        transition: all .15s;
      }
      .frm-close:hover { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.3); color: #fca5a5; }

      .frm-body { padding: 20px 24px; }

      /* Title input */
      .frm-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: rgba(82,82,106,1);
        margin-bottom: 7px;
      }
      .frm-input {
        width: 100%;
        background: #1a1a26;
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 10px;
        padding: 10px 14px;
        font-family: 'DM Sans', sans-serif;
        font-size: 14px;
        color: #f4f4fa;
        outline: none;
        margin-bottom: 16px;
        transition: border-color .2s;
      }
      .frm-input:focus { border-color: rgba(249,115,22,0.4); }
      .frm-input::placeholder { color: rgba(82,82,106,1); }

      /* Preview thumbnail */
      .frm-preview {
        background: #0f0f18;
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        height: 120px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
        position: relative;
        overflow: hidden;
      }
      .frm-preview-label {
        font-size: 11px;
        color: rgba(82,82,106,1);
        text-align: center;
        line-height: 1.6;
      }
      .frm-preview-icon { font-size: 28px; margin-bottom: 6px; display: block; }
      .frm-preview-stats {
        position: absolute;
        top: 8px; right: 10px;
        font-family: 'DM Mono', monospace;
        font-size: 10px;
        color: rgba(249,115,22,0.7);
      }

      /* Visibility toggle */
      .frm-visibility {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
      }
      .frm-vis-btn {
        flex: 1;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.02);
        color: rgba(148,148,170,1);
        font-family: 'DM Sans', sans-serif;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all .15s;
        text-align: center;
      }
      .frm-vis-btn.active {
        background: rgba(249,115,22,0.08);
        border-color: rgba(249,115,22,0.28);
        color: #f97316;
        font-weight: 600;
      }
      .frm-vis-btn:hover:not(.active) { border-color: rgba(255,255,255,0.15); color: #f4f4fa; }

      /* Action buttons */
      .frm-actions { display: flex; flex-direction: column; gap: 8px; }
      .frm-btn {
        width: 100%;
        padding: 11px 16px;
        border-radius: 10px;
        font-family: 'DM Sans', sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all .15s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        letter-spacing: .2px;
      }
      .frm-btn-primary {
        background: #f97316;
        color: #fff;
      }
      .frm-btn-primary:hover { opacity: .88; }
      .frm-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
      .frm-btn-secondary {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.09);
        color: rgba(148,148,170,1);
      }
      .frm-btn-secondary:hover { background: rgba(255,255,255,0.07); color: #f4f4fa; border-color: rgba(255,255,255,0.16); }
      .frm-btn-danger {
        background: transparent;
        border: 1px solid rgba(239,68,68,0.2);
        color: rgba(239,68,68,.7);
      }
      .frm-btn-danger:hover { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.35); color: #fca5a5; }

      /* Share link result */
      .frm-share-result {
        display: none;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: rgba(34,197,94,0.07);
        border: 1px solid rgba(34,197,94,0.22);
        border-radius: 10px;
        margin-top: 8px;
      }
      .frm-share-result.show { display: flex; }
      .frm-share-url {
        font-family: 'DM Mono', monospace;
        font-size: 11px;
        color: #86efac;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .frm-copy-btn {
        padding: 4px 10px;
        border-radius: 6px;
        background: rgba(34,197,94,0.12);
        border: 1px solid rgba(34,197,94,0.25);
        color: #22c55e;
        font-size: 10px;
        font-weight: 700;
        cursor: pointer;
        flex-shrink: 0;
        font-family: 'DM Sans', sans-serif;
      }
      .frm-copy-btn:hover { background: rgba(34,197,94,0.2); }

      /* Footer note */
      .frm-footer {
        padding: 12px 24px;
        border-top: 1px solid rgba(255,255,255,0.05);
        font-size: 11px;
        color: rgba(82,82,106,1);
        line-height: 1.5;
      }

      /* Toast */
      #forge-rec-toast {
        position: fixed;
        bottom: 80px;
        right: 24px;
        z-index: 10001;
        padding: 10px 16px;
        border-radius: 10px;
        background: #111118;
        border: 1px solid rgba(255,255,255,0.11);
        font-family: 'DM Sans', sans-serif;
        font-size: 12px;
        color: #f4f4fa;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        transform: translateY(8px);
        opacity: 0;
        transition: all .25s;
        pointer-events: none;
      }
      #forge-rec-toast.show { transform: translateY(0); opacity: 1; }
    `;
    document.head.appendChild(style);
  }

  // ── BUILD UI ─────────────────────────────────────────────────
  function buildPill() {
    const pill = document.createElement('button');
    pill.id = 'forge-rec-pill';
    pill.className = 'idle';
    pill.setAttribute('title', 'Record Forge session (⌘+Shift+R)');
    pill.innerHTML = `
      <span class="forge-rec-dot idle-dot" id="forge-rec-dot"></span>
      <span id="forge-rec-label">Record session</span>
      <span id="forge-rec-timer" style="display:none">0:00</span>
    `;
    pill.addEventListener('click', handlePillClick);
    document.body.appendChild(pill);

    const hint = document.createElement('div');
    hint.id = 'forge-rec-hint';
    hint.textContent = '⌘+Shift+R';
    document.body.appendChild(hint);
  }

  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'forge-rec-modal-overlay';
    overlay.innerHTML = `
      <div id="forge-rec-modal">

        <div class="frm-header">
          <div class="frm-header-left">
            <div class="frm-title">Save your recording</div>
            <div class="frm-meta">
              <span id="frm-duration-label">Duration</span>
              <span>·</span>
              <span id="frm-feature-label">${state.currentFeature}</span>
              <span>·</span>
              <span id="frm-events-label">0 events</span>
            </div>
          </div>
          <button class="frm-close" id="frm-close-btn" title="Discard recording">✕</button>
        </div>

        <div class="frm-body">

          <div class="frm-label">Session title</div>
          <input
            class="frm-input"
            id="frm-title-input"
            type="text"
            placeholder="e.g. Carbon credit analysis · May 2026"
            maxlength="100"
          />

          <div class="frm-preview" id="frm-preview">
            <div class="frm-preview-label">
              <span class="frm-preview-icon">🎬</span>
              Forge session replay ready
            </div>
            <div class="frm-preview-stats" id="frm-preview-stats"></div>
          </div>

          <div class="frm-label">Visibility</div>
          <div class="frm-visibility">
            <button class="frm-vis-btn active" id="vis-private" onclick="ForgeRecorderUI.setVisibility('private',this)">🔒 Private — only you</button>
            <button class="frm-vis-btn" id="vis-public" onclick="ForgeRecorderUI.setVisibility('public',this)">🔗 Public — shareable link</button>
          </div>

          <div class="frm-actions">
            <button class="frm-btn frm-btn-primary" id="frm-save-btn" onclick="ForgeRecorderUI.saveRecording()">
              💾 Save to my profile
            </button>
            <button class="frm-btn frm-btn-secondary" id="frm-share-btn" onclick="ForgeRecorderUI.saveAndShare()" style="display:none">
              🔗 Save &amp; get shareable link
            </button>
            <div class="frm-share-result" id="frm-share-result">
              <span class="frm-share-url" id="frm-share-url"></span>
              <button class="frm-copy-btn" onclick="ForgeRecorderUI.copyLink()">Copy</button>
            </div>
            <button class="frm-btn frm-btn-danger" id="frm-discard-btn" onclick="ForgeRecorderUI.discard()">
              🗑 Discard recording
            </button>
          </div>

        </div>

        <div class="frm-footer">
          Your recording is stored securely. Personal data entered during the session is included — only share publicly if you're comfortable with the content.
        </div>

      </div>
    `;

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) ForgeRecorderUI.discard();
    });

    document.body.appendChild(overlay);
  }

  function buildToast() {
    const toast = document.createElement('div');
    toast.id = 'forge-rec-toast';
    document.body.appendChild(toast);
  }

  // ── PILL CLICK HANDLER ───────────────────────────────────────
  function handlePillClick() {
    if (state.status === 'idle')      startRecording();
    else if (state.status === 'recording') stopRecording();
  }

  // ── START RECORDING ──────────────────────────────────────────
  function startRecording() {
    if (!window.rrweb) {
      showToast('⏳ Loading recorder…');
      loadRrweb(() => {
        showToast('● Recording started');
        _startRrweb();
      });
    } else {
      showToast('● Recording started');
      _startRrweb();
    }
  }

  function _startRrweb() {
    state.events = [];
    state.startTime = Date.now();
    state.status = 'recording';
    state.duration = 0;
    state.currentFeature = detectFeature();

    // Start rrweb capture
    state.stopFn = window.rrweb.record({
      emit(event) { state.events.push(event); },
      recordCanvas: false,
      sampling: { mousemove: 50, scroll: 150 },
    });

    // Update pill UI
    const pill = document.getElementById('forge-rec-pill');
    const dot  = document.getElementById('forge-rec-dot');
    const lbl  = document.getElementById('forge-rec-label');
    const tmr  = document.getElementById('forge-rec-timer');

    pill.className = 'recording';
    dot.className  = 'forge-rec-dot pulse';
    lbl.textContent = 'Recording…';
    tmr.style.display = 'inline';

    // Timer
    state.timerInterval = setInterval(() => {
      state.duration = Math.floor((Date.now() - state.startTime) / 1000);
      const m = Math.floor(state.duration / 60);
      const s = state.duration % 60;
      tmr.textContent = m + ':' + String(s).padStart(2,'0');
    }, 1000);
  }

  // ── STOP RECORDING ───────────────────────────────────────────
  function stopRecording() {
    if (state.stopFn) { state.stopFn(); state.stopFn = null; }
    clearInterval(state.timerInterval);
    state.status = 'saving';

    // Reset pill
    const pill = document.getElementById('forge-rec-pill');
    const dot  = document.getElementById('forge-rec-dot');
    const lbl  = document.getElementById('forge-rec-label');
    const tmr  = document.getElementById('forge-rec-timer');

    pill.className = 'saving';
    dot.className  = 'forge-rec-dot saving-dot';
    lbl.textContent = 'Session captured';
    tmr.style.display = 'none';

    // Open save modal
    openModal();
  }

  // ── MODAL ────────────────────────────────────────────────────
  function openModal() {
    const overlay = document.getElementById('forge-rec-modal-overlay');
    if (!overlay) return;

    // Populate meta
    const dur = state.duration;
    const m   = Math.floor(dur / 60);
    const s   = dur % 60;
    document.getElementById('frm-duration-label').textContent =
      m + ':' + String(s).padStart(2,'0');
    document.getElementById('frm-feature-label').textContent = state.currentFeature;
    document.getElementById('frm-events-label').textContent  =
      state.events.length + ' events';
    document.getElementById('frm-preview-stats').textContent =
      state.events.length + ' events · ' + Math.round(JSON.stringify(state.events).length / 1024) + 'KB';

    // Default title
    const today = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    document.getElementById('frm-title-input').value =
      state.currentFeature + ' session · ' + today;

    requestAnimationFrame(() => overlay.classList.add('show'));
    document.getElementById('frm-title-input').focus();
  }

  function closeModal() {
    const overlay = document.getElementById('forge-rec-modal-overlay');
    if (overlay) overlay.classList.remove('show');

    // Reset pill to idle
    const pill = document.getElementById('forge-rec-pill');
    const dot  = document.getElementById('forge-rec-dot');
    const lbl  = document.getElementById('forge-rec-label');

    pill.className  = 'idle';
    dot.className   = 'forge-rec-dot idle-dot';
    lbl.textContent = 'Record session';
    state.status    = 'idle';
    state.events    = [];
  }

  // ── VISIBILITY TOGGLE ────────────────────────────────────────
  let isPublic = false;

  window.ForgeRecorderUI = {
    setVisibility(vis, btn) {
      isPublic = vis === 'public';
      document.querySelectorAll('.frm-vis-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('frm-share-btn').style.display =
        isPublic ? 'flex' : 'none';
      document.getElementById('frm-save-btn').textContent =
        isPublic ? '💾 Save (private copy)' : '💾 Save to my profile';
    },

    // ── SAVE ──────────────────────────────────────────────────
    async saveRecording() {
      const btn   = document.getElementById('frm-save-btn');
      const title = document.getElementById('frm-title-input').value.trim() ||
                    state.currentFeature + ' session';

      btn.disabled  = true;
      btn.innerHTML = '⏳ Saving…';

      try {
        const payload = {
          title,
          events:      state.events,
          durationMs:  state.duration * 1000,
          featureUsed: state.currentFeature,
          isPublic:    false,
          page:        window.location.pathname,
        };

        // ── DEVELOPER: wire to real endpoint ──
        // const res  = await Forge.request('POST', '/api/recordings', payload);
        // const data = res.data;
        // ── END DEVELOPER SECTION ──

        // Mock success for UI demo:
        await new Promise(r => setTimeout(r, 900));
        const data = { id: 'rec_' + Date.now(), shareToken: null };

        btn.innerHTML = '✓ Saved to profile';
        btn.style.background = '#22c55e';
        showToast('✓ Recording saved to your profile');
        setTimeout(closeModal, 1400);

      } catch(err) {
        btn.disabled  = false;
        btn.innerHTML = '💾 Save to my profile';
        showToast('⚠ Save failed — try again');
      }
    },

    // ── SAVE + SHARE ──────────────────────────────────────────
    async saveAndShare() {
      const btn   = document.getElementById('frm-share-btn');
      const title = document.getElementById('frm-title-input').value.trim() ||
                    state.currentFeature + ' session';

      btn.disabled  = true;
      btn.innerHTML = '⏳ Generating link…';

      try {
        const payload = {
          title,
          events:      state.events,
          durationMs:  state.duration * 1000,
          featureUsed: state.currentFeature,
          isPublic:    true,
          page:        window.location.pathname,
        };

        // ── DEVELOPER: wire to real endpoint ──
        // const res  = await Forge.request('POST', '/api/recordings', payload);
        // const shareToken = res.data.shareToken;
        // ── END DEVELOPER SECTION ──

        // Mock token:
        await new Promise(r => setTimeout(r, 900));
        const shareToken = 'shr_' + Math.random().toString(36).substr(2,8);
        const shareUrl   = CONFIG.replayBase + '/' + shareToken;

        document.getElementById('frm-share-url').textContent = shareUrl;
        document.getElementById('frm-share-result').classList.add('show');
        btn.innerHTML = '✓ Link generated';
        btn.style.background = 'rgba(34,197,94,0.12)';
        btn.style.borderColor = 'rgba(34,197,94,0.3)';
        btn.style.color = '#22c55e';
        showToast('🔗 Shareable link ready — copied to clipboard');
        navigator.clipboard?.writeText(shareUrl).catch(() => {});

      } catch(err) {
        btn.disabled  = false;
        btn.innerHTML = '🔗 Save &amp; get shareable link';
        showToast('⚠ Failed — try again');
      }
    },

    copyLink() {
      const url = document.getElementById('frm-share-url').textContent;
      navigator.clipboard?.writeText(url).then(() => showToast('✓ Link copied'));
      const btn = document.querySelector('.frm-copy-btn');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500); }
    },

    discard() {
      closeModal();
      showToast('Recording discarded');
    },
  };

  // ── KEYBOARD SHORTCUT ────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const s = CONFIG.shortcut;
    if (e.key.toLowerCase() === s.key &&
        (s.meta ? (e.metaKey || e.ctrlKey) : true) &&
        (s.shift ? e.shiftKey : true)) {
      e.preventDefault();
      handlePillClick();
    }
  });

  // ── TOAST ─────────────────────────────────────────────────
  let toastTimeout = null;
  function showToast(msg) {
    const toast = document.getElementById('forge-rec-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // ── INIT ─────────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildPill();
    buildModal();
    buildToast();

    // Pre-load rrweb silently in background
    loadRrweb(() => {
      console.log('[ForgeRecorder] Ready — press ⌘+Shift+R or click the pill to record');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
