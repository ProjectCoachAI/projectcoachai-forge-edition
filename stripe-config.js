// stripe-config.js - Stripe Configuration & Pricing Tiers

// Stripe Mode: 'test' or 'live' (defaults to 'test' for development)
const STRIPE_MODE = process.env.STRIPE_MODE || 'test';

// Test Mode Price IDs (from Stripe Dashboard → Test Mode)
const TEST_PRICE_IDS = {
    creator: process.env.STRIPE_TEST_CREATOR_PRICE_ID || 'price_1Smim8D9SDC8fk3Bn8O6zXh0', // Creator (test): $14.95/month
    professional: process.env.STRIPE_TEST_PROFESSIONAL_PRICE_ID || 'price_1SmioHD9SDC8fk3BJ2ADKiBX', // Professional (test): $34.95/month
    team: process.env.STRIPE_TEST_TEAM_PRICE_ID || 'price_1SmippD9SDC8fk3B7Aq1DglU' // Team (test): $59.95/month
};

// Production Mode Price IDs (already configured)
const PRODUCTION_PRICE_IDS = {
    creator: 'price_1SmiW2D9SDC8fk3BeVx8z6Cq',
    professional: 'price_1SmicRD9SDC8fk3Bu7lTCFyw',
    team: 'price_1SmifSD9SDC8fk3Bujjy1Nsh'
};

// Get the appropriate Price ID based on current mode
function getPriceId(tier) {
    if (STRIPE_MODE === 'live' || STRIPE_MODE === 'production') {
        return PRODUCTION_PRICE_IDS[tier] || null;
    } else {
        // Test mode - use environment variable or fallback to production (for testing)
        return TEST_PRICE_IDS[tier] || PRODUCTION_PRICE_IDS[tier] || null;
    }
}

const PRICING_TIERS = {
    starter: {
        id: 'starter',
        name: 'Starter',
        price: 0,
        priceDisplay: '$0',
        billing: 'forever free',
        stripePriceId: null, // Free tier, no Stripe price
        features: {
            maxPanes: null, // Unlimited - user can choose any configuration (2, 4, 8)
            maxAIModels: null, // All AI models available
            maxComparisons: null, // Unlimited comparisons
            savedComparisons: 100, // Increased from 5
            synthesisModes: 7, // All 7 synthesis modes (increased from 1)
            maxSynthesesPerMonth: 30, // New limit - this is the only constraint
            rankingScoring: true, // Enabled (was false)
            fileAttachments: true, // Enabled (was false)
            templateLibrary: 'full', // Full access (was 'basic')
            exportFormats: ['pdf', 'json', 'markdown'], // All formats (was empty)
            publicSharing: true, // New feature for free tier
            agenticChains: false,
            teamCollaboration: false,
            support: 'community'
        },
        allowedAIs: 'all', // All AI models available (was limited to 2)
        synthesisModel: 'free', // Claude Haiku / GPT-3.5 Turbo for free tier
        description: 'Perfect for exploring AI and daily comparisons',
        tagline: 'Everything you need. Free forever.'
    },
    
    lite: {
        id: 'lite',
        name: 'Creator',
        price: 14.95,
        priceDisplay: '$14.95',
        billing: 'per month',
        stripePriceId: process.env.STRIPE_CREATOR_PRICE_ID || getPriceId('creator'), // Creator: $14.95/month
        features: {
            // All Starter features included
            maxPanes: null, // Unlimited
            maxAIModels: null, // All models
            maxComparisons: null, // Unlimited
            savedComparisons: -1, // Unlimited (increased from 25)
            synthesisModes: 7, // All 7 modes (increased from 3)
            maxSynthesesPerMonth: 100, // Increased from previous
            rankingScoring: 'advanced', // Advanced (was 'basic')
            fileAttachments: true,
            templateLibrary: 'full',
            exportFormats: ['pdf', 'json', 'markdown'],
            publicSharing: true,
            // Premium features
            premiumAIModels: true, // Claude Sonnet 4, GPT-4 for synthesis
            priorityProcessing: true, // 2x faster synthesis
            customSynthesisPrompts: true, // Customize analysis frameworks
            advancedRanking: true, // Custom metrics
            customTemplates: true, // Save and reuse own templates
            whiteLabelExports: true, // Remove ProjectCoach branding
            creatorBadge: true, // Visible in community
            communityFeatured: true, // Featured in showcase
            earlyAccess: true, // Early access to new features
            votingPowerMultiplier: 2, // 2x voting power in community
            agenticChains: false,
            teamCollaboration: false,
            support: 'community'
        },
        allowedAIs: 'all', // All models (was limited to 4)
        synthesisModel: 'premium', // Claude Sonnet 4 / GPT-4
        description: 'For serious coaches & creators',
        badge: 'Most Popular'
    },
    
    pro: {
        id: 'pro',
        name: 'Professional',
        price: 34.95,
        priceDisplay: '$34.95',
        billing: 'per month',
        stripePriceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || getPriceId('professional'), // Professional: $34.95/month
        features: {
            // All Creator features included
            maxPanes: null, // Unlimited
            maxAIModels: null, // All models
            maxComparisons: null, // Unlimited
            savedComparisons: -1, // Unlimited
            synthesisModes: 7, // All 7 modes
            maxSynthesesPerMonth: 300, // Increased from previous
            rankingScoring: 'advanced',
            fileAttachments: true,
            templateLibrary: 'full_custom',
            exportFormats: ['pdf', 'json', 'markdown', 'csv', 'api'], // Added CSV and API
            publicSharing: true,
            premiumAIModels: true,
            priorityProcessing: true,
            customSynthesisPrompts: true,
            advancedRanking: true,
            customTemplates: true,
            whiteLabelExports: true,
            creatorBadge: true,
            communityFeatured: true,
            earlyAccess: true,
            votingPowerMultiplier: 2,
            // Professional-only features
            agenticChains: true, // Multi-step AI workflows
            batchProcessing: true, // Process multiple comparisons at once
            apiAccess: true, // Programmatic access to comparisons
            scheduledComparisons: true, // Automated comparison generation
            webhookNotifications: true, // Get notified on completion
            playgroundMode: true, // Access to experimental features
            customAIIntegrations: true, // Connect additional AI models
            advancedAnalytics: true, // Usage insights, trends
            historicalTrends: true, // Historical trend analysis
            teamCollaboration: false,
            support: 'priority'
        },
        allowedAIs: 'all', // All available
        synthesisModel: 'premium', // Claude Sonnet 4 / GPT-4
        description: 'For AI trainers, analysts, and agencies'
    },
    
    team: {
        id: 'team',
        name: 'Team',
        price: 59.95,
        priceDisplay: '$59.95',
        billing: 'per month',
        stripePriceId: process.env.STRIPE_TEAM_PRICE_ID || getPriceId('team'), // Team: $59.95/month
        features: {
            maxPanes: 12,
            maxAIModels: 999, // All models
            savedComparisons: -1, // Unlimited
            synthesisModes: 7, // All 7 modes
            maxSynthesesPerMonth: -1, // Unlimited
            rankingScoring: 'advanced',
            fileAttachments: true,
            templateLibrary: 'full_custom',
            exportFormats: ['pdf', 'json', 'markdown'],
            agenticChains: true,
            teamCollaboration: true,
            support: 'priority'
        },
        allowedAIs: 'all', // All available
        description: 'For small teams, studios, and partnerships (5 seats)'
    },
    
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        price: null,
        priceDisplay: 'Custom',
        billing: 'custom pricing',
        stripePriceId: null, // Custom pricing, contact sales
        features: {
            maxPanes: 16,
            maxAIModels: 999, // All + custom
            savedComparisons: -1, // Unlimited
            synthesisModes: 7, // All 7 + custom
            maxSynthesesPerMonth: -1, // Unlimited
            rankingScoring: 'advanced_custom',
            fileAttachments: true,
            templateLibrary: 'full_team',
            exportFormats: ['pdf', 'json', 'markdown'],
            agenticChains: true,
            teamCollaboration: true,
            support: 'dedicated'
        },
        allowedAIs: 'all', // All + custom
        description: 'For organizations & coaching platforms'
    }
};

