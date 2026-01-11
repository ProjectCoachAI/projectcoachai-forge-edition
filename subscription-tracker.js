// subscription-tracker.js - Track all subscription events
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SubscriptionTracker {
    constructor() {
        this.trackingFile = path.join(app.getPath('userData'), 'subscription-events.json');
        this.events = this.loadEvents();
    }
    
    loadEvents() {
        try {
            if (fs.existsSync(this.trackingFile)) {
                const data = fs.readFileSync(this.trackingFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading subscription events:', error);
        }
        return {
            events: [],
            summary: {
                totalUpgrades: 0,
                totalDowngrades: 0,
                totalCancellations: 0,
                revenue: 0,
                byTier: {
                    starter: { count: 0, revenue: 0 },
                    lite: { count: 0, revenue: 0 },
                    pro: { count: 0, revenue: 0 },
                    enterprise: { count: 0, revenue: 0 }
                }
            }
        };
    }
    
    saveEvents() {
        try {
            fs.writeFileSync(this.trackingFile, JSON.stringify(this.events, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving subscription events:', error);
        }
    }
    
    trackEvent(type, data) {
        const event = {
            timestamp: new Date().toISOString(),
            type: type, // 'upgrade', 'downgrade', 'cancel', 'limit_hit', 'pricing_viewed', 'checkout_started'
            data: data,
            userId: data.userId || 'local-user',
            sessionId: data.sessionId || `session-${Date.now()}`
        };
        
        this.events.events.push(event);
        
        // Update summary
        this.updateSummary(event);
        
        // Save to file
        this.saveEvents();
        
        // Log for debugging
        console.log(`📊 [Subscription Tracker] ${type}:`, data);
        
        return event;
    }
    
    updateSummary(event) {
        const { summary } = this.events;
        
        switch (event.type) {
            case 'upgrade':
                summary.totalUpgrades++;
                if (event.data.toTier && event.data.price) {
                    summary.revenue += event.data.price;
                    if (summary.byTier[event.data.toTier]) {
                        summary.byTier[event.data.toTier].count++;
                        summary.byTier[event.data.toTier].revenue += event.data.price;
                    }
                }
                break;
            case 'downgrade':
                summary.totalDowngrades++;
                break;
            case 'cancel':
                summary.totalCancellations++;
                break;
            case 'limit_hit':
                // Track when users hit limits (conversion opportunity)
                if (!summary.limitHits) summary.limitHits = {};
                const limitType = event.data.limitType || 'unknown';
                summary.limitHits[limitType] = (summary.limitHits[limitType] || 0) + 1;
                break;
            case 'pricing_viewed':
                if (!summary.pricingViews) summary.pricingViews = 0;
                summary.pricingViews++;
                break;
            case 'checkout_started':
                if (!summary.checkoutStarts) summary.checkoutStarts = 0;
                summary.checkoutStarts++;
                break;
        }
    }
    
    trackLimitHit(currentTier, limitType, attemptedValue, maxAllowed) {
        return this.trackEvent('limit_hit', {
            currentTier: currentTier,
            limitType: limitType, // 'panes', 'ai_access', 'feature'
            attemptedValue: attemptedValue,
            maxAllowed: maxAllowed,
            timestamp: new Date().toISOString()
        });
    }
    
    trackPricingViewed(source) {
        return this.trackEvent('pricing_viewed', {
            source: source, // 'limit_hit', 'button_click', 'upgrade_prompt'
            timestamp: new Date().toISOString()
        });
    }
    
    trackUpgrade(fromTier, toTier, price, stripeSessionId) {
        return this.trackEvent('upgrade', {
            fromTier: fromTier,
            toTier: toTier,
            price: price,
            stripeSessionId: stripeSessionId,
            timestamp: new Date().toISOString()
        });
    }
    
    trackCheckoutStarted(tierId, price) {
        return this.trackEvent('checkout_started', {
            tierId: tierId,
            price: price,
            timestamp: new Date().toISOString()
        });
    }
    
    getSummary() {
        return this.events.summary;
    }
    
    getAllEvents() {
        return this.events.events;
    }
    
    getEventsByType(type) {
        return this.events.events.filter(e => e.type === type);
    }
    
    // Export data for analytics
    exportData() {
        return {
            summary: this.events.summary,
            events: this.events.events,
            exportDate: new Date().toISOString()
        };
    }
}

module.exports = SubscriptionTracker;













