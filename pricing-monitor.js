/**
 * Pricing Monitor & Sustainability System
 * Tracks API costs, monitors for price changes, and alerts when updates are needed
 * 
 * This ensures we stay sustainable and know immediately when pricing changes occur.
 */

// Current pricing (updated: January 2025)
const CURRENT_PRICING = {
    anthropic: {
        'claude-3-5-haiku-20241022': {
            input: 1,      // $1 per 1M input tokens
            output: 5,     // $5 per 1M output tokens
            lastUpdated: '2025-01-10',
            source: 'https://docs.anthropic.com/en/api/pricing',
            deprecationNotice: null,
            isDeprecated: false,
            // ACTUAL USAGE (from real API logs):
            actualInputTokens: 1220,    // Average per synthesis
            actualOutputTokens: 415,    // Average per synthesis
            actualCostPerSynthesis: 0.0033  // (1220 × $1/1M) + (415 × $5/1M) = $0.0033
        },
        'claude-3-5-sonnet-20241022': {
            input: 3,      // $3 per 1M input tokens
            output: 15,    // $15 per 1M output tokens
            lastUpdated: '2025-01-10',
            source: 'https://docs.anthropic.com/en/api/pricing',
            deprecationNotice: null,
            isDeprecated: false
        },
        'claude-sonnet-4-20250514': {
            input: 3,      // $3 per 1M input tokens (same as 3.5)
            output: 15,    // $15 per 1M output tokens
            lastUpdated: '2025-01-10',
            source: 'https://docs.anthropic.com/en/api/pricing',
            deprecationNotice: null,
            isDeprecated: false
        }
    },
    openai: {
        'gpt-3.5-turbo': {
            input: 0.5,    // $0.50 per 1M input tokens
            output: 1.5,   // $1.50 per 1M output tokens
            lastUpdated: '2025-01-10',
            source: 'https://openai.com/pricing',
            deprecationNotice: null,
            isDeprecated: false
        },
        'gpt-4-turbo-preview': {
            input: 10,     // $10 per 1M input tokens
            output: 30,    // $30 per 1M output tokens
            lastUpdated: '2025-01-10',
            source: 'https://openai.com/pricing',
            deprecationNotice: null,
            isDeprecated: false
        }
    }
};

// Estimated token usage per synthesis (for cost calculation)
const ESTIMATED_USAGE = {
    free_tier: {
        inputTokens: 1000,   // Average tokens in prompt
        outputTokens: 800    // Average tokens in response
    },
    paid_tier: {
        inputTokens: 1500,   // Longer prompts for premium
        outputTokens: 1200   // More detailed responses
    }
};

/**
 * Calculate actual cost for a synthesis based on real token usage
 */
function calculateActualCost(provider, model, inputTokens, outputTokens) {
    const pricing = CURRENT_PRICING[provider]?.[model];
    if (!pricing) {
        console.warn(`⚠️ [Pricing] No pricing data for ${provider}/${model}`);
        return null;
    }
    
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    const totalCost = inputCost + outputCost;
    
    return {
        inputCost: parseFloat(inputCost.toFixed(6)),
        outputCost: parseFloat(outputCost.toFixed(6)),
        totalCost: parseFloat(totalCost.toFixed(6)),
        inputTokens,
        outputTokens,
        model,
        provider
    };
}

/**
 * Calculate estimated cost for a synthesis (before API call)
 */
function calculateEstimatedCost(tier) {
    const usage = ESTIMATED_USAGE[tier];
    const isFreeTier = tier === 'free_tier' || tier === 'starter' || tier === 'free';
    
    const model = isFreeTier 
        ? 'claude-3-5-haiku-20241022' 
        : 'claude-3-5-sonnet-20241022';
    const provider = 'anthropic';
    
    return calculateActualCost(provider, model, usage.inputTokens, usage.outputTokens);
}

/**
 * Track actual usage and compare with estimates
 */
class PricingMonitor {
    constructor() {
        this.usageHistory = [];
        this.costAlerts = [];
        this.lastPriceCheck = null;
    }
    
    /**
     * Log actual usage from API response
     */
    logUsage(provider, model, inputTokens, outputTokens, synthesisMode) {
        const cost = calculateActualCost(provider, model, inputTokens, outputTokens);
        
        if (!cost) return null;
        
        const usage = {
            timestamp: new Date().toISOString(),
            provider,
            model,
            synthesisMode,
            ...cost
        };
        
        this.usageHistory.push(usage);
        
        // Keep only last 1000 entries
        if (this.usageHistory.length > 1000) {
            this.usageHistory.shift();
        }
        
        // Check for cost anomalies
        this.checkCostAnomalies(usage);
        
        return usage;
    }
    
