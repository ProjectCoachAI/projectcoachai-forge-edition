(() => {
  const REGISTRY_KEY = 'forgeDecisionRegistryV1';
  const LEGACY_THREADS_KEY = 'forgeRecentDecisionThreadsV1';
  const LEGACY_MODE_KEY = 'forgeDecisionIntentV1';

  function safeGet(key, fallback = '') {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, String(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function now() {
    return Date.now();
  }

  function defaultRegistry() {
    return {
      version: 1,
      sessions: {},
      recentOrder: [],
      activeSessionId: null
    };
  }

  function sanitizeStatus(status) {
    if (status === 'forged' || status === 'decision_ready' || status === 'collecting') return status;
    return 'collecting';
  }

  function sanitizeStage(stage) {
    if (stage === 'forge' || stage === 'decision' || stage === 'compare') return stage;
    return 'compare';
  }

  function stageFromLegacy(legacyStage) {
    if (legacyStage === 'forge') return 'forge';
    if (legacyStage === 'decision') return 'decision';
    return 'compare';
  }

  function statusFromStage(stage) {
    if (stage === 'forge') return 'forged';
    if (stage === 'decision') return 'decision_ready';
    return 'collecting';
  }

  function sanitizeSession(input) {
    const src = input && typeof input === 'object' ? input : {};
    const id = String(src.id || '').trim();
    if (!id) return null;
    const selectedTools = Array.isArray(src.selectedTools) ? src.selectedTools.map((t) => String(t || '').trim()).filter(Boolean) : [];
    const toolCount = Number(src.toolCount || selectedTools.length || 0);
    const prompt = String(src.prompt || '').trim();
    const status = sanitizeStatus(src.status);
    const currentStage = sanitizeStage(src.currentStage || stageFromStatus(status));
    const createdAt = Number(src.createdAt || now());
    const updatedAt = Number(src.updatedAt || now());
    const compare = src.compare && typeof src.compare === 'object'
      ? {
          responseIds: Array.isArray(src.compare.responseIds) ? src.compare.responseIds.map((idPart) => String(idPart || '').trim()).filter(Boolean) : [],
          receivedCount: Number(src.compare.receivedCount || 0)
        }
      : undefined;
    const decision = src.decision && typeof src.decision === 'object'
      ? {
          generated: Boolean(src.decision.generated),
          mode: src.decision.mode ? String(src.decision.mode) : undefined
        }
      : undefined;
    const forge = src.forge && typeof src.forge === 'object'
      ? {
          generated: Boolean(src.forge.generated),
          mode: src.forge.mode ? String(src.forge.mode) : undefined
        }
      : undefined;

    return {
      id,
      prompt,
      selectedTools,
      toolCount,
      status,
      currentStage,
      createdAt,
      updatedAt,
      compare,
      decision,
      forge
    };
  }

  function stageFromStatus(status) {
    if (status === 'forged') return 'forge';
    if (status === 'decision_ready') return 'decision';
    return 'compare';
  }

  function normalizeRegistry(input) {
    const base = defaultRegistry();
    const src = input && typeof input === 'object' ? input : {};
    const sessions = {};
    const srcSessions = src.sessions && typeof src.sessions === 'object' ? src.sessions : {};
    Object.keys(srcSessions).forEach((id) => {
      const sanitized = sanitizeSession(srcSessions[id]);
      if (sanitized) sessions[sanitized.id] = sanitized;
    });
    const recentOrder = Array.isArray(src.recentOrder) ? src.recentOrder.map((id) => String(id || '').trim()).filter((id) => Boolean(sessions[id])) : [];
    const activeSessionId = src.activeSessionId && sessions[src.activeSessionId] ? String(src.activeSessionId) : null;
    return {
      version: 1,
      sessions,
      recentOrder,
      activeSessionId
    };
  }

  function migrateLegacyThreads(registry) {
    const legacyRaw = safeGet(LEGACY_THREADS_KEY, '');
    if (!legacyRaw) return registry;
    const legacyThreads = safeParse(legacyRaw, []);
    if (!Array.isArray(legacyThreads) || legacyThreads.length === 0) return registry;

    const next = normalizeRegistry(registry);
    let changed = false;
    const legacyMode = safeGet(LEGACY_MODE_KEY, '');
    legacyThreads.forEach((thread) => {
      if (!thread || typeof thread !== 'object') return;
      const id = String(thread.id || '').trim();
      if (!id) return;
      const stage = stageFromLegacy(thread.stage);
      const status = statusFromStage(stage);
      const selectedTools = Array.isArray(thread.selectedTools) ? thread.selectedTools.map((t) => String(t || '').trim()).filter(Boolean) : [];
      const receivedCount = Object.values(thread.responseStates || {}).filter((value) => value === 'received').length;
      const session = sanitizeSession({
        id,
        prompt: String(thread.prompt || ''),
        selectedTools,
        toolCount: selectedTools.length,
        status,
        currentStage: stage,
        createdAt: Number(thread.updatedAt || now()),
        updatedAt: Number(thread.updatedAt || now()),
        compare: { responseIds: [], receivedCount },
        decision: stage === 'decision' || stage === 'forge' ? { generated: true, mode: thread.mode || legacyMode || undefined } : undefined,
        forge: stage === 'forge' ? { generated: true, mode: thread.mode || legacyMode || undefined } : undefined
      });
      if (!session) return;
      next.sessions[id] = session;
      next.recentOrder = [id, ...next.recentOrder.filter((entry) => entry !== id)];
      changed = true;
    });

    if (changed) {
      safeSet(REGISTRY_KEY, JSON.stringify(next));
    }
    return changed ? next : registry;
  }

  function getDecisionRegistry() {
    const raw = safeGet(REGISTRY_KEY, '');
    const parsed = safeParse(raw, defaultRegistry());
    const normalized = normalizeRegistry(parsed);
    return migrateLegacyThreads(normalized);
  }

  function saveDecisionRegistry(registry) {
    const normalized = normalizeRegistry(registry);
    safeSet(REGISTRY_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function getDecisionSession(sessionId) {
    const id = String(sessionId || '').trim();
    if (!id) return null;
    const registry = getDecisionRegistry();
    return registry.sessions[id] || null;
  }

  function upsertDecisionSession(inputSession) {
    const session = sanitizeSession(inputSession);
    if (!session) return null;
    const registry = getDecisionRegistry();
    const existing = registry.sessions[session.id];
    const merged = sanitizeSession({
      ...(existing || {}),
      ...session,
      compare: { ...((existing && existing.compare) || {}), ...((session && session.compare) || {}) },
      decision: { ...((existing && existing.decision) || {}), ...((session && session.decision) || {}) },
      forge: { ...((existing && existing.forge) || {}), ...((session && session.forge) || {}) },
      updatedAt: Number(session.updatedAt || now())
    });
    if (!merged) return null;
    registry.sessions[merged.id] = merged;
    registry.recentOrder = [merged.id, ...registry.recentOrder.filter((id) => id !== merged.id)];
    saveDecisionRegistry(registry);
    return merged;
  }

  function setActiveDecisionSession(sessionId) {
    const id = String(sessionId || '').trim();
    const registry = getDecisionRegistry();
    registry.activeSessionId = id && registry.sessions[id] ? id : null;
    saveDecisionRegistry(registry);
    return registry.activeSessionId;
  }

  function getRecentDecisionSessions(limit = 5) {
    const max = Math.max(0, Number(limit || 5));
    const registry = getDecisionRegistry();
    const sessions = registry.recentOrder
      .map((id) => registry.sessions[id])
      .filter(Boolean)
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
    return sessions.slice(0, max);
  }

  window.DecisionRegistry = {
    getDecisionRegistry,
    saveDecisionRegistry,
    getDecisionSession,
    upsertDecisionSession,
    setActiveDecisionSession,
    getRecentDecisionSessions
  };
})();
