const crypto = require('crypto');

const ProviderRunState = Object.freeze({
    WAITING: 'waiting',
    RUNNING: 'running',
    RECEIVED: 'received',
    NEEDS_SIGNIN: 'needs_signin',
    TIMED_OUT: 'timed_out',
    ERROR: 'error'
});

class IncomingRunStore {
    constructor({ providerTimeoutMs = 90000, runTtlMs = 30 * 60 * 1000 } = {}) {
        this.providerTimeoutMs = providerTimeoutMs;
        this.runTtlMs = runTtlMs;
        this.runs = new Map();
    }

    static normalizeProviderId(value = '') {
        return String(value || '').trim().toLowerCase();
    }

    static sortProviders(providers) {
        return [...providers].sort((a, b) => Number(a.paneIndex) - Number(b.paneIndex));
    }

    createRun({ prompt, providers }) {
        const runId = `incoming-v2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        const normalizedProviders = (providers || []).map((provider, index) => ({
            providerId: IncomingRunStore.normalizeProviderId(provider.providerId),
            paneIndex: Number.isFinite(provider.paneIndex) ? provider.paneIndex : index,
            tool: provider.tool || provider.displayName || `Provider ${index + 1}`,
            displayName: provider.displayName || provider.tool || `Provider ${index + 1}`,
            icon: provider.icon || '🤖',
            status: ProviderRunState.WAITING,
            responseText: '',
            receivedAt: null,
            errorMessage: '',
            startTs: 0,
            lastCaptureHash: null,
            rawResponseHash: '',
            providerModel: '',
            providerRequestId: '',
            providerTimestamp: null,
            nativeSourceUrl: '',
            captureSource: '',
            verbatimModeLabel: ''
        }));

        const run = {
            runId,
            prompt: String(prompt || ''),
            createdAt: now,
            dispatchStartedAt: 0,
            lastTouchedAt: now,
            providers: new Map(normalizedProviders.map((p) => [p.providerId, p]))
        };
        this.runs.set(runId, run);
        return run;
    }

    getRun(runId) {
        return this.runs.get(runId) || null;
    }

    listProviders(run) {
        return IncomingRunStore.sortProviders(Array.from(run.providers.values()));
    }

    serializeRun(run) {
        const now = Date.now();
        this.applyTimeouts(run, now);
        run.lastTouchedAt = now;
        return {
            success: true,
            runId: run.runId,
            createdAt: run.createdAt,
            providers: this.listProviders(run)
        };
    }

    prune(now = Date.now()) {
        for (const [runId, run] of this.runs.entries()) {
            const lastTouchedAt = Number(run.lastTouchedAt || run.createdAt || now);
            if ((now - lastTouchedAt) > this.runTtlMs) {
                this.runs.delete(runId);
            }
        }
    }

    applyTimeouts(run, now = Date.now()) {
        run.providers.forEach((provider) => {
            if (provider.status !== ProviderRunState.RUNNING) return;
            const startedAt = Number(provider.startTs || run.dispatchStartedAt || run.createdAt || now);
            if ((now - startedAt) >= this.providerTimeoutMs) {
                provider.status = ProviderRunState.TIMED_OUT;
                provider.errorMessage = 'No response received. Connection may be required.';
            }
        });
    }

    markNeedsSignin(run, providerId, message = 'Needs sign-in') {
        const provider = run.providers.get(IncomingRunStore.normalizeProviderId(providerId));
        if (!provider) return false;
        provider.status = ProviderRunState.NEEDS_SIGNIN;
        provider.errorMessage = message;
        provider.startTs = 0;
        run.lastTouchedAt = Date.now();
        return true;
    }

    markRunning(run, providerId, startedAt = Date.now()) {
        const provider = run.providers.get(IncomingRunStore.normalizeProviderId(providerId));
        if (!provider) return false;
        provider.status = ProviderRunState.RUNNING;
        provider.errorMessage = '';
        provider.startTs = startedAt;
        run.lastTouchedAt = startedAt;
        return true;
    }

    markError(run, providerId, message = 'Failed') {
        const provider = run.providers.get(IncomingRunStore.normalizeProviderId(providerId));
        if (!provider) return false;
        provider.status = ProviderRunState.ERROR;
        provider.errorMessage = message;
        run.lastTouchedAt = Date.now();
        return true;
    }

    applyCapture(run, { providerId, response, timestamp, metadata = {} }) {
        const key = IncomingRunStore.normalizeProviderId(providerId);
        const provider = run.providers.get(key);
        if (!provider) return { applied: false, reason: 'provider_not_found' };

        const captureTs = Number(timestamp || Date.now());
        if (run.dispatchStartedAt > 0 && captureTs < run.dispatchStartedAt) {
            return { applied: false, reason: 'capture_before_dispatch' };
        }

        const text = String(response || '');
        if (!text.trim()) {
            return { applied: false, reason: 'empty_capture' };
        }

        const captureHash = crypto.createHash('sha1').update(text).digest('hex');
        if (provider.lastCaptureHash && provider.lastCaptureHash === captureHash) {
            return { applied: false, reason: 'duplicate_capture' };
        }

        const existingLen = (provider.responseText || '').length;
        const nextLen = text.length;
        if (provider.status === ProviderRunState.RECEIVED && nextLen < existingLen) {
            return { applied: false, reason: 'shorter_than_existing' };
        }

        provider.status = ProviderRunState.RECEIVED;
        provider.responseText = text;
        provider.receivedAt = captureTs;
        provider.errorMessage = '';
        provider.lastCaptureHash = captureHash;
        provider.rawResponseHash = crypto.createHash('sha256').update(text).digest('hex');
        provider.providerModel = String(metadata.providerModel || provider.providerModel || '');
        provider.providerRequestId = String(metadata.providerRequestId || provider.providerRequestId || '');
        provider.providerTimestamp = metadata.providerTimestamp || provider.providerTimestamp || null;
        provider.nativeSourceUrl = String(metadata.nativeSourceUrl || provider.nativeSourceUrl || '');
        provider.captureSource = String(metadata.captureSource || provider.captureSource || '');
        provider.verbatimModeLabel = String(metadata.verbatimModeLabel || provider.verbatimModeLabel || '');
        run.lastTouchedAt = Date.now();
        return { applied: true };
    }
}

module.exports = {
    IncomingRunStore,
    ProviderRunState
};
