const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ProviderRunState = Object.freeze({
    WAITING: 'waiting',
    RUNNING: 'running',
    RECEIVED: 'received',
    NEEDS_SIGNIN: 'needs_signin',
    TIMED_OUT: 'timed_out',
    ERROR: 'error'
});

function looksContaminated(text = '') {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!normalized) return false;
    const locationCount = (normalized.match(/location/g) || []).length;
    return (
        normalized.includes('window._oai_')
        || normalized.includes('self.__next_f')
        || normalized.includes('$$typeof')
        || normalized.includes('@keyframes')
        || normalized.includes('requestanimationframe')
        || normalized.includes('recents')
        || normalized.includes('hide details')
        || normalized.includes('deep think search')
        || normalized.includes('ai-generated, for reference only')
        || normalized.includes('one more step before you proceed')
        || normalized.includes('gemini can make mistakes')
        || normalized.includes('your privacy and gemini')
        || locationCount >= 6
    );
}

class IncomingRunStore {
    constructor({
        providerTimeoutMs = 90000,
        runTtlMs = 30 * 60 * 1000,
        storageDir
    } = {}) {
        this.providerTimeoutMs = providerTimeoutMs;
        this.runTtlMs = runTtlMs;
        this.runs = new Map();
        this.appliedEventIds = new Set();

        const baseStorageDir = storageDir || path.join(process.cwd(), '.incoming-v3');
        this.storageDir = baseStorageDir;
        this.journalDir = path.join(baseStorageDir, 'journal');
        this.chunksDir = path.join(baseStorageDir, 'chunks');
        this.journalPath = path.join(this.journalDir, 'events.jsonl');

        this._ensureStorage();
        this._recoverFromJournal();
    }

    static normalizeProviderId(value = '') {
        return String(value || '').trim().toLowerCase();
    }

    static sortProviders(providers) {
        return [...providers].sort((a, b) => Number(a.paneIndex) - Number(b.paneIndex));
    }

    _ensureStorage() {
        fs.mkdirSync(this.journalDir, { recursive: true });
        fs.mkdirSync(this.chunksDir, { recursive: true });
        if (!fs.existsSync(this.journalPath)) {
            fs.writeFileSync(this.journalPath, '', 'utf8');
        }
    }

