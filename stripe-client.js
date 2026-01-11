// stripe-client.js - Stripe Payment Client
// Handles Stripe Checkout and subscription management

class StripeClient {
    constructor(stripePublishableKey) {
        this.stripePublishableKey = stripePublishableKey || process.env.STRIPE_PUBLISHABLE_KEY;
        this.checkoutSessionUrl = null;
    }
    
    /**
     * Create Stripe Checkout Session for subscription
     * Note: This requires a backend API endpoint. Update the API_URL to your backend.
     */
    async createCheckoutSession(tierId, successUrl, cancelUrl) {
        try {
            const tier = require('./stripe-config').getTier(tierId);
            
            if (!tier.stripePriceId) {
                throw new Error(`No Stripe Price ID configured for tier: ${tierId}. Please set up Stripe products first.`);
            }
            
            // Backend API URL - Update this to your actual backend endpoint
            const API_URL = process.env.STRIPE_API_URL || 'https://api.projectcoachai.com/stripe';
            
            // Create checkout session via your backend API
            const response = await fetch(`${API_URL}/create-checkout-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    priceId: tier.stripePriceId,
                    tierId: tierId,
                    successUrl: successUrl || `${window.location.origin}/pricing.html?session_id={CHECKOUT_SESSION_ID}`,
                    cancelUrl: cancelUrl || `${window.location.origin}/pricing.html?canceled=true`
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to create checkout session: ${errorText}`);
            }
            
            const data = await response.json();
            this.checkoutSessionUrl = data.url;
            return data;
        } catch (error) {
            console.error('Stripe checkout error:', error);
            throw error;
        }
    }
    
    /**
     * Open Stripe Checkout in browser
     */
    async openCheckout(tierId) {
        try {
            const session = await this.createCheckoutSession(tierId);
            
            // Open in default browser
            const { shell } = require('electron');
            await shell.openExternal(session.url);
            
            return { success: true, sessionId: session.sessionId };
        } catch (error) {
            console.error('Error opening Stripe checkout:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Verify subscription status
     */
    async verifySubscription(sessionId) {
        try {
            const response = await fetch(`https://api.projectcoachai.com/stripe/verify-session/${sessionId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to verify subscription');
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Subscription verification error:', error);
            throw error;
        }
    }
    
    /**
     * Get customer portal URL for managing subscription
     */
    async getCustomerPortalUrl(customerId) {
        try {
            const response = await fetch('https://api.projectcoachai.com/stripe/create-portal-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    customerId: customerId,
                    returnUrl: 'projectcoachai://subscription-managed'
                })
            });
            
            if (!response.ok) {
                throw new Error('Failed to create portal session');
            }
            
            const data = await response.json();
            return data.url;
        } catch (error) {
            console.error('Customer portal error:', error);
            throw error;
        }
    }
}

// Export for use in Electron
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StripeClient;
}


