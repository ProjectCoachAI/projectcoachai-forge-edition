// api-proxy-client.js - Client-side API proxy for multi-AI requests
// This module handles communication with the secure proxy server for managed API keys

class AIProxyClient {
    constructor(baseURL, userId) {
        this.baseURL = baseURL || 'https://api.projectcoachai.com'; // Default proxy server
        this.userId = userId || 'local-user'; // For local development
    }
    
    /**
     * Query a single AI provider
     */
    async querySingle(provider, prompt) {
        try {
            const response = await fetch(`${this.baseURL}/api/ai/query`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-User-ID': this.userId
                },
                body: JSON.stringify({ 
                    aiProvider: provider, 
                    prompt, 
                    userId: this.userId 
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `HTTP ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`[API Proxy] Error querying ${provider}:`, error);
            return { 
                provider, 
                error: error.message,
                content: null 
            };
        }
    }
    
    /**
     * Query multiple AI providers simultaneously
     */
    async queryMultiple(providers, prompt) {
        console.log(`[API Proxy] Querying ${providers.length} AIs:`, providers);
        
        // Send to all selected AIs concurrently
        const promises = providers.map(provider => 
            this.querySingle(provider, prompt)
                .then(res => ({ 
                    provider, 
                    success: true,
                    content: res.content,
                    usage: res.usage,
                    ...res 
                }))
                .catch(err => ({ 
                    provider, 
                    success: false,
                    error: err.message 
                }))
        );
        
        const results = await Promise.all(promises);
        return results;
    }
    
    /**
     * Streaming query for real-time response updates
     */
    async streamingQuery(provider, prompt, onChunk) {
        try {
            const response = await fetch(`${this.baseURL}/api/ai/stream`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-User-ID': this.userId
                },
                body: JSON.stringify({ 
                    aiProvider: provider, 
                    prompt, 
                    userId: this.userId 
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulated = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                accumulated += chunk;
                
                // Parse SSE format if needed
                const lines = accumulated.split('\n');
                accumulated = lines.pop() || ''; // Keep incomplete line
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            onChunk(data.content || data, accumulated);
                        } catch (e) {
                            // Not JSON, treat as plain text
                            onChunk(line.slice(6), accumulated);
                        }
                    }
                }
            }
            
            return { success: true, content: accumulated };
        } catch (error) {
            console.error(`[API Proxy] Streaming error for ${provider}:`, error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Batch request for multiple prompts to multiple providers
     */
    async batchRequest(providers, prompts) {
        try {
            const response = await fetch(`${this.baseURL}/api/ai/batch`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-User-ID': this.userId
                },
                body: JSON.stringify({ 
                    aiProviders: providers,
                    prompts: prompts,
                    userId: this.userId 
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            return data.results || [];
        } catch (error) {
            console.error('[API Proxy] Batch request error:', error);
            return providers.map(provider => ({ 
                provider, 
                error: error.message 
            }));
        }
    }
    
    /**
     * Check if API proxy is available
     */
    async checkAvailability() {
        try {
            const response = await fetch(`${this.baseURL}/api/health`, {
                method: 'GET',
                headers: { 'X-User-ID': this.userId }
            });
            return response.ok;
        } catch (error) {
            console.warn('[API Proxy] Server not available, falling back to BrowserViews');
            return false;
        }
    }
}

// Export for use in Electron renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIProxyClient;
}













