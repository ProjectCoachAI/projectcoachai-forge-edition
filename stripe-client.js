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
     * @param {string} tierId - Pricing tier ID (creator, professional, team)
     * @param {string} successUrl - Success redirect URL (optional)
     * @param {string} cancelUrl - Cancel redirect URL (optional)
     * @param {object} userInfo - User information { email, userId } (optional)
     */
    async createCheckoutSession(tierId, successUrl, cancelUrl, userInfo = {}) {
        try {
            const tier = require('./stripe-config').getTier(tierId);
            
            if (!tier.stripePriceId) {
                throw new Error(`No Stripe Price ID configured for tier: ${tierId}. Please set up Stripe products first.`);
            }
            
            // Backend API URL - Cloudflare Worker endpoint
            const API_URL = process.env.STRIPE_API_URL || 'https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe';
            
            // Create checkout session via your backend API
            // Use custom protocol (forge://) to redirect back to Forge app, not website
            const defaultSuccessUrl = successUrl || `forge://subscription-success?session_id={CHECKOUT_SESSION_ID}`;
            const defaultCancelUrl = cancelUrl || `forge://subscription-cancel?canceled=true`;
            
            // Use Node's https module as fallback if fetch is not available
            let response;
            try {
                // Try using fetch (available in Node 18+)
                if (typeof fetch === 'function') {
                    // Build headers with user info for branding/pre-fill
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    if (userInfo.email) {
                        headers['x-user-email'] = userInfo.email;
                    }
                    if (userInfo.userId) {
                        headers['x-user-id'] = userInfo.userId;
                    }
                    
                    response = await fetch(`${API_URL}/create-checkout-session`, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({
                            priceId: tier.stripePriceId,
                            tierId: tierId,
                            successUrl: defaultSuccessUrl,
                            cancelUrl: defaultCancelUrl
                        })
                    });
                } else {
                    // Fallback to Node's https module
                    const https = require('https');
                    const url = require('url');
                    const parsedUrl = url.parse(`${API_URL}/create-checkout-session`);
                    
                    const postData = JSON.stringify({
                        priceId: tier.stripePriceId,
                        tierId: tierId,
                        successUrl: defaultSuccessUrl,
                        cancelUrl: defaultCancelUrl
                    });
                    
                    response = await new Promise((resolve, reject) => {
                        const options = {
                            hostname: parsedUrl.hostname,
                            port: parsedUrl.port || 443,
                            path: parsedUrl.path,
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Content-Length': Buffer.byteLength(postData)
                            }
                        };
                        
                        const req = https.request(options, (res) => {
                            let data = '';
                            res.on('data', (chunk) => { data += chunk; });
                            res.on('end', () => {
                                resolve({
                                    ok: res.statusCode >= 200 && res.statusCode < 300,
                                    status: res.statusCode,
                                    statusText: res.statusMessage,
                                    json: async () => JSON.parse(data),
                                    text: async () => data
                                });
                            });
                        });
                        
                        req.on('error', reject);
                        req.write(postData);
                        req.end();
                    });
                }
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Failed to create checkout session (${response.status}): ${errorText || 'API endpoint not available'}`);
                }
                
                const data = await response.json();
                this.checkoutSessionUrl = data.url;
                return data;
            } catch (fetchError) {
                // Enhanced error handling for network/API issues
                if (fetchError.code === 'ENOTFOUND' || fetchError.code === 'ECONNREFUSED' || fetchError.message.includes('fetch failed')) {
                    throw new Error(`Cannot connect to Stripe API endpoint (${API_URL}). Please ensure the backend API is running and accessible.`);
                }
                throw fetchError;
            }
        } catch (error) {
            console.error('Stripe checkout error:', error);
            throw error;
        }
    }
    
    /**
     * Open Stripe Checkout in browser
     * @param {string} tierId - Pricing tier ID
     * @param {object} userInfo - User information { email, userId } (optional)
     */
    async openCheckout(tierId, userInfo = {}) {
        try {
            const session = await this.createCheckoutSession(tierId, null, null, userInfo);
            
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
            const API_URL = process.env.STRIPE_API_URL || 'https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe';
            const response = await fetch(`${API_URL}/verify-session/${sessionId}`, {
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
            const API_URL = process.env.STRIPE_API_URL || 'https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe';
            const response = await fetch(`${API_URL}/create-portal-session`, {
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


