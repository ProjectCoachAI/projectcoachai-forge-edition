// preload.js - Expose safe API to renderer
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Tool management
    getTools: () => ipcRenderer.invoke('get-tools'),
    
    // Workspace management
    createWorkspace: (toolIds) => ipcRenderer.invoke('create-workspace', toolIds),
        getWorkspaceConfig: () => ipcRenderer.invoke('get-workspace-config'),
        returnToToolshelf: () => ipcRenderer.invoke('return-to-toolshelf'),
        setWorkspaceMode: (mode) => ipcRenderer.invoke('set-workspace-mode', mode),
    
    // Prompt sharing
    sendPromptToAll: (prompt) => ipcRenderer.invoke('send-prompt-to-all', prompt),
    sendPromptToSelected: (prompt, paneIndices) => ipcRenderer.invoke('send-prompt-to-selected', prompt, paneIndices),
    
    // Theme management
    getTheme: () => ipcRenderer.invoke('get-theme'),
    setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
    
    // Prompt bar visibility control
    promptBarShown: () => ipcRenderer.send('prompt-bar-shown'),
    promptBarHidden: () => ipcRenderer.send('prompt-bar-hidden'),
    setLoadPromptOffset: (active) => ipcRenderer.send('load-prompt-offset', active),
    
    // Scroll adjustment for BrowserViews - make them scroll with the frame
    adjustPanesForScroll: (scrollY) => ipcRenderer.send('adjust-panes-for-scroll', scrollY),
    adjustPanePosition: (index, bounds) => ipcRenderer.send('adjust-pane-position', index, bounds),
    
    // Comparison, Ranking, Synthesis
    openVisualComparison: (options) => ipcRenderer.invoke('open-visual-comparison', options),
    openRankingView: () => ipcRenderer.invoke('open-ranking-view'),
    openSynthesisView: (comparisonData) => ipcRenderer.invoke('open-synthesis-view', comparisonData),
    exportComparison: (data) => ipcRenderer.invoke('export-comparison', data),
    getResponseStates: () => ipcRenderer.invoke('get-response-states'),
    
    // IPC message listeners
    on: (channel, callback) => {
        const validChannels = ['setup-comparison', 'setup-ranking', 'setup-synthesis', 'update-pane-response', 'load-saved-prompt'];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args));
        }
    },
    removeAllListeners: (channel) => {
        ipcRenderer.removeAllListeners(channel);
    },

    showOverlay: (type) => ipcRenderer.invoke('show-overlay', type),
    hideOverlay: () => ipcRenderer.invoke('hide-overlay'),
    onOverlayShow: (callback) => {
        ipcRenderer.on('overlay-show', (event, payload) => callback(payload));
    },
    onOverlayHide: (callback) => {
        ipcRenderer.on('overlay-hide', () => callback());
    },
    
    // Focused mode overlay
    showFocusedOverlay: (payload) => ipcRenderer.invoke('show-focused-overlay', payload),
    hideFocusedOverlay: () => ipcRenderer.invoke('hide-focused-overlay'),
    focusedOverlaySend: (prompt) => ipcRenderer.invoke('focused-overlay-send', prompt),
    onFocusedOverlayShow: (callback) => {
        ipcRenderer.on('focused-overlay-show', (event, payload) => callback(payload));
    },
    onFocusedOverlayHide: (callback) => {
        ipcRenderer.on('focused-overlay-hide', () => callback());
    },
    onFocusedOverlayHidden: (callback) => {
        ipcRenderer.on('focused-overlay-hidden', () => callback());
    },
    onFocusedUserMessage: (callback) => {
        ipcRenderer.on('focused-user-message', (event, payload) => callback(payload));
    },
    onFocusedResponseCaptured: (callback) => {
        ipcRenderer.on('focused-response-captured', (event, payload) => callback(payload));
    },
    logFocusedOverlay: (message) => ipcRenderer.send('focused-overlay-log', message),
    
    // Feedback popup - BrowserView management
    hideBrowserViewsForFeedback: () => ipcRenderer.invoke('hide-browserviews-for-feedback'),
    showBrowserViewsAfterFeedback: () => ipcRenderer.invoke('show-browserviews-after-feedback'),
    hideBrowserViewsForLoadPrompt: () => ipcRenderer.invoke('hide-browserviews-for-loadprompt'),
    showBrowserViewsAfterLoadPrompt: () => ipcRenderer.invoke('show-browserviews-after-loadprompt'),
    
    // Window management
    closeWindow: () => {
        // Send message to main process to close this window
        ipcRenderer.send('close-comparison-window');
    },
    closeComparisonWindowForNavigation: () => ipcRenderer.invoke('close-comparison-window-for-navigation'),
    
    // OpenAI API (included in pricing)
    callOpenAI: (requestData) => ipcRenderer.invoke('call-openai-api', requestData),
    
    // Claude API (Anthropic) - Primary for synthesis
    callClaude: (requestData) => ipcRenderer.invoke('call-claude-api', requestData),
    
    // Unified Synthesis API - Claude primary + OpenAI fallback
    callSynthesisAPI: async (requestData) => {
        const { tier = 'starter', mode = 'comprehensive' } = requestData;
        const isFreeTier = tier === 'starter' || tier === 'unregistered' || tier === 'free';
        
        // Cost estimates per synthesis (ACTUAL costs based on real API logs - January 2025)
        // Average usage: ~1,220 input tokens + 415 output tokens per synthesis
        // Actual cost: (1220 × $1/1M) + (415 × $5/1M) = $0.00122 + $0.00208 = $0.0033
        const COST_ESTIMATES = {
            'claude-3-5-haiku-20241022': 0.0033,       // $0.0033/synthesis (ACTUAL - even cheaper than estimated!)
            'claude-3-5-sonnet-20241022': 0.0225,      // $0.0225/synthesis (not used at launch, kept for future)
            'gpt-3.5-turbo': 0.0015,                   // $0.0015/synthesis (CHEAP fallback)
            'gpt-4-turbo-preview': 0.028               // $0.028/synthesis (EXPENSIVE fallback - avoided)
        };
        
        // Determine which model to use based on tier
        const primaryClaudeModel = isFreeTier ? 'claude-3-5-haiku-20241022' : 'claude-3-5-sonnet-20241022';
        const fallbackClaudeModel = 'claude-3-5-haiku-20241022'; // Always available fallback
        const openAIModel = isFreeTier ? 'gpt-3.5-turbo' : 'gpt-4-turbo-preview';
        
        const primaryCost = COST_ESTIMATES[primaryClaudeModel] || 0;
        const haikuCost = COST_ESTIMATES[fallbackClaudeModel] || 0;
        const openAICost = COST_ESTIMATES[openAIModel] || 0;
        
        let claudeError = null;
        let lastErrorWasModelNotFound = false;
        
        // Try Claude primary model first
        try {
            const claudeRequest = {
                ...requestData,
                model: primaryClaudeModel
            };
            const claudeResult = await ipcRenderer.invoke('call-claude-api', claudeRequest);
            
            if (claudeResult.success) {
                console.log(`✅ [Synthesis] Claude API succeeded (${primaryClaudeModel})`);
                return {
                    ...claudeResult,
                    provider: 'claude',
                    model: primaryClaudeModel
                };
            } else {
                claudeError = claudeResult.error || 'Unknown Claude API error';
                lastErrorWasModelNotFound = claudeError.includes('not_found') || claudeError.includes('404') || claudeError.includes('model:');
                
                // If model not found and we haven't tried fallback yet, try Haiku
                if (lastErrorWasModelNotFound && primaryClaudeModel !== fallbackClaudeModel) {
                    console.warn(`⚠️ [Synthesis] Primary model ${primaryClaudeModel} not available (404), trying fallback ${fallbackClaudeModel}...`);
                    
                    try {
                        const fallbackRequest = {
                            ...requestData,
                            model: fallbackClaudeModel
                        };
                        const fallbackResult = await ipcRenderer.invoke('call-claude-api', fallbackRequest);
                        
                        if (fallbackResult.success) {
                            const costDiff = primaryCost - haikuCost;
                            const costChange = costDiff > 0 ? 'SAVED' : 'INCREASED';
                            const costPercent = costDiff > 0 
                                ? `${((costDiff / primaryCost) * 100).toFixed(1)}% cheaper` 
                                : `${((Math.abs(costDiff) / primaryCost) * 100).toFixed(1)}% more expensive`;
                            
                            console.warn(`⚠️ [Synthesis] Using fallback model ${fallbackClaudeModel} (primary ${primaryClaudeModel} unavailable)`);
                            console.warn(`💰 [Cost] Fallback cost: $${haikuCost.toFixed(6)}/synthesis vs primary $${primaryCost.toFixed(6)} (${costPercent})`);
                            
                            if (costDiff > 0) {
                                console.log(`✅ [Cost] Fallback is CHEAPER - cost savings per synthesis: $${costDiff.toFixed(6)}`);
                            } else if (costDiff < 0) {
                                console.error(`🚨 [Cost] WARNING: Fallback is MORE EXPENSIVE by $${Math.abs(costDiff).toFixed(6)}/synthesis!`);
                            }
                            
                            return {
                                ...fallbackResult,
                                provider: 'claude',
                                model: fallbackClaudeModel,
                                usedFallback: true,
                                fallbackReason: `Primary model ${primaryClaudeModel} returned 404 - model may not be available for this API key`,
                                costInfo: {
                                    primaryCost,
                                    actualCost: haikuCost,
                                    costDifference: costDiff,
                                    costChange: costChange,
                                    isMoreExpensive: costDiff < 0
                                }
                            };
                        } else {
                            console.warn(`⚠️ [Synthesis] Fallback model also failed, will use OpenAI...`);
                            claudeError = `Both primary (${primaryClaudeModel}) and fallback (${fallbackClaudeModel}) failed: ${fallbackResult.error || claudeError}`;
                        }
                    } catch (fallbackError) {
                        console.warn(`⚠️ [Synthesis] Fallback model error: ${fallbackError.message}`);
                        claudeError = `Primary failed: ${claudeError}, Fallback failed: ${fallbackError.message}`;
                    }
                } else {
                    console.warn(`⚠️ [Synthesis] Claude API failed: ${claudeError}, falling back to OpenAI...`);
                }
            }
        } catch (error) {
            claudeError = error.message || 'Unknown Claude API error';
            console.warn(`⚠️ [Synthesis] Claude API error: ${claudeError}, falling back to OpenAI...`);
        }
        
        // Fallback to OpenAI
        try {
            const openAIRequest = {
                ...requestData,
                model: openAIModel
            };
            const openAIResult = await ipcRenderer.invoke('call-openai-api', openAIRequest);
            
            if (openAIResult.success) {
                // Calculate cost comparison when using OpenAI fallback
                const expectedCost = primaryCost; // What we expected to pay
                const actualCost = openAICost; // What we're actually paying
                const costDiff = actualCost - expectedCost;
                const costPercent = expectedCost > 0 ? ((costDiff / expectedCost) * 100).toFixed(1) : 'N/A';
                
                console.log(`✅ [Synthesis] OpenAI fallback succeeded (${openAIModel})`);
                
                if (costDiff > 0) {
                    console.error(`🚨 [Cost] CRITICAL: OpenAI fallback is $${costDiff.toFixed(6)} MORE EXPENSIVE per synthesis (${costPercent}% increase)!`);
                    console.error(`💰 [Cost] Expected: $${expectedCost.toFixed(6)}/synthesis, Actual: $${actualCost.toFixed(6)}/synthesis`);
                    console.error(`⚠️ [Cost] Budget impact: This increases monthly costs significantly. Fix Claude API access ASAP.`);
                } else if (costDiff < 0) {
                    console.log(`✅ [Cost] OpenAI fallback is CHEAPER by $${Math.abs(costDiff).toFixed(6)}/synthesis (${Math.abs(costPercent)}% savings)`);
                } else {
                    console.log(`💰 [Cost] OpenAI fallback cost: $${actualCost.toFixed(6)}/synthesis (same as expected)`);
                }
                
                return {
                    ...openAIResult,
                    provider: 'openai',
                    model: openAIModel,
                    usedFallback: true,
                    costInfo: {
                        primaryCost: expectedCost,
                        actualCost: actualCost,
                        costDifference: costDiff,
                        costChange: costDiff > 0 ? 'INCREASED' : costDiff < 0 ? 'DECREASED' : 'SAME',
                        isMoreExpensive: costDiff > 0,
                        warning: costDiff > 0 ? `Fallback is ${costPercent}% more expensive - fix primary API!` : null
                    }
                };
            } else {
                const openAIError = openAIResult.error || 'Unknown OpenAI API error';
                console.error(`❌ [Synthesis] Both Claude and OpenAI failed!`);
                throw new Error(`Both API providers failed. Claude: ${claudeError || 'unknown'}, OpenAI: ${openAIError}`);
            }
        } catch (openAIError) {
            console.error(`❌ [Synthesis] OpenAI fallback also failed: ${openAIError.message || openAIError}`);
            throw new Error(`All API providers failed. Claude: ${claudeError || 'unknown'}, OpenAI: ${openAIError.message || 'unknown'}. Please check your API keys and network connection.`);
        }
    },
    
    // API Proxy Mode (Designer's Spec - Managed Keys)
    setAPIMode: (enabled, baseURL, userId) => ipcRenderer.invoke('set-api-mode', enabled, baseURL, userId),
    getAPIMode: () => ipcRenderer.invoke('get-api-mode'),
    getAPIProviders: () => ipcRenderer.invoke('get-api-providers'),
    
    // Listen for API responses
    onAPIResponses: (callback) => {
        ipcRenderer.on('api-responses-received', (event, data) => callback(data));
    },
    
    // Cookie/Email Management
    setAutoAcceptCookies: (enabled) => ipcRenderer.invoke('set-auto-accept-cookies', enabled),
    getAutoAcceptCookies: () => ipcRenderer.invoke('get-auto-accept-cookies'),
    getSavedEmails: () => ipcRenderer.invoke('get-saved-emails'),
    
    // Stripe & Subscription Management
    getSubscription: () => ipcRenderer.invoke('get-subscription'),
    getPricingTiers: () => ipcRenderer.invoke('get-pricing-tiers'),
    upgradeSubscription: (tierId) => ipcRenderer.invoke('upgrade-subscription', tierId),
    verifySubscription: (sessionId) => ipcRenderer.invoke('verify-subscription', sessionId),
    openCustomerPortal: () => ipcRenderer.invoke('open-customer-portal'),
    checkFeatureAccess: (feature) => ipcRenderer.invoke('check-feature-access', feature),
    checkAIAccess: (aiId) => ipcRenderer.invoke('check-ai-access', aiId),
    
    // Open pricing page
    openPricing: (source) => ipcRenderer.invoke('open-pricing-page', source),
    
    // Registration & Sign-in
    openRegister: () => ipcRenderer.invoke('open-register'),
    openSignIn: () => ipcRenderer.invoke('open-sign-in'),
    registerUser: (userData) => ipcRenderer.invoke('register-user', userData),
    signInUser: (credentials) => ipcRenderer.invoke('sign-in-user', credentials),
    signOutUser: () => ipcRenderer.invoke('sign-out-user'),
    getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
    submitFeedback: (data) => ipcRenderer.invoke('submit-feedback', data),
    
    // Admin functions
    checkAdminStatus: () => ipcRenderer.invoke('check-admin-status'),
    adminGetAllUsers: () => ipcRenderer.invoke('admin-get-all-users'),
    openAdminPortal: () => ipcRenderer.invoke('open-admin-portal'),
    adminGetAllFeedback: () => ipcRenderer.invoke('admin-get-all-feedback'),
    adminUpdateFeedback: (data) => ipcRenderer.invoke('admin-update-feedback', data),
    
    // User profile functions
    getUserProfile: () => ipcRenderer.invoke('get-user-profile'),
    updateUserProfile: (data) => ipcRenderer.invoke('update-user-profile', data),
    getUserUsageStats: () => ipcRenderer.invoke('get-user-usage-stats'),
    getSystemUsageStats: () => ipcRenderer.invoke('get-system-usage-stats'),
    openProfile: () => ipcRenderer.invoke('open-profile'),
    
    // Prompt Library functions
    savePrompt: (data) => ipcRenderer.invoke('save-prompt', data),
    getPrompts: () => ipcRenderer.invoke('get-prompts'),
    updatePrompt: (data) => ipcRenderer.invoke('update-prompt', data),
    deletePrompt: (promptId) => ipcRenderer.invoke('delete-prompt', promptId),
    getPromptSettings: () => ipcRenderer.invoke('get-prompt-settings'),
    savePromptSettings: (settings) => ipcRenderer.invoke('save-prompt-settings', settings),
    loadPromptIntoWorkspace: (promptText) => ipcRenderer.invoke('load-prompt-into-workspace', promptText),
    loadPromptQuickChat: (promptText) => ipcRenderer.invoke('load-prompt-quickchat', promptText),
    loadPromptMultiPane: (promptText) => ipcRenderer.invoke('load-prompt-multipane', promptText),
    
    // Open contact page
    openContact: () => ipcRenderer.invoke('open-contact-page'),
    
    // Open help page
    openHelp: () => ipcRenderer.invoke('open-help-page'),
    
    // Open external URL (for contact page, etc.)
    openExternal: (url) => ipcRenderer.invoke('open-external-url', url),
    
    // Subscription tracking
    getSubscriptionSummary: () => ipcRenderer.invoke('get-subscription-summary'),
    
    // API Status updates
    onAPIStatusUpdate: (callback) => {
        ipcRenderer.on('api-status-update', (event, data) => callback(data));
    }
});
