/**
 * Synthesis Usage Tracker
 * Tracks synthesis generation usage per user tier with monthly limits
 * Uses localStorage for Electron desktop app (can be migrated to backend later)
 */

// Get current month key for usage tracking (format: YYYY-MM)
function getCurrentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Get month end date (for reset countdown)
function getMonthEndDate() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    nextMonth.setHours(23, 59, 59, 999);
    return nextMonth;
}

// Get days until reset
function getDaysUntilReset() {
    const resetDate = getMonthEndDate();
    const now = new Date();
    const diffTime = resetDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
}

function normalizeKeySegment(value, fallback) {
    const raw = (value || fallback || '').toString();
    const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (normalized.length === 0) {
        return (fallback || 'public').toString().toLowerCase();
    }
    return normalized.slice(0, 64);
}

function buildStorageKey(monthKey, userTier, userKey) {
    const tierSegment = normalizeKeySegment(userTier, 'starter');
    const userSegment = normalizeKeySegment(userKey, 'public');
    return `synthesis_usage_${monthKey}_${tierSegment}_${userSegment}`;
}

function getLegacyStorageKey(monthKey, userTier) {
    const tierSegment = normalizeKeySegment(userTier, 'starter');
    return `synthesis_usage_${monthKey}_${tierSegment}`;
}

// Get synthesis usage for current month
function getSynthesisUsage(userTier = 'starter', userKey = 'public') {
    try {
        const monthKey = getCurrentMonthKey();
        const storageKey = buildStorageKey(monthKey, userTier, userKey);
        let stored = localStorage.getItem(storageKey);

        // Fall back to legacy storage key when migrating from prior versions
        if (!stored) {
            const legacyKey = getLegacyStorageKey(monthKey, userTier);
            const legacyValue = localStorage.getItem(legacyKey);
            if (legacyValue) {
                stored = legacyValue;
                localStorage.setItem(storageKey, stored);
            }
        }
        
        if (stored) {
            const usage = JSON.parse(stored);
            return {
                used: usage.used || 0,
                limit: usage.limit || getMaxSynthesesForTier(userTier),
                month: monthKey,
                resetDate: usage.resetDate || getMonthEndDate().toISOString(),
                entries: usage.entries || []
            };
        }
        
        // No usage yet this month - initialize
        const limit = getMaxSynthesesForTier(userTier);
        return {
            used: 0,
            limit: limit,
            month: monthKey,
            resetDate: getMonthEndDate().toISOString(),
            entries: []
        };
    } catch (error) {
        console.error('Error getting synthesis usage:', error);
        // Return safe defaults
        return {
            used: 0,
            limit: getMaxSynthesesForTier(userTier),
            month: getCurrentMonthKey(),
            resetDate: getMonthEndDate().toISOString(),
            entries: []
        };
    }
}

// Get max syntheses for tier (import from stripe-config if available)
function getMaxSynthesesForTier(userTier) {
    // Try to import from stripe-config if in Electron context
    try {
        if (typeof require !== 'undefined') {
            const { getMaxSynthesesPerMonth } = require('./stripe-config.js');
            return getMaxSynthesesPerMonth(userTier);
        }
    } catch (e) {
        // Not in Electron context or module not available
    }
    
    // Fallback: hardcoded limits
    const limits = {
        'starter': 30,
        'lite': 100,
        'creator': 100,
        'pro': 300,
        'professional': 300,
        'team': -1, // Unlimited
        'enterprise': -1 // Unlimited
    };
    
    return limits[userTier] || limits['starter'];
}

