/**
 * Synthesis Model Configuration
 * Configures which AI model to use for synthesis based on user tier
 * Free tier: Claude Haiku / GPT-3.5 Turbo (faster, cheaper)
 * Paid tier: Claude Sonnet 4 / GPT-4 (higher quality)
 */

// Recommended synthesis configuration with Claude primary + OpenAI fallback
const SYNTHESIS_CONFIG = {
    free_tier: {
        primary: {
            provider: 'anthropic',
            model: 'claude-3-5-haiku-20241022', // Claude 3.5 Haiku - confirmed working perfectly!
            maxTokens: 4096, // Free tier: 4K tokens (excellent for all 7 synthesis modes)
            temperature: 0.7,
            costPerSynthesis: 0.0033, // Actual cost based on real API logs: ~1,220 input + 415 output tokens
            quality: 'excellent',
            description: 'Fast, high-quality AI-powered analysis'
        },
        fallback: {
            provider: 'openai',
            model: 'gpt-3.5-turbo', // GPT-3.5 Turbo - fallback if Claude has issues
            maxTokens: 2048,
            temperature: 0.7,
            costPerSynthesis: 0.0015, // $0.0015 per synthesis
            quality: 'fast',
            description: 'Fast AI-powered analysis (fallback)'
        },
        cost: 0.0033 // Actual cost based on real API usage (~$0.0033 per synthesis)
    },
    
    paid_tier: {
        primary: {
            provider: 'anthropic',
            model: 'claude-3-5-haiku-20241022', // Same model as free - differentiated by max_tokens (2x capacity)
            maxTokens: 8192, // Paid tier: 8K tokens (2x capacity for deeper analysis)
            temperature: 0.7,
            costPerSynthesis: 0.0033, // Same cost - actual: ~1,220 input + 415 output tokens (can handle longer prompts)
            quality: 'excellent',
            description: 'Premium AI-powered analysis with 2x token capacity for deeper insights'
        },
        fallback: {
            provider: 'openai',
            model: 'gpt-4-turbo-preview', // GPT-4 Turbo - fallback if Claude has issues
            maxTokens: 4096,
            temperature: 0.7,
            costPerSynthesis: 0.025, // $0.025 per synthesis
            quality: 'premium',
            description: 'Premium AI-powered analysis (fallback)'
        },
        cost: 0.0033 // Actual cost based on real API usage (~$0.0033 per synthesis, same as free but with 2x capacity)
    }
};

// Legacy format for backward compatibility
const SYNTHESIS_MODELS = {
    free: SYNTHESIS_CONFIG.free_tier.primary,
    premium: SYNTHESIS_CONFIG.paid_tier.primary
};

// Get model configuration for tier (returns primary + fallback)
function getSynthesisModelForTier(tier) {
    // Import from stripe-config if available (in Electron context)
    let synthesisModelType = 'free_tier'; // Default to free
    
    try {
        if (typeof require !== 'undefined') {
            const { getSynthesisModel } = require('./stripe-config.js');
            const modelType = getSynthesisModel(tier) || 'free';
            synthesisModelType = modelType === 'free' ? 'free_tier' : 'paid_tier';
        }
    } catch (e) {
        // Not in Electron context, use default
        // Determine from tier name
        if (tier === 'starter' || tier === 'unregistered' || tier === 'free') {
            synthesisModelType = 'free_tier';
        } else {
            synthesisModelType = 'paid_tier';
        }
    }
    
    return SYNTHESIS_CONFIG[synthesisModelType] || SYNTHESIS_CONFIG.free_tier;
}

// Get primary model only (for backward compatibility)
function getPrimaryModelForTier(tier) {
    const config = getSynthesisModelForTier(tier);
    return config.primary || config;
}

// Get API key for provider (from environment or config files)
function getAPIKeyForProvider(provider = 'anthropic') {
    try {
        if (typeof require !== 'undefined' && typeof process !== 'undefined') {
            const fs = require('fs');
            const path = require('path');
            
            if (provider === 'anthropic' || provider === 'claude') {
                // Try environment variables first
                if (process.env.ANTHROPIC_API_KEY) {
                    console.log('✅ [Config] Claude API key loaded from ANTHROPIC_API_KEY environment variable');
                    return process.env.ANTHROPIC_API_KEY;
                }
                if (process.env.CLAUDE_API_KEY) {
                    console.log('✅ [Config] Claude API key loaded from CLAUDE_API_KEY environment variable');
                    return process.env.CLAUDE_API_KEY;
                }
                
                // Try to read from file (Claude key file)
                const claudeKeyFiles = [
                    path.join(__dirname, 'Claude sk for ProjectCoachAI.txt'),
                    path.join(__dirname, 'Claude sk for ProjectCoachAI'),
                    path.join(__dirname, 'Anthropic sk for ProjectCoachAI.txt'),
                    path.join(__dirname, 'Anthropic sk for ProjectCoachAI')
                ];
                
                for (const keyFile of claudeKeyFiles) {
                    if (fs.existsSync(keyFile)) {
                        try {
                            const key = fs.readFileSync(keyFile, 'utf8').trim();
                            if (key && key.length > 10 && key.startsWith('sk-ant-')) {
                                console.log(`✅ [Config] Claude API key loaded from file: ${path.basename(keyFile)}`);
                                return key;
                            }
                        } catch (e) {
                            console.warn(`⚠️ [Config] Could not read Claude API key from ${keyFile}:`, e.message);
                        }
                    }
                }
                
                console.warn('⚠️ [Config] Claude API key not found. Please add it to "Claude sk for ProjectCoachAI.txt"');
                return null;
                
            } else if (provider === 'openai') {
                // Try environment variables first
                if (process.env.OPENAI_API_KEY) {
                    console.log('✅ [Config] OpenAI API key loaded from OPENAI_API_KEY environment variable');
                    return process.env.OPENAI_API_KEY;
                }
                
                // Try to read from file (existing OpenAI key setup)
                const openAIKeyFiles = [
                    path.join(__dirname, 'OpenAI sk for ProjectCoachAI.txt'),
                    path.join(__dirname, 'OpenAI sk for ProjectCoachAI')
                ];
                
                for (const keyFile of openAIKeyFiles) {
                    if (fs.existsSync(keyFile)) {
                        try {
                            const key = fs.readFileSync(keyFile, 'utf8').trim();
                            if (key && key.length > 10) {
                                console.log(`✅ [Config] OpenAI API key loaded from file: ${path.basename(keyFile)}`);
                                return key;
                            }
                        } catch (e) {
                            console.warn(`⚠️ [Config] Could not read OpenAI API key from ${keyFile}:`, e.message);
                        }
                    }
                }
                
                console.warn('⚠️ [Config] OpenAI API key not found. Will use as fallback only.');
                return null;
            }
        }
    } catch (e) {
        console.error('❌ [Config] Error getting API key:', e.message);
    }
    
    return null;
}

// Export for use in browser context
if (typeof window !== 'undefined') {
    window.SynthesisConfig = {
        SYNTHESIS_CONFIG,
        SYNTHESIS_MODELS, // Legacy support
        getModelForTier: getSynthesisModelForTier,
        getPrimaryModel: getPrimaryModelForTier,
        getAPIKey: getAPIKeyForProvider
    };
}

// Export for use in Electron/Node context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SYNTHESIS_CONFIG,
        SYNTHESIS_MODELS, // Legacy support
        getSynthesisModelForTier: getSynthesisModelForTier,
        getPrimaryModelForTier: getPrimaryModelForTier,
        getAPIKeyForProvider: getAPIKeyForProvider
    };
}