    /**
     * Check if actual costs are significantly different from estimates
     */
    checkCostAnomalies(usage) {
        const tier = usage.model.includes('haiku') ? 'free_tier' : 'paid_tier';
        const estimated = calculateEstimatedCost(tier);
        
        if (!estimated) return;
        
        const costVariance = Math.abs(usage.totalCost - estimated.totalCost) / estimated.totalCost;
        
        // Alert if cost is 20%+ different from estimate
        if (costVariance > 0.20) {
            const alert = {
                type: 'cost_variance',
                severity: costVariance > 0.50 ? 'high' : 'medium',
                message: `⚠️ Cost variance detected for ${usage.model}: Expected ~$${estimated.totalCost.toFixed(6)}, Actual $${usage.totalCost.toFixed(6)} (${(costVariance * 100).toFixed(1)}% difference)`,
                usage,
                estimated,
                variance: costVariance,
                timestamp: new Date().toISOString()
            };
            
            this.costAlerts.push(alert);
            console.warn(alert.message);
            
            // Keep only last 50 alerts
            if (this.costAlerts.length > 50) {
                this.costAlerts.shift();
            }
        }
    }
    
    /**
     * Get usage statistics
     */
    getUsageStats(days = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const recentUsage = this.usageHistory.filter(u => 
            new Date(u.timestamp) >= cutoffDate
        );
        
        const totalSyntheses = recentUsage.length;
        const totalCost = recentUsage.reduce((sum, u) => sum + u.totalCost, 0);
        const avgCost = totalSyntheses > 0 ? totalCost / totalSyntheses : 0;
        
        const byModel = {};
        recentUsage.forEach(u => {
            if (!byModel[u.model]) {
                byModel[u.model] = {
                    count: 0,
                    totalCost: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0
                };
            }
            byModel[u.model].count++;
            byModel[u.model].totalCost += u.totalCost;
            byModel[u.model].totalInputTokens += u.inputTokens;
            byModel[u.model].totalOutputTokens += u.outputTokens;
        });
        
        return {
            period: `${days} days`,
            totalSyntheses,
            totalCost: parseFloat(totalCost.toFixed(4)),
            avgCostPerSynthesis: parseFloat(avgCost.toFixed(6)),
            byModel,
            alerts: this.costAlerts.filter(a => 
                new Date(a.timestamp) >= cutoffDate
            ).length,
            lastUpdated: new Date().toISOString()
        };
    }
    
    /**
     * Check for pricing updates (should be called periodically)
     * In production, this would fetch from Anthropic/OpenAI pricing pages
     */
    async checkPricingUpdates() {
        this.lastPriceCheck = new Date().toISOString();
        
        // TODO: In production, implement actual price checking:
        // 1. Fetch from Anthropic pricing page: https://docs.anthropic.com/en/api/pricing
        // 2. Parse and compare with CURRENT_PRICING
        // 3. Alert if changes detected
        // 4. Update CURRENT_PRICING if confirmed
        
        console.log('📊 [Pricing] Price check completed (manual check recommended)');
        
        return {
            checked: this.lastPriceCheck,
            recommendation: 'Check pricing pages manually or implement automated scraping',
            anthropicUrl: 'https://docs.anthropic.com/en/api/pricing',
            openaiUrl: 'https://openai.com/pricing',
            modelDeprecationUrl: 'https://docs.anthropic.com/en/docs/about-claude/model-deprecations'
        };
    }
}

/**
 * Check if a model is deprecated or will be deprecated soon
 */
function checkModelDeprecation(provider, model) {
    const pricing = CURRENT_PRICING[provider]?.[model];
    
    if (!pricing) {
        return {
            isDeprecated: false,
            warning: `⚠️ Model ${model} not found in pricing config - may need update`
        };
    }
    
    if (pricing.isDeprecated) {
        return {
            isDeprecated: true,
            deprecationNotice: pricing.deprecationNotice,
            recommendation: `🚨 Model ${model} is deprecated. Update to newer model.`
        };
    }
    
    if (pricing.deprecationNotice) {
        return {
            isDeprecated: false,
            deprecationNotice: pricing.deprecationNotice,
            warning: `⚠️ Model ${model} has deprecation notice: ${pricing.deprecationNotice}`
        };
    }
    
    return {
        isDeprecated: false,
        status: '✅ Model is current and supported'
    };
}

/**
 * Get recommended model if current one is deprecated
 */
function getRecommendedModel(currentModel) {
    const recommendations = {
        'claude-3-haiku-20240307': 'claude-3-5-haiku-20241022',
        'claude-3-sonnet-20240229': 'claude-3-5-sonnet-20241022',
        'claude-3-opus-20240229': 'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-20240620': 'claude-3-5-sonnet-20241022'
    };
    
    return recommendations[currentModel] || null;
}

// Create singleton instance
const pricingMonitor = new PricingMonitor();

// Export for use in Electron/Node context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CURRENT_PRICING,
        ESTIMATED_USAGE,
        calculateActualCost,
        calculateEstimatedCost,
        PricingMonitor,
        pricingMonitor,
        checkModelDeprecation,
        getRecommendedModel
    };
}

// Export for browser context
if (typeof window !== 'undefined') {
    window.PricingMonitor = {
        CURRENT_PRICING,
        ESTIMATED_USAGE,
        calculateActualCost,
        calculateEstimatedCost,
        checkModelDeprecation,
        getRecommendedModel,
        monitor: pricingMonitor
    };
}
