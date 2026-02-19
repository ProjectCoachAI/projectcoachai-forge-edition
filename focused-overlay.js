(function() {
  const root = document.getElementById('focusedRoot');
  const input = document.getElementById('focusedInput');
  const sendBtn = document.getElementById('focusedSend');
  const viewBtn = document.getElementById('focusedViewBtn');
  const closeBtn = document.getElementById('focusedClose');
  const counter = document.getElementById('focusedCounter');
  let history = [];
  const MAX_HISTORY_ITEMS = 40;
  let paneCount = 0;
  let hasSentPrompt = false;
  const TOOL_ICON_MAP = {
    claude: '🧠',
    chatgpt: '💬',
    gemini: '🤖',
    perplexity: '🔍',
    copilot: '🧭'
  };

  console.log('✨ [Focused Mode] focused-overlay.js v2026-02-14 loaded');

  function formatToolLabel(toolKey) {
    if (!toolKey) return 'AI';
    return toolKey
      .toString()
      .replace(/[-_]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  function buildPanesFromResponseStates(stateResult) {
    if (!stateResult) return [];
    const candidateStates =
      (stateResult.available && Array.isArray(stateResult.available.any) && stateResult.available.any.length > 0)
        ? stateResult.available.any
        : Array.isArray(stateResult.states)
          ? stateResult.states
          : [];
    const seenTools = new Set();
    const panes = [];

    candidateStates.forEach(state => {
      const content = state?.content?.trim();
      const aiToolKey = (state?.aiTool || state?.tool || '').toLowerCase();
      if (!aiToolKey || !content || seenTools.has(aiToolKey)) {
        return;
      }
      seenTools.add(aiToolKey);

      panes.push({
        tool: state?.tool || formatToolLabel(aiToolKey),
        icon: state?.icon || TOOL_ICON_MAP[aiToolKey] || '🤖',
        response: content,
        html: state?.html || content,
        hasResponse: true,
        source: 'focused',
        metadata: {
          timestamp: state?.timestamp,
          status: state?.status,
          origin: 'getResponseStates'
        }
      });
    });

    return panes;
  }

  function renderThread() {
    const prompts = history.filter(h => h.role === 'user').length;
    if (counter) counter.textContent = `Reports generated: ${prompts}`;
  }

  function updateViewButtonState() {
    if (!viewBtn) return;
    const ready = hasSentPrompt;
    viewBtn.textContent = ready ? 'Generate Forge Report →' : 'Send a prompt first';
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
    hasSentPrompt = false;
    updateViewButtonState();
  }

  sendBtn?.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;
    try {
      history = [];
      renderThread();
      updateViewButtonState();
      if (window.electronAPI && window.electronAPI.focusedOverlaySend) {
        await window.electronAPI.focusedOverlaySend(text);
        hasSentPrompt = true;
        updateViewButtonState();
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
    hasSentPrompt = false;
  });

  console.log('🔍 [Focused Mode] viewBtn exists', !!viewBtn);
  viewBtn?.addEventListener('click', async () => {
    console.log('🔘 [Focused Mode] View all responses clicked');
    if (window.electronAPI?.logFocusedOverlay) {
      window.electronAPI.logFocusedOverlay('View all responses clicked');
    }
    viewBtn.classList.add('active');
    showFocusedToast('Forging your report…');
    try {
      await runFocusedSynthesis();
    } catch (error) {
      console.error('❌ [Focused Mode] Failed to run synthesis:', error);
      if (window.electronAPI?.logFocusedOverlay) {
        const description = error?.message || (typeof error === 'string' ? error : 'Unknown synthesis error');
        window.electronAPI.logFocusedOverlay(`Synthesis error: ${description}`);
      }
      showFocusedToast('Report generation failed');
      viewBtn.classList.remove('active');
    }
  });

  async function runFocusedSynthesis() {
    if (!window.electronAPI || !window.electronAPI.openSynthesisView) {
      console.warn('⚠️ [Focused Mode] Synthesis API not available');
      return;
    }

    if (!hasSentPrompt) {
      alert('Send a prompt before generating the Forge Report.');
      return;
    }

    const latestUser = [...history]
      .reverse()
      .find(entry => entry.role === 'user' && entry.content);

    const payload = {
      prompt: latestUser?.content || '',
      focusedMode: true,
      initialModes: ['bestof'],
      focusedMetadata: {
        paneCount,
        historyLength: history.length
      }
    };

    if (window.electronAPI?.captureFocusedPaneResponses) {
      try {
        console.log('🎯 [Focused Mode] Triggering on-demand capture of pane responses...');
        const captureResult = await window.electronAPI.captureFocusedPaneResponses();
        console.log('🎯 [Focused Mode] Capture result:', captureResult);
        if (captureResult && captureResult.count > 0) {
          showFocusedToast(`Captured responses from ${captureResult.count} AI tool${captureResult.count === 1 ? '' : 's'}`);
        } else {
          console.warn('⚠️ [Focused Mode] No responses captured. Panes may still be loading.');
          showFocusedToast('No responses captured yet — wait for panes to finish loading');
        }
      } catch (error) {
        console.warn('⚠️ [Focused Mode] Capture failed:', error);
      }
    } else if (window.electronAPI?.refreshStoredPaneResponses) {
      try {
        await window.electronAPI.refreshStoredPaneResponses();
        const summary = await window.electronAPI.getStoredResponsesSummary();
        console.log('🎯 [Focused Mode] Fallback stored responses summary:', summary);
        if (summary.count > 0) {
          showFocusedToast(`Found responses from ${summary.count} AI tool${summary.count === 1 ? '' : 's'}`);
        }
      } catch (error) {
        console.warn('⚠️ [Focused Mode] Fallback refresh failed:', error);
      }
    }

    console.log('🎯 [Focused Mode] Running focused synthesis with payload:', payload);

    await window.electronAPI.openSynthesisView(payload);
    if (window.electronAPI?.logFocusedOverlay) {
      window.electronAPI.logFocusedOverlay('Focused synthesis request sent to main process');
    }
    if (window.electronAPI && window.electronAPI.hideFocusedOverlay) {
      window.electronAPI.hideFocusedOverlay();
    }
    hasSentPrompt = false;
    updateViewButtonState();
  }

  function buildFocusedComparisonData(preloadedPanes) {
    let panes = [];
    if (Array.isArray(preloadedPanes) && preloadedPanes.length > 0) {
      panes = preloadedPanes.map(pane => ({
        tool: pane.tool || 'AI',
        icon: pane.icon || '🤖',
        response: pane.response || '',
        html: pane.html || pane.response || '',
        hasResponse: Boolean(pane.response && pane.response.trim()),
        source: pane.source || 'focused',
        metadata: pane.metadata || {}
      }));
    } else {
      const aiMessages = history.filter(entry => entry.role === 'ai' && entry.content?.trim());
      const uniqueResponses = new Map();
      aiMessages.forEach(entry => {
        const key = (entry.aiSource || 'AI').trim() || 'AI';
        uniqueResponses.set(key, entry.content);
      });

      panes = Array.from(uniqueResponses.entries()).map(([tool, response]) => ({
        tool,
        response: response || '',
        html: response || '',
        hasResponse: Boolean(response && response.trim()),
        source: 'focused'
      }));
    }

    const latestUser = [...history]
      .reverse()
      .find(entry => entry.role === 'user' && entry.content);
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
