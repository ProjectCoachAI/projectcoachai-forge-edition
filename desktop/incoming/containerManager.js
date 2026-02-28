class IncomingContainerManager {
    constructor({ getActivePanes, getVirtualProviders, sendPromptToPanes, normalizeProviderKey, dispatchProviders }) {
        this.getActivePanes = getActivePanes;
        this.getVirtualProviders = getVirtualProviders;
        this.sendPromptToPanes = sendPromptToPanes;
        this.normalizeProviderKey = normalizeProviderKey;
        this.dispatchProviders = dispatchProviders;
    }

    _listContainerSources() {
        const panes = this.getActivePanes() || [];
        if (panes.length > 0) {
            return panes.map((pane, index) => ({
                providerId: this.normalizeProviderKey(pane?.tool?.id || pane?.tool?.name),
                paneIndex: index,
                tool: pane?.tool?.name || `Provider ${index + 1}`,
                displayName: pane?.tool?.name || `Provider ${index + 1}`,
                icon: pane?.tool?.icon || '🤖'
            }));
        }
        const virtualProviders = (typeof this.getVirtualProviders === 'function' ? this.getVirtualProviders() : []) || [];
        return virtualProviders.map((provider, index) => ({
            providerId: this.normalizeProviderKey(provider.providerId || provider.toolId || provider.name),
            paneIndex: Number.isFinite(provider.index) ? provider.index : index,
            tool: provider.name || provider.tool || `Provider ${index + 1}`,
            displayName: provider.name || provider.displayName || provider.tool || `Provider ${index + 1}`,
            icon: provider.icon || '🤖'
        }));
    }

    listProviders(providerIds = []) {
        const selected = Array.isArray(providerIds) && providerIds.length > 0
            ? new Set(providerIds.map((id) => this.normalizeProviderKey(id)))
            : null;

        return this._listContainerSources()
            .filter((provider) => !selected || selected.has(provider.providerId));
    }

    providerIdsFromPaneIndices(paneIndices = []) {
        const panes = this._listContainerSources();
        if (!Array.isArray(paneIndices)) return [];
        return paneIndices
            .map((idx) => panes[idx])
            .filter(Boolean)
            .map((pane) => this.normalizeProviderKey(pane?.providerId || pane?.tool?.id || pane?.tool?.name));
    }

    paneIndicesFromProviderIds(providerIds = []) {
        const selected = new Set((providerIds || []).map((id) => this.normalizeProviderKey(id)));
        const panes = this._listContainerSources();
        return panes
            .map((pane, index) => ({ pane, index }))
            .filter(({ pane }) => selected.has(this.normalizeProviderKey(pane?.providerId || pane?.tool?.id || pane?.tool?.name)))
            .map(({ index }) => index);
    }

    async dispatchPrompt(prompt, providerIds = []) {
        if (typeof this.dispatchProviders === 'function') {
            return this.dispatchProviders(prompt, providerIds);
        }
        const paneIndices = this.paneIndicesFromProviderIds(providerIds);
        if (paneIndices.length === 0) {
            return { success: false, error: 'no_provider_containers' };
        }
        return this.sendPromptToPanes(prompt, paneIndices);
    }
}

module.exports = {
    IncomingContainerManager
};
