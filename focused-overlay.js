(function() {
  const root = document.getElementById('focusedRoot');
  const thread = document.getElementById('focusedThread');
  const input = document.getElementById('focusedInput');
  const sendBtn = document.getElementById('focusedSend');
  const viewBtn = document.getElementById('focusedViewBtn');
  const closeBtn = document.getElementById('focusedClose');
  const counter = document.getElementById('focusedCounter');
  let history = [];
  const MAX_HISTORY_ITEMS = 40;
  let paneCount = 0;

  function renderThread() {
    if (!thread) return;
    if (history.length === 0) {
      thread.innerHTML = '<div class="empty">Start a focused conversation below.</div>';
      counter.textContent = 'Syntheses triggered: 0';
      return;
    }
    thread.innerHTML = '';
    history.slice(-MAX_HISTORY_ITEMS).forEach(entry => {
      const msg = document.createElement('div');
      msg.className = 'message';
      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = entry.role === 'user' ? '👤' : '🤖';
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      const meta = document.createElement('div');
      meta.className = 'meta';
      const source = document.createElement('span');
      source.textContent = entry.role === 'user' ? 'You' : `AI • ${entry.aiSource || 'AI'}`;
      const stamp = document.createElement('span');
      stamp.textContent = entry.timestamp || '';
      meta.appendChild(source);
      meta.appendChild(stamp);
      const content = document.createElement('div');
      content.innerHTML = entry.content || '';
      bubble.appendChild(meta);
      bubble.appendChild(content);
      msg.appendChild(avatar);
      msg.appendChild(bubble);
      thread.appendChild(msg);
    });
    const prompts = history.filter(h => h.role === 'user').length;
    counter.textContent = `Syntheses triggered: ${prompts}`;
  }

  function getCapturedAIResponseCount() {
    return history.filter(entry => entry.role === 'ai' && entry.content?.trim()).length;
  }

  function updateViewButtonState() {
    if (!viewBtn) return;
    const aiCount = getCapturedAIResponseCount();
    const ready = aiCount >= 2;
    const label = ready
      ? `View all ${aiCount} responses →`
      : aiCount > 0
        ? `Waiting for more responses (${aiCount}/2 captured)`
        : 'Waiting for AI responses...';
    viewBtn.textContent = label;
    viewBtn.disabled = !ready;
    viewBtn.classList.toggle('disabled', !ready);
    viewBtn.setAttribute('aria-disabled', (!ready).toString());
  }

  updateViewButtonState();

  function show(data = {}) {
    history = Array.isArray(data?.history) ? [...data.history] : history;
    paneCount = Number.isFinite(data?.paneCount) ? Math.max(0, data.paneCount) : 0;
    renderThread();
    updateViewButtonState();
    if (root) {
      root.classList.add('visible');
    }
  }

  function hide() {
    if (root) {
      root.classList.remove('visible');
    }
    input.value = '';
    paneCount = 0;
    updateViewButtonState();
  }

  sendBtn?.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;
    try {
      if (window.electronAPI && window.electronAPI.focusedOverlaySend) {
        await window.electronAPI.focusedOverlaySend(text);
      }
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });

  closeBtn?.addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.hideFocusedOverlay) {
      window.electronAPI.hideFocusedOverlay();
    }
  });

  console.log('🔍 [Focused Mode] viewBtn exists', !!viewBtn);
  viewBtn?.addEventListener('click', async () => {
    console.log('🔘 [Focused Mode] View all responses clicked');
    if (window.electronAPI?.logFocusedOverlay) {
      window.electronAPI.logFocusedOverlay('View all responses clicked');
    }
    viewBtn.classList.add('active');
    showFocusedToast('Focused synthesis triggered');
    try {
      await runFocusedSynthesis();
    } catch (error) {
      console.error('❌ [Focused Mode] Failed to run synthesis:', error);
      if (window.electronAPI?.logFocusedOverlay) {
        const description = error?.message || (typeof error === 'string' ? error : 'Unknown synthesis error');
        window.electronAPI.logFocusedOverlay(`Synthesis error: ${description}`);
      }
      showFocusedToast('Focused synthesis failed');
      viewBtn.classList.remove('active');
    }
  });

  async function runFocusedSynthesis() {
    if (!window.electronAPI || !window.electronAPI.openSynthesisView) {
      console.warn('⚠️ [Focused Mode] Synthesis API not available');
      return;
    }

    const payload = buildFocusedComparisonData();
    if (!payload.panes.length) {
      alert('No AI responses captured yet');
      return;
    }
    if (window.electronAPI?.logFocusedOverlay) {
      window.electronAPI.logFocusedOverlay(`Focused synthesis payload ready (panes: ${payload.panes.length})`);
    }
    console.log('🎯 [Focused Mode] Running focused synthesis with payload:', payload);

    await window.electronAPI.openSynthesisView(payload);
    if (window.electronAPI?.logFocusedOverlay) {
      window.electronAPI.logFocusedOverlay('Focused synthesis request sent to main process');
    }
    if (window.electronAPI && window.electronAPI.hideFocusedOverlay) {
      window.electronAPI.hideFocusedOverlay();
    }
  }

  function buildFocusedComparisonData() {
    const aiMessages = history.filter(entry => entry.role === 'ai' && entry.content?.trim());
    const uniqueResponses = new Map();
    aiMessages.forEach(entry => {
      const key = (entry.aiSource || 'AI').trim() || 'AI';
      uniqueResponses.set(key, entry.content);
    });

    const panes = Array.from(uniqueResponses.entries()).map(([tool, response]) => ({
      tool,
      response: response || '',
      html: response || '',
      hasResponse: Boolean(response && response.trim()),
      source: 'focused'
    }));

    const latestUser = [...history].reverse().find(entry => entry.role === 'user' && entry.content);
    return {
      panes,
      prompt: latestUser?.content || '',
      focusedMode: true,
      initialModes: ['bestof'],
      focusedMetadata: {
        paneCount,
        historyLength: history.length
      }
    };
  }

  function showFocusedToast(message) {
    console.log('🔔 [Focused Mode] Toast', message);
    if (window.electronAPI?.logFocusedOverlay) {
      window.electronAPI.logFocusedOverlay(`Toast: ${message}`);
    }
    const toast = document.getElementById('focusedToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hide');
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.classList.remove('hide'), 200);
      viewBtn?.classList.remove('active');
    }, 2200);
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (window.electronAPI && window.electronAPI.onFocusedOverlayShow) {
      window.electronAPI.onFocusedOverlayShow(payload => {
        show(payload?.data);
      });
    }
    if (window.electronAPI && window.electronAPI.onFocusedUserMessage) {
      window.electronAPI.onFocusedUserMessage(entry => {
        history.push({
          role: entry?.role || 'user',
          aiSource: entry?.aiSource || 'You',
          content: entry?.content || '',
          timestamp: entry?.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
        });
        renderThread();
      updateViewButtonState();
      });
    }
    if (window.electronAPI && window.electronAPI.onFocusedResponseCaptured) {
      window.electronAPI.onFocusedResponseCaptured(entry => {
        history.push({
          role: 'ai',
          aiSource: entry?.aiTool || 'AI',
          content: entry?.response || '',
          timestamp: entry?.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString()
        });
        renderThread();
      updateViewButtonState();
      });
    }
    if (window.electronAPI && window.electronAPI.onFocusedOverlayHide) {
      window.electronAPI.onFocusedOverlayHide(() => {
        hide();
      });
    }
  });
})();
