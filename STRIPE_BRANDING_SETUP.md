# Stripe Visual Branding Setup (REQUIRED)

## ⚠️ Important: Visual Branding Must Be Configured in Stripe Dashboard

The API parameters we've added will pre-fill email and add metadata, but **visual branding** (logo, colors, company name display) **MUST** be configured in the Stripe Dashboard.

## Step-by-Step: Configure Stripe Dashboard Branding

1. **Go to Stripe Dashboard**
   - Visit: https://dashboard.stripe.com/
   - Log in to your account

2. **Navigate to Branding Settings**
   - Click **Settings** (gear icon) in left sidebar
   - Click **Branding** under "Business settings"

3. **Upload Logo**
   - Click **Upload logo**
   - Use **fire icon** (🔥) logo - matches branding document
   - Recommended: 128x128px PNG, transparent background
   - Logo will appear in checkout header
   - **NOT** Xencore Global GmbH logo - use ProjectCoach AI fire icon

4. **Set Brand Color**
   - **Primary color**: `#ff6b35` (orange accent - matches Forge branding)
   - This color will be used for buttons and accents

5. **Company Information**
   - **Company name**: `ProjectCoach AI` ⚠️ **NOT** Xencore Global GmbH (that's the legal entity, shown in footer)
   - **Business website**: `https://projectcoachai.com`
   - **Support email**: Your support email address
   - **Support phone**: (Optional)

6. **Save Changes**
   - Click **Save** at the bottom
   - Changes take effect within 5-10 minutes

## What Gets Branded

After configuration, Stripe checkout will show:
- ✅ Fire icon (🔥) logo in the header
- ✅ Brand color (`#ff6b35` orange) on buttons
- ✅ Company name: "ProjectCoach AI" (main branding)
- ✅ Legal entity: "Xencore Global GmbH" (shown in footer automatically)
- ✅ Support contact information

## Testing Branding

1. Open Forge app
2. Click pricing button → Stripe checkout opens
3. Verify:
   - Logo appears in header
   - Buttons use orange color (`#ff6b35`)
   - Company name shows correctly

## Troubleshooting

**Issue: Branding not showing**
- Wait 5-10 minutes after saving (Stripe caches branding)
- Clear browser cache
- Try incognito/private mode
- Check logo format (PNG, transparent background recommended)

**Issue: Colors not matching**
- Verify hex code: `#ff6b35` (no spaces, include #)
- Save and wait for cache to clear

**Issue: Logo not appearing**
- Check logo size (128x128px recommended)
- Use PNG format with transparent background
- Ensure file size is reasonable (< 500KB)
