// ai-config.js - AI Provider Configuration
// Maps AI provider names to their API endpoints, headers, and body formats

const AI_CONFIGS = {
    'chatgpt': {
        name: 'ChatGPT',
        icon: '💬',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        headers: (apiKey) => ({ 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }),
        bodyMapper: (prompt, options = {}) => ({
            model: options.model || 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.max_tokens || 2000,
            temperature: options.temperature || 0.7
        }),
        responseParser: async (response) => {
            const data = await response.json();
            return {
                content: data.choices[0]?.message?.content || '',
                usage: data.usage || {},
                model: data.model
            };
        }
    },
    
    'claude': {
        name: 'Claude',
        icon: '🤖',
        endpoint: 'https://api.anthropic.com/v1/messages',
        headers: (apiKey) => ({ 
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        }),
        bodyMapper: (prompt, options = {}) => ({
            model: options.model || 'claude-3-5-sonnet-latest',
            max_tokens: options.max_tokens || 2000,
            messages: [{ role: 'user', content: prompt }]
        }),
        responseParser: async (response) => {
            const data = await response.json();
            return {
                content: data.content[0]?.text || '',
                usage: {
                    input_tokens: data.usage?.input_tokens || 0,
                    output_tokens: data.usage?.output_tokens || 0
                },
                model: data.model
            };
        }
    },
    
    'gemini': {
        name: 'Gemini',
        icon: '✨',
        endpoint: (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        headers: () => ({ 
            'Content-Type': 'application/json'
        }),
        bodyMapper: (prompt, options = {}) => ({
            contents: [{ 
                parts: [{ text: prompt }] 
            }],
            generationConfig: { 
                maxOutputTokens: options.max_tokens || 2000,
                temperature: options.temperature || 0.7
            }
        }),
        responseParser: async (response) => {
            const data = await response.json();
            return {
                content: data.candidates[0]?.content?.parts[0]?.text || '',
                usage: data.usageMetadata || {},
                model: 'gemini-1.5-pro'
            };
        }
    },
    
    'perplexity': {
        name: 'Perplexity',
        icon: '🔍',
        endpoint: 'https://api.perplexity.ai/chat/completions',
        headers: (apiKey) => ({ 
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }),
        bodyMapper: (prompt, options = {}) => ({
            model: options.model || 'sonar',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: options.max_tokens || 2000
        }),
        responseParser: async (response) => {
            const data = await response.json();
            return {
                content: data.choices[0]?.message?.content || '',
                usage: data.usage || {},
                citations: data.citations || [],
                model: data.model
            };
        }
    }
};

// Helper function to get config for a provider
function getAIConfig(provider) {
    const normalized = provider.toLowerCase().replace(/\s+/g, '');
    return AI_CONFIGS[normalized] || null;
}

// Helper function to get all available providers
function getAvailableProviders() {
    return Object.keys(AI_CONFIGS).map(key => ({
        id: key,
        ...AI_CONFIGS[key]
    }));
}

// Export for use in Electron
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AI_CONFIGS,
        getAIConfig,
        getAvailableProviders
    };
}