// Increment synthesis usage
function incrementSynthesisUsage(userTier = 'starter', frameworkType = 'unknown', modelUsed = 'unknown', metadata = {}, userKey = 'public') {
    try {
        const monthKey = getCurrentMonthKey();
        const storageKey = buildStorageKey(monthKey, userTier, userKey);
        const usage = getSynthesisUsage(userTier, userKey);
        
        // Check if limit reached
        if (usage.limit > 0 && usage.used >= usage.limit) {
            throw new Error(`Monthly synthesis limit reached (${usage.limit}). Upgrade for more or wait until ${new Date(usage.resetDate).toLocaleDateString()}.`);
        }
        
        // Increment usage
        usage.used += 1;
        usage.entries.push({
            timestamp: new Date().toISOString(),
            frameworkType: frameworkType,
            modelUsed: modelUsed,
            metadata: metadata
        });
        
        // Save to localStorage
        localStorage.setItem(storageKey, JSON.stringify(usage));
        
        console.log(`📊 [Usage Tracker] Synthesis usage: ${usage.used}/${usage.limit} (${((usage.used / usage.limit) * 100).toFixed(1)}%)`);
        
        return usage;
    } catch (error) {
        console.error('Error incrementing synthesis usage:', error);
        throw error;
    }
}

// Check if user can generate synthesis (has remaining quota)
function canGenerateSynthesis(userTier = 'starter', userKey = 'public') {
    const usage = getSynthesisUsage(userTier, userKey);
    
    // Unlimited tier (team, enterprise)
    if (usage.limit === -1 || usage.limit === null) {
        return { allowed: true, reason: 'unlimited' };
    }
    
    // Check if limit reached
    if (usage.used >= usage.limit) {
        return {
            allowed: false,
            reason: 'limit_reached',
            used: usage.used,
            limit: usage.limit,
            resetDate: usage.resetDate,
            daysUntilReset: getDaysUntilReset()
        };
    }
    
    // Check if approaching limit (80% threshold)
    const percentage = (usage.used / usage.limit) * 100;
    if (percentage >= 80) {
        return {
            allowed: true,
            reason: 'approaching_limit',
            used: usage.used,
            limit: usage.limit,
            percentage: percentage.toFixed(1),
            resetDate: usage.resetDate,
            daysUntilReset: getDaysUntilReset()
        };
    }
    
    return {
        allowed: true,
        reason: 'available',
        used: usage.used,
        limit: usage.limit,
        remaining: usage.limit - usage.used,
        resetDate: usage.resetDate,
        daysUntilReset: getDaysUntilReset()
    };
}

// Get usage statistics for display
function getUsageStatistics(userTier = 'starter', userKey = 'public') {
    const usage = getSynthesisUsage(userTier, userKey);
    const canGenerate = canGenerateSynthesis(userTier, userKey);
    
    return {
        used: usage.used,
        limit: usage.limit,
        remaining: usage.limit > 0 ? Math.max(0, usage.limit - usage.used) : 'unlimited',
        percentage: usage.limit > 0 ? ((usage.used / usage.limit) * 100).toFixed(1) : 0,
        resetDate: usage.resetDate,
        daysUntilReset: getDaysUntilReset(),
        canGenerate: canGenerate.allowed,
        reason: canGenerate.reason,
        isUnlimited: usage.limit === -1 || usage.limit === null,
        entries: usage.entries.length
    };
}

// Reset usage (for testing or admin purposes)
function resetUsage(userTier = 'starter', monthKey = null, userKey = 'public') {
    try {
        const key = monthKey || getCurrentMonthKey();
        const primaryKey = buildStorageKey(key, userTier, userKey);
        localStorage.removeItem(primaryKey);
        const legacyKey = getLegacyStorageKey(key, userTier);
        localStorage.removeItem(legacyKey);
        console.log(`🔄 [Usage Tracker] Reset usage for ${userTier} in ${key}`);
        return true;
    } catch (error) {
        console.error('Error resetting usage:', error);
        return false;
    }
}

// Export for use in browser context
if (typeof window !== 'undefined') {
    window.SynthesisUsageTracker = {
        getUsage: getSynthesisUsage,
        increment: incrementSynthesisUsage,
        canGenerate: canGenerateSynthesis,
        getStatistics: getUsageStatistics,
        reset: resetUsage,
        getCurrentMonthKey,
        getMonthEndDate,
        getDaysUntilReset
    };
}

// Export for use in Electron/Node context
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getSynthesisUsage,
        incrementSynthesisUsage,
        canGenerateSynthesis,
        getUsageStatistics,
        resetUsage,
        getCurrentMonthKey,
        getMonthEndDate,
        getDaysUntilReset,
        getMaxSynthesesForTier
    };
}

