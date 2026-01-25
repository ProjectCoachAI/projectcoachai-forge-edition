// Cloudflare Worker for Stripe API
// Handles Stripe checkout sessions and subscription management

// Price IDs (matching stripe-config.js in the Forge app)
const PRICE_IDS = {
  creator: 'price_1Smim8D9SDC8fk3Bn8O6zXh0',
  professional: 'price_1SmioHD9SDC8fk3BJ2ADKiBX',
  team: 'price_1SmippD9SDC8fk3B7Aq1DglU'
};

export default {
  async fetch(request, env) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-User-ID',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Route: POST /api/stripe/create-checkout-session
    if (path === '/api/stripe/create-checkout-session' && request.method === 'POST') {
      try {
        const { priceId, tierId, successUrl, cancelUrl } = await request.json();

        if (!priceId) {
          return new Response(
            JSON.stringify({ error: 'Price ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create Stripe checkout session with ProjectCoach AI Forge Edition branding
        const userEmail = request.headers.get('x-user-email');
        const userId = request.headers.get('x-user-id') || 'anonymous';
        
        // Build URLSearchParams with conditional fields
        const params = new URLSearchParams({
          'payment_method_types[0]': 'card',
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': '1',
          'mode': 'subscription',
          'success_url': successUrl || 'forge://subscription-success?session_id={CHECKOUT_SESSION_ID}',
          'cancel_url': cancelUrl || 'forge://subscription-cancel?canceled=true',
          // Branding & Customization
          'billing_address_collection': 'auto', // Collect billing address automatically
          'allow_promotion_codes': 'true', // Allow promo codes
          'customer_creation': 'always', // Always create customer
          'locale': 'auto', // Auto-detect user locale
          // Additional branding (note: visual branding must be set in Stripe Dashboard)
          'payment_method_collection': 'if_required', // Only collect if needed
          'consent_collection[terms_of_service]': 'required', // Require ToS acceptance
          // Subscription metadata
          'subscription_data[metadata][tierId]': tierId || '',
          'subscription_data[metadata][userId]': userId,
          'subscription_data[metadata][product]': 'ProjectCoach AI Forge Edition',
          'subscription_data[description]': `ProjectCoach AI Forge Edition - ${tierId || 'Subscription'}`,
          // Session metadata
          'metadata[tierId]': tierId || '',
          'metadata[userId]': userId,
          'metadata[product]': 'ProjectCoach AI Forge Edition',
          'metadata[brand]': 'ProjectCoach AI',
          'metadata[edition]': 'Forge Edition',
          'metadata[company]': 'Xencore Global GmbH', // Legal entity (shown in footer)
          'metadata[country]': 'Switzerland',
        });
        
        // Only add customer_email if provided (pre-fills email in checkout)
        if (userEmail) {
          params.append('customer_email', userEmail);
        }
        
        const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params,
        });

        const session = await stripeResponse.json();

        if (!stripeResponse.ok) {
          return new Response(
            JSON.stringify({ error: session.error?.message || 'Failed to create checkout session' }),
            { status: stripeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            sessionId: session.id,
            url: session.url,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Stripe checkout error:', error);
        return new Response(
          JSON.stringify({ error: error.message || 'Internal server error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Route: GET /api/stripe/verify-session/:sessionId
    if (path.startsWith('/api/stripe/verify-session/') && request.method === 'GET') {
      try {
        const sessionId = path.split('/').pop();

        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: 'Session ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Retrieve Stripe checkout session
        const stripeResponse = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
          headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
          },
        });

        const session = await stripeResponse.json();

        if (!stripeResponse.ok) {
          return new Response(
            JSON.stringify({ error: session.error?.message || 'Failed to verify session' }),
            { status: stripeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (session.payment_status === 'paid' && session.subscription) {
          // Get subscription details
          const subResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
            headers: {
              'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            },
          });

          const subscription = await subResponse.json();

          return new Response(
            JSON.stringify({
              success: true,
              tier: session.metadata?.tierId || subscription.metadata?.tierId,
              customerId: session.customer,
              subscriptionId: session.subscription,
              expiresAt: subscription.current_period_end * 1000, // Convert to milliseconds
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Payment not completed',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (error) {
        console.error('Session verification error:', error);
        return new Response(
          JSON.stringify({ error: error.message || 'Internal server error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Route: POST /api/stripe/create-portal-session
    if (path === '/api/stripe/create-portal-session' && request.method === 'POST') {
      try {
        const { customerId, returnUrl } = await request.json();

        if (!customerId) {
          return new Response(
            JSON.stringify({ error: 'Customer ID required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create customer portal session
        const stripeResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            customer: customerId,
            return_url: returnUrl || 'projectcoachai://subscription-managed',
          }),
        });

        const session = await stripeResponse.json();

        if (!stripeResponse.ok) {
          return new Response(
            JSON.stringify({ error: session.error?.message || 'Failed to create portal session' }),
            { status: stripeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ url: session.url }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } catch (error) {
        console.error('Portal session error:', error);
        return new Response(
          JSON.stringify({ error: error.message || 'Internal server error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Health check
    if (path === '/health' || path === '/api/stripe/health') {
      return new Response(
        JSON.stringify({ status: 'ok', service: 'stripe-api' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 404 Not Found
    return new Response(
      JSON.stringify({ error: 'Not Found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  },
};
