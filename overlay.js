(() => {
  const overlayRoot = document.getElementById('overlayRoot');
  const loadPromptPanel = document.getElementById('loadPromptPanel');
  const feedbackPanel = document.getElementById('feedbackPanel');
  const feedbackBody = document.getElementById('feedbackBody');
  const feedbackThanks = document.getElementById('feedbackThanks');
  const feedbackInput = document.getElementById('feedbackInput');
  const loadPromptList = document.getElementById('loadPromptList');
  const loadPromptSearch = document.getElementById('loadPromptSearch');
  const filterButtons = Array.from(document.querySelectorAll('.filter-btn'));
  const backdrop = document.getElementById('overlayBackdrop');
  let loadPromptData = { prompts: [], filter: 'all', searchQuery: '' };

  function setModeVisible(mode) {
    loadPromptPanel.classList.toggle('visible', mode === 'loadPrompt');
    feedbackPanel.classList.toggle('visible', mode === 'feedback');
  }

  function showOverlay(mode) {
    overlayRoot.classList.add('visible');
    setModeVisible(mode);
    if (mode === 'loadPrompt') {
      showLoadPrompt();
    } else if (mode === 'feedback') {
      showFeedbackModal();
    }
    overlayRoot.focus({ preventScroll: true });
  }

  function closeOverlayUI() {
    overlayRoot.classList.remove('visible');
    loadPromptPanel.classList.remove('visible');
    feedbackPanel.classList.remove('visible');
  }

  async function hideOverlay() {
    closeOverlayUI();
    if (window.electronAPI && window.electronAPI.hideOverlay) {
      await window.electronAPI.hideOverlay();
    }
  }

  async function showLoadPrompt() {
    loadPromptSearch.value = '';
    loadPromptData.searchQuery = '';
    filterButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.filter === 'all'));
    loadPromptData.filter = 'all';
    loadPromptList.innerHTML = '<div style="text-align:center;color:#9ca3af;">Loading prompts…</div>';
    await loadPromptsForModal();
    loadPromptSearch.focus({ preventScroll: true });
  }

  function setFilter(filter) {
    loadPromptData.filter = filter;
    filterButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    renderLoadPrompts();
  }

  function handleSearch() {
    loadPromptData.searchQuery = loadPromptSearch.value.trim().toLowerCase();
    renderLoadPrompts();
  }

  async function loadPromptsForModal() {
    try {
      if (window.electronAPI && window.electronAPI.getPrompts) {
        const result = await window.electronAPI.getPrompts();
        if (result && result.success) {
          loadPromptData.prompts = result.prompts || [];
          renderLoadPrompts();
          return;
        }
      }
      loadPromptList.innerHTML = '<div style="text-align:center;color:#9ca3af;">Prompt library not available</div>';
    } catch (error) {
      console.error('❌ [Overlay] Error loading prompts:', error);
      loadPromptList.innerHTML = '<div style="text-align:center;color:#9ca3af;">Error loading prompts</div>';
    }
  }

  function renderLoadPrompts() {
    if (!Array.isArray(loadPromptData.prompts) || loadPromptData.prompts.length === 0) {
      loadPromptList.innerHTML = '<div style="text-align:center;color:#9ca3af;">You have no saved prompts.</div>';
      return;
    }

    let filtered = [...loadPromptData.prompts];
    if (loadPromptData.filter === 'favorites') {
      filtered = filtered.filter(p => p.isFavorite);
    } else if (loadPromptData.filter === 'recent') {
      filtered = filtered
        .sort((a, b) => {
          const aDate = new Date(a.lastUsed || a.createdAt).getTime();
          const bDate = new Date(b.lastUsed || b.createdAt).getTime();
          return bDate - aDate;
        })
        .slice(0, 10);
    }

    if (loadPromptData.searchQuery) {
      filtered = filtered.filter(p =>
        p.text.toLowerCase().includes(loadPromptData.searchQuery)
      );
    }

    if (filtered.length === 0) {
      loadPromptList.innerHTML = '<div style="text-align:center;color:#9ca3af;">No prompts match your search</div>';
      return;
    }

    loadPromptList.innerHTML = filtered.map(prompt => {
      const createdDate = new Date(prompt.createdAt);
      const lastUsed = prompt.lastUsed ? new Date(prompt.lastUsed) : null;
      const daysAgo = lastUsed ? Math.floor((Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24)) : null;
      const promptText = prompt.text.length > 120 ? prompt.text.slice(0, 120) + '…' : prompt.text;
      const usageLabel = `Used ${prompt.usageCount || 1}×`;
      const recencyLabel = lastUsed
        ? (daysAgo === 0 ? 'Today' : daysAgo === 1 ? '1d ago' : `${daysAgo}d ago`)
        : null;
      const createdLabel = createdDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const metaLabel = [usageLabel, recencyLabel, createdLabel].filter(Boolean).join(' • ');
      return `
        <div class="load-prompt-item">
          <div class="load-prompt-item-title-row">
            <div class="load-prompt-item-title">
              ${prompt.isFavorite ? '⭐' : ''}
              <span>${escapeHtml(promptText)}</span>
            </div>
            <button class="load-btn" data-prompt-id="${prompt.id}">Load</button>
          </div>
          <div class="load-prompt-item-meta">${metaLabel}</div>
        </div>
      `;
    }).join('');
    Array.from(loadPromptList.querySelectorAll('.load-btn')).forEach(btn => {
      btn.addEventListener('click', () => loadPromptIntoInput(btn.dataset.promptId));
    });
  }

  async function loadPromptIntoInput(promptId) {
    const prompt = loadPromptData.prompts.find(p => String(p.id) === String(promptId));
    if (!prompt) return;

    if (window.electronAPI && window.electronAPI.updatePrompt) {
      try {
        await window.electronAPI.updatePrompt({
          promptId,
          updates: {
            lastUsed: new Date().toISOString(),
            usageCount: (prompt.usageCount || 0) + 1
          }
        });
      } catch (error) {
        console.warn('⚠️ [Overlay] Could not update prompt usage:', error);
      }
    }

    try {
      // Fill the visible workspace input immediately (Compare / Forge / Quick)
      // so prompt loading is reliable even if pane-level injection fails.
      if (typeof window.applyLoadedPromptToWorkspaceInput === 'function') {
        window.applyLoadedPromptToWorkspaceInput(prompt.text);
      }

      let result;
      // Source of truth: always load into the visible workspace input
      // (Compare Ask Once / Forge bar / Quick input), then let main process
      // keep any pane-level behavior aligned as needed.
      if (window.electronAPI && window.electronAPI.loadPromptIntoWorkspace) {
        result = await window.electronAPI.loadPromptIntoWorkspace(prompt.text);
      } else if (window.electronAPI && window.electronAPI.loadPromptMultiPane) {
        result = await window.electronAPI.loadPromptMultiPane(prompt.text);
      } else if (window.electronAPI && window.electronAPI.loadPromptQuickChat) {
        result = await window.electronAPI.loadPromptQuickChat(prompt.text);
      } else {
        result = { success: false, error: 'Prompt load API unavailable' };
      }
      if (!result || !result.success) {
        console.warn('⚠️ [Overlay] Prompt load failed:', result);
      }
    } catch (error) {
      console.error('❌ [Overlay] Error sending prompt:', error);
    } finally {
      await hideOverlay();
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function showFeedbackModal() {
    feedbackBody.style.display = '';
    feedbackThanks.classList.remove('visible');
    feedbackInput.value = '';
    feedbackInput.focus();
  }

  function closeFeedbackModal() {
    feedbackPanel.classList.remove('visible');
    overlayRoot.classList.remove('visible');
  }

  async function submitFeedback() {
    const msg = (feedbackInput.value || '').trim();
    if (!msg) {
      feedbackInput.focus();
      return;
    }
    const btn = document.getElementById('feedbackSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      if (window.electronAPI && window.electronAPI.submitFeedback) {
        const result = await window.electronAPI.submitFeedback({ message: msg, source: 'electron-overlay' });
        if (result && result.success) {
          feedbackBody.style.display = 'none';
          feedbackThanks.classList.add('visible');
        } else {
          alert('Could not send: ' + (result?.error || 'Unknown error'));
        }
      }
    } catch (error) {
      alert('Could not send: ' + (error?.message || 'Unknown error'));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
    }
  }

  function initListeners() {
    document.getElementById('closeLoadPromptBtn').addEventListener('click', hideOverlay);
    document.getElementById('loadPromptCancel').addEventListener('click', hideOverlay);
    backdrop.addEventListener('click', hideOverlay);
    document.getElementById('filterAll').addEventListener('click', () => setFilter('all'));
    document.getElementById('filterFavorites').addEventListener('click', () => setFilter('favorites'));
    document.getElementById('filterRecent').addEventListener('click', () => setFilter('recent'));
    loadPromptSearch.addEventListener('input', handleSearch);
    document.getElementById('feedbackCloseBtn').addEventListener('click', closeFeedbackModal);
    document.getElementById('feedbackCancelBtn').addEventListener('click', closeFeedbackModal);
    document.getElementById('feedbackThanksBtn').addEventListener('click', hideOverlay);
    document.getElementById('feedbackSubmitBtn').addEventListener('click', submitFeedback);
    overlayRoot.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        hideOverlay();
      }
    });
  }

  window.electronAPI?.onOverlayShow(payload => {
    showOverlay(payload);
  });
  window.electronAPI?.onOverlayHide(() => {
    closeOverlayUI();
  });

  window.addEventListener('DOMContentLoaded', () => {
    initListeners();
  });
})();
