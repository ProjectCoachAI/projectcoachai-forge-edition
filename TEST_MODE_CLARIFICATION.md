# Test Mode vs Production Mode - Clarification

## Current Configuration

**We are working in TEST MODE** by default.

### Stripe Configuration

The app uses **TEST MODE** Stripe keys and price IDs by default:

```javascript
// stripe-config.js
const STRIPE_MODE = process.env.STRIPE_MODE || 'test'; // Defaults to 'test'
```

### Test Mode Price IDs (Currently Active)
- Creator: `price_1Smim8D9SDC8fk3Bn8O6zXh0` ($14.95/month)
- Professional: `price_1SmioHD9SDC8fk3BJ2ADKiBX` ($34.95/month)
- Team: `price_1SmippD9SDC8fk3B7Aq1DglU` ($59.95/month)

### Production Mode Price IDs (Not Active)
- Creator: `price_1SmiW2D9SDC8fk3BeVx8z6Cq`
- Professional: `price_1SmicRD9SDC8fk3Bu7lTCFyw`
- Team: `price_1SmifSD9SDC8fk3Bujjy1Nsh`

## Stripe Dashboard Branding - IMPORTANT

**Visual branding (logo, colors) must be configured in BOTH test and production modes separately.**

### For Test Mode (Current):
1. Go to Stripe Dashboard
2. **Toggle to TEST MODE** (toggle switch in top right)
3. Navigate to **Settings** → **Branding**
4. Configure:
   - Logo upload
   - Brand color: `#ff6b35`
   - Company name: `Xencore Global GmbH`
   - Business website: `https://projectcoachai.com`

### For Production Mode (Future):
1. Go to Stripe Dashboard
2. **Toggle to LIVE MODE** (toggle switch in top right)
3. Navigate to **Settings** → **Branding**
4. Configure the same branding settings

## Where Changes Are Applied

### Test Mode (Current - What We're Using):
- ✅ Cloudflare Worker uses test mode Stripe secret key
- ✅ Forge app uses test mode price IDs
- ✅ Stripe Dashboard TEST MODE branding must be configured
- ✅ All test payments go through Stripe test mode

### Production Mode (Future):
- ⚠️ Requires switching `STRIPE_MODE` to `'live'` or `'production'`
- ⚠️ Requires production Stripe secret key in Cloudflare Worker
- ⚠️ Requires Stripe Dashboard LIVE MODE branding configuration
- ⚠️ Real payments will be processed

## Current Status

**All changes are being applied to TEST MODE:**
- ✅ Cloudflare Worker: Uses test mode Stripe API
- ✅ Forge App: Uses test mode price IDs
- ⚠️ Stripe Dashboard: **YOU MUST CONFIGURE TEST MODE BRANDING**

## How to Switch to Production

When ready for production:

1. **Update Cloudflare Worker:**
   - Set `STRIPE_SECRET_KEY` to production key (starts with `sk_live_`)

2. **Update Forge App:**
   - Set environment variable: `STRIPE_MODE=live`
   - Or modify `stripe-config.js`: `const STRIPE_MODE = 'live';`

3. **Configure Stripe Dashboard LIVE MODE:**
   - Toggle to LIVE MODE
   - Configure branding (logo, colors, company name)

4. **Rebuild Forge App:**
   ```bash
   npm run build:mac
   npm run build:win
   ```

## Testing Checklist

- [ ] Stripe Dashboard TEST MODE branding configured
- [ ] Test checkout shows logo and brand colors
- [ ] Test payments work correctly
- [ ] Protocol handler works (`forge://` redirects)
- [ ] Feedback popup works without blocking
- [ ] Back button returns to Forge homepage