// Get tier by ID
function getTier(tierId) {
    return PRICING_TIERS[tierId] || PRICING_TIERS.starter;
}

// Get user's current tier (from localStorage or subscription)
function getUserTier() {
    try {
        const stored = localStorage.getItem('user_subscription_tier');
        return stored || 'starter';
    } catch {
        return 'starter';
    }
}

// Check if feature is available for user's tier
function hasFeature(tierId, feature) {
    const tier = getTier(tierId);
    return tier.features[feature] !== false && tier.features[feature] !== 0 && tier.features[feature] !== null;
}

// Check if user can use AI model
function canUseAI(tierId, aiId) {
    const tier = getTier(tierId);
    if (tier.allowedAIs === 'all') return true;
    return tier.allowedAIs.includes(aiId);
}

// Get max panes for tier (null means unlimited - user can choose any configuration)
function getMaxPanes(tierId) {
    const tier = getTier(tierId);
    // null means unlimited - allow any number of panes (2, 4, 8, etc.)
    return tier.features.maxPanes;
}

// Get max syntheses per month for tier (-1 means unlimited)
function getMaxSynthesesPerMonth(tierId) {
    const tier = getTier(tierId);
    const limit = tier.features.maxSynthesesPerMonth;
    // Use explicit check: 0 and -1 are valid values, only default to 0 if truly undefined/null
    return (limit !== undefined && limit !== null) ? limit : 0;
}

// Get synthesis model type for tier (free: Claude Haiku/GPT-3.5, paid: Claude Sonnet 4/GPT-4)
function getSynthesisModel(tierId) {
    const tier = getTier(tierId);
    return tier.synthesisModel || 'free';
}

// Check if feature is enabled for tier
function isFeatureEnabled(tierId, featureName) {
    const tier = getTier(tierId);
    const feature = tier.features[featureName];
    // Check various ways a feature might be enabled
    if (feature === true || feature === 'full' || feature === 'advanced' || feature === 'full_custom') {
        return true;
    }
    // Check for numeric values > 0
    if (typeof feature === 'number' && feature > 0) {
        return true;
    }
    // -1 means unlimited
    if (feature === -1) {
        return true;
    }
    return false;
}

// Export for use in Electron
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PRICING_TIERS,
        getTier,
        getUserTier,
        hasFeature,
        canUseAI,
        getMaxPanes,
        getMaxSynthesesPerMonth,
        getSynthesisModel,
        isFeatureEnabled,
        STRIPE_MODE,
        getPriceId,
        TEST_PRICE_IDS,
        PRODUCTION_PRICE_IDS
    };
}










