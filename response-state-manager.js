// Response State Manager - Tracks response lifecycle for all AI tools
// This solves the timing mismatch by managing state throughout the capture process

class ResponseStateManager {
    constructor() {
        this.states = new Map(); // AI Tool -> State
        this.listeners = new Set();
        this.windowListeners = new Map(); // Window ID -> Listener function
    }
    
    setState(aiTool, state) {
        const previousState = this.states.get(aiTool);
        this.states.set(aiTool, {
            status: state.status || 'pending', // 'pending', 'streaming', 'captured', 'failed'
            content: state.content || '',
            html: state.html || state.content || '',
            timestamp: state.timestamp || Date.now(),
            source: state.source || 'api', // 'api', 'streaming', 'captured'
            metadata: state.metadata || {},
            ...state
        });
        
        // Notify all listeners
        this.notifyListeners(aiTool, this.states.get(aiTool));
        
        // Log state change
        console.log(`🔄 [StateManager] ${aiTool}: ${previousState?.status || 'none'} → ${state.status} (${state.content?.length || 0} chars)`);
    }
    
    getState(aiTool) {
        return this.states.get(aiTool) || {
            status: 'pending',
            content: '',
            html: '',
            timestamp: 0,
            source: 'api',
            metadata: {}
        };
    }
    
    getAllStates() {
        return Array.from(this.states.entries()).map(([tool, state]) => ({
            aiTool: tool,
            ...state
        }));
    }
    
    getAvailableResponses() {
        const states = Array.from(this.states.values());
        
        return {
            captured: states.filter(s => s.status === 'captured' && s.source === 'captured'),
            streaming: states.filter(s => s.status === 'streaming'),
            api: states.filter(s => s.status === 'captured' && s.source === 'api'),
            any: states.filter(s => s.status !== 'pending' && s.content.length > 0),
            total: states.length
        };
    }
    
    hasEnoughForComparison(minCount = 2) {
        const available = this.getAvailableResponses();
        return available.any.length >= minCount;
    }
    
    notifyListeners(aiTool, state) {
        this.listeners.forEach(listener => {
            try {
                listener(aiTool, state);
            } catch (error) {
                console.error(`❌ [StateManager] Error in listener:`, error);
            }
        });
    }
    
    addListener(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    
    // For Electron IPC - notify main process
    notifyMainProcess(aiTool, state) {
        // This will be called from capture handler in main.js
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.send('response-state-update', {
                aiTool,
                ...state
            });
        }
    }
}

// Global instance
if (typeof window !== 'undefined') {
    window.responseStateManager = new ResponseStateManager();
} else if (typeof global !== 'undefined') {
    global.responseStateManager = new ResponseStateManager();
}

// Export for Node.js (main.js)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResponseStateManager;
}







