# Stripe Branding Configuration - CORRECT

## Brand Identity (from stripe-checkout-branded.html)

**Primary Brand:**
- **Logo:** 🔥 Fire icon (or fire emoji image)
- **Company Name:** `ProjectCoach AI`
- **Subtitle:** `Forge Edition`
- **Brand Color:** `#ff6b35` (orange accent)

**Legal Entity (Footer):**
- **Company:** `Xencore Global GmbH`
- **Location:** `Registered in Zürich, Switzerland`

## Stripe Dashboard Configuration

### Step 1: Go to Stripe Dashboard
1. Visit: https://dashboard.stripe.com/
2. **Toggle to TEST MODE** (switch in top right corner)

### Step 2: Configure Branding
1. Navigate to **Settings** → **Branding**

### Step 3: Upload Logo
- **Logo:** Upload a fire icon image (🔥)
  - Recommended: 128x128px PNG
  - Transparent background
  - Fire/flame icon matching ProjectCoach AI branding
  - **NOT** Xencore Global GmbH logo

### Step 4: Set Brand Color
- **Primary color:** `#ff6b35` (orange accent - matches Forge Edition)

### Step 5: Set Company Information
- **Company name:** `ProjectCoach AI` ⚠️ **NOT** Xencore Global GmbH
- **Business website:** `https://projectcoachai.com`
- **Support email:** Your support email
- **Support phone:** (Optional)

### Step 6: Save
- Click **Save**
- Changes take effect within 5-10 minutes

## What Will Show in Stripe Checkout

After configuration:
- ✅ **Logo:** Fire icon (🔥) at top
- ✅ **Company name:** "ProjectCoach AI" (not Xencore Global GmbH)
- ✅ **Brand color:** Orange (`#ff6b35`) on buttons
- ✅ **Footer:** "Xencore Global GmbH" (legal entity, shown automatically)

## Important Notes

1. **Company Name vs Legal Entity:**
   - **Company name in Stripe:** `ProjectCoach AI` (what users see)
   - **Legal entity:** `Xencore Global GmbH` (shown in footer/legal text)

2. **Logo:**
   - Use the fire icon (🔥) or a fire/flame image
   - This matches the branding document design
   - NOT the Xencore Global GmbH corporate logo

3. **Test Mode:**
   - Configure branding in **TEST MODE** first
   - When ready for production, configure again in **LIVE MODE**

## Testing

After configuring:
1. Open Forge app
2. Click pricing button → Stripe checkout opens
3. Verify:
   - Logo shows fire icon (not Xencore logo)
   - Company name shows "ProjectCoach AI"
   - Buttons use orange color (`#ff6b35`)
   - Footer shows "Xencore Global GmbH" (legal entity)