    _appendEventDurable(event) {
        const line = `${JSON.stringify(event)}\n`;
        const fd = fs.openSync(this.journalPath, 'a');
        try {
            fs.writeSync(fd, line, null, 'utf8');
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
    }

    _eventId(prefix, runId, providerId = '', discriminator = '') {
        const hash = crypto
            .createHash('sha1')
            .update(`${prefix}|${runId}|${providerId}|${discriminator}`)
            .digest('hex')
            .slice(0, 12);
        return `${prefix}-${Date.now()}-${hash}`;
    }

    _chunkPath(chunkHash) {
        return path.join(this.chunksDir, `${chunkHash}.txt`);
    }

    _writeChunk(content) {
        const text = String(content || '');
        const chunkHash = crypto.createHash('sha256').update(text).digest('hex');
        const chunkPath = this._chunkPath(chunkHash);
        if (!fs.existsSync(chunkPath)) {
            const tmpPath = `${chunkPath}.tmp-${process.pid}-${Date.now()}`;
            fs.writeFileSync(tmpPath, text, 'utf8');
            fs.renameSync(tmpPath, chunkPath);
        }
        return { chunkHash, chunkLength: text.length };
    }

    _readChunk(chunkHash) {
        try {
            const chunkPath = this._chunkPath(chunkHash);
            if (!fs.existsSync(chunkPath)) return '';
            return String(fs.readFileSync(chunkPath, 'utf8') || '');
        } catch (_) {
            return '';
        }
    }

    _baseProvider(provider, index = 0) {
        return {
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
        };
    }

    _makeRunFromEventPayload(payload = {}, ts = Date.now()) {
        const providers = Array.isArray(payload.providers) ? payload.providers : [];
        const normalizedProviders = providers.map((provider, index) => this._baseProvider(provider, index));
        return {
            runId: String(payload.runId || ''),
            prompt: String(payload.prompt || ''),
            createdAt: Number(payload.createdAt || ts),
            dispatchStartedAt: Number(payload.dispatchStartedAt || 0),
            lastTouchedAt: Number(ts || Date.now()),
            providers: new Map(normalizedProviders.map((p) => [p.providerId, p]))
        };
    }

    _applyEvent(event, { recovering = false } = {}) {
        const eventId = String(event?.eventId || '');
        if (!eventId) return { applied: false, reason: 'missing_event_id' };
        if (this.appliedEventIds.has(eventId)) {
            return { applied: false, reason: 'duplicate_event' };
        }

        const type = String(event.type || '');
        const runId = String(event.runId || '');
        const ts = Number(event.ts || Date.now());
        const payload = event.payload || {};

        if (type === 'RUN_CREATED') {
            const run = this._makeRunFromEventPayload({ ...payload, runId }, ts);
            if (!run.runId) return { applied: false, reason: 'missing_run_id' };
            if (!this.runs.has(run.runId)) {
                this.runs.set(run.runId, run);
            }
            this.appliedEventIds.add(eventId);
            return { applied: true };
        }

        const run = this.runs.get(runId);
        if (!run) return { applied: false, reason: 'run_not_found' };

        const providerId = IncomingRunStore.normalizeProviderId(event.providerId || payload.providerId || '');
        const provider = providerId ? run.providers.get(providerId) : null;

        switch (type) {
            case 'RUN_DISPATCH_STARTED': {
                run.dispatchStartedAt = Number(payload.dispatchStartedAt || ts);
                run.lastTouchedAt = ts;
                break;
            }
            case 'PROVIDER_RUNNING': {
                if (!provider) return { applied: false, reason: 'provider_not_found' };
                provider.status = ProviderRunState.RUNNING;
                provider.errorMessage = '';
                provider.startTs = Number(payload.startedAt || ts);
                run.lastTouchedAt = ts;
                break;
            }
            case 'PROVIDER_NEEDS_SIGNIN': {
                if (!provider) return { applied: false, reason: 'provider_not_found' };
                provider.status = ProviderRunState.NEEDS_SIGNIN;
                provider.errorMessage = String(payload.message || 'Needs sign-in');
                provider.startTs = 0;
                run.lastTouchedAt = ts;
                break;
            }
            case 'PROVIDER_ERROR': {
                if (!provider) return { applied: false, reason: 'provider_not_found' };
                provider.status = ProviderRunState.ERROR;
                provider.errorMessage = String(payload.message || 'Failed');
                run.lastTouchedAt = ts;
                break;
            }
            case 'PROVIDER_CAPTURE_PREPARED': {
                if (!provider) return { applied: false, reason: 'provider_not_found' };
                provider._preparedCapture = {
                    captureTs: Number(payload.captureTs || ts),
                    chunkHash: String(payload.chunkHash || ''),
                    metadata: payload.metadata || {}
                };
                run.lastTouchedAt = ts;
                break;
            }
            case 'PROVIDER_CAPTURE_COMMITTED': {
                if (!provider) return { applied: false, reason: 'provider_not_found' };
                const chunkHash = String(payload.chunkHash || provider?._preparedCapture?.chunkHash || '');
                const response = this._readChunk(chunkHash);
                if (!response.trim()) {
                    if (!recovering) return { applied: false, reason: 'empty_chunk' };
                    break;
                }
                const captureTs = Number(payload.captureTs || provider?._preparedCapture?.captureTs || ts);
                const metadata = payload.metadata || provider?._preparedCapture?.metadata || {};
                const captureHash = crypto.createHash('sha1').update(response).digest('hex');
                provider.status = ProviderRunState.RECEIVED;
                provider.responseText = response;
                provider.receivedAt = captureTs;
                provider.errorMessage = '';
                provider.lastCaptureHash = captureHash;
                provider.rawResponseHash = chunkHash;
                provider.providerModel = String(metadata.providerModel || provider.providerModel || '');
                provider.providerRequestId = String(metadata.providerRequestId || provider.providerRequestId || '');
                provider.providerTimestamp = metadata.providerTimestamp || provider.providerTimestamp || null;
                provider.nativeSourceUrl = String(metadata.nativeSourceUrl || provider.nativeSourceUrl || '');
                provider.captureSource = String(metadata.captureSource || provider.captureSource || '');
                provider.verbatimModeLabel = String(metadata.verbatimModeLabel || provider.verbatimModeLabel || '');
                delete provider._preparedCapture;
                run.lastTouchedAt = ts;
                break;
            }
            default:
                return { applied: false, reason: 'unknown_event_type' };
        }

        this.appliedEventIds.add(eventId);
        return { applied: true };
    }

    _dispatchEvent({ type, runId, providerId = '', payload = {}, ts = Date.now(), eventId }) {
        const evt = {
            eventId: eventId || this._eventId(type.toLowerCase(), runId, providerId, JSON.stringify(payload).slice(0, 120)),
            type,
            runId,
            providerId: providerId || undefined,
            ts,
            payload
        };
        this._appendEventDurable(evt);
        return this._applyEvent(evt, { recovering: false });
    }

    _recoverFromJournal() {
        try {
            if (!fs.existsSync(this.journalPath)) return;
            const content = String(fs.readFileSync(this.journalPath, 'utf8') || '');
            if (!content.trim()) return;
            const lines = content.split('\n').filter(Boolean);
            for (const line of lines) {
                try {
                    const event = JSON.parse(line);
                    this._applyEvent(event, { recovering: true });
                } catch (_) {
                    // Skip malformed lines to keep recovery resilient.
                }
            }
        } catch (_) {
            // If recovery fails, keep process alive with an empty in-memory state.
        }
    }

    createRun({ prompt, providers }) {
        const runId = `incoming-v3-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();
        this._dispatchEvent({
            type: 'RUN_CREATED',
            runId,
            ts: now,
            payload: {
                runId,
                prompt: String(prompt || ''),
                createdAt: now,
                providers: (providers || []).map((p) => ({
                    providerId: IncomingRunStore.normalizeProviderId(p.providerId),
                    paneIndex: Number.isFinite(p.paneIndex) ? p.paneIndex : 0,
                    tool: p.tool || p.displayName || 'Provider',
                    displayName: p.displayName || p.tool || 'Provider',
                    icon: p.icon || '🤖'
                }))
            }
        });
        return this.getRun(runId);
    }

    getRun(runId) {
        return this.runs.get(runId) || null;
    }

    listProviders(run) {
        return IncomingRunStore.sortProviders(Array.from(run.providers.values()));
    }

    getCommittedProviders(run) {
        return this.listProviders(run).filter((provider) => provider.status === ProviderRunState.RECEIVED);
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

    markDispatchStarted(run, startedAt = Date.now()) {
        if (!run?.runId) return false;
        const res = this._dispatchEvent({
            type: 'RUN_DISPATCH_STARTED',
            runId: run.runId,
            ts: startedAt,
            payload: { dispatchStartedAt: startedAt }
        });
        return !!res.applied;
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
        if (!run?.runId) return false;
        const res = this._dispatchEvent({
            type: 'PROVIDER_NEEDS_SIGNIN',
            runId: run.runId,
            providerId: IncomingRunStore.normalizeProviderId(providerId),
            payload: { message: String(message || 'Needs sign-in') }
        });
        return !!res.applied;
    }

    markRunning(run, providerId, startedAt = Date.now()) {
        if (!run?.runId) return false;
        const res = this._dispatchEvent({
            type: 'PROVIDER_RUNNING',
            runId: run.runId,
            providerId: IncomingRunStore.normalizeProviderId(providerId),
            ts: startedAt,
            payload: { startedAt }
        });
        return !!res.applied;
    }

    markError(run, providerId, message = 'Failed') {
        if (!run?.runId) return false;
        const res = this._dispatchEvent({
            type: 'PROVIDER_ERROR',
            runId: run.runId,
            providerId: IncomingRunStore.normalizeProviderId(providerId),
            payload: { message: String(message || 'Failed') }
        });
        return !!res.applied;
    }

    applyCapture(run, { providerId, response, timestamp, metadata = {} }) {
        if (!run?.runId) return { applied: false, reason: 'run_not_found' };
        const key = IncomingRunStore.normalizeProviderId(providerId);
        const provider = run.providers.get(key);
        if (!provider) return { applied: false, reason: 'provider_not_found' };

        const captureTs = Number(timestamp || Date.now());
        if (run.dispatchStartedAt > 0 && captureTs < run.dispatchStartedAt) {
            return { applied: false, reason: 'capture_before_dispatch' };
        }

        const text = String(response || '');
        if (!text.trim()) return { applied: false, reason: 'empty_capture' };

        const captureHash = crypto.createHash('sha1').update(text).digest('hex');
        if (provider.lastCaptureHash && provider.lastCaptureHash === captureHash) {
            return { applied: false, reason: 'duplicate_capture' };
        }

        const existingLen = (provider.responseText || '').length;
        const nextLen = text.length;
        if (provider.status === ProviderRunState.RECEIVED && nextLen < existingLen) {
            const existingContaminated = looksContaminated(provider.responseText || '');
            const nextContaminated = looksContaminated(text);
            const allowCleanerReplacement = existingContaminated && !nextContaminated && nextLen > 50;
            if (!allowCleanerReplacement) {
                return { applied: false, reason: 'shorter_than_existing' };
            }
        }

        const { chunkHash } = this._writeChunk(text);
        const preparedTs = captureTs;
        const preparedId = this._eventId('prepared', run.runId, key, `${chunkHash}:${captureTs}`);
        const committedId = this._eventId('committed', run.runId, key, `${chunkHash}:${captureTs}`);

        const prepared = this._dispatchEvent({
            type: 'PROVIDER_CAPTURE_PREPARED',
            runId: run.runId,
            providerId: key,
            ts: preparedTs,
            eventId: preparedId,
            payload: {
                providerId: key,
                captureTs,
                chunkHash,
                metadata
            }
        });
        if (!prepared.applied && prepared.reason !== 'duplicate_event') {
            return prepared;
        }

        return this._dispatchEvent({
            type: 'PROVIDER_CAPTURE_COMMITTED',
            runId: run.runId,
            providerId: key,
            ts: Date.now(),
            eventId: committedId,
            payload: {
                providerId: key,
                captureTs,
                chunkHash,
                metadata
            }
        });
    }
}

module.exports = {
    IncomingRunStore,
    ProviderRunState
};
