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

  function updateViewAlternativesButton(count) {
    if (!viewBtn) return;
    const label = count > 0 ? `View all ${count} responses →` : 'View responses →';
    viewBtn.textContent = label;
  }

  updateViewAlternativesButton(0);

  function show(data = {}) {
    history = Array.isArray(data?.history) ? [...data.history] : history;
    paneCount = Number.isFinite(data?.paneCount) ? Math.max(0, data.paneCount) : 0;
    updateViewAlternativesButton(paneCount);
    renderThread();
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
    updateViewAlternativesButton(paneCount);
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

  viewBtn?.addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.setWorkspaceMode) {
      window.electronAPI.setWorkspaceMode('compare');
    }
    if (window.electronAPI && window.electronAPI.hideFocusedOverlay) {
      window.electronAPI.hideFocusedOverlay();
    }
  });

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
      });
    }
    if (window.electronAPI && window.electronAPI.onFocusedOverlayHide) {
      window.electronAPI.onFocusedOverlayHide(() => {
        hide();
      });
    }
  });
})();
