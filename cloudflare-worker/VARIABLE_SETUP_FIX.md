# ⚠️ Variable Setup Fix

## Issue in Your Screenshot

I can see you're setting up the variable, but there are two corrections needed:

### ❌ Current (Incorrect):
- **Variable name**: "ProjectCoachAI Stripe"
- **Value**: `STRIPE_SECRET_KEY = sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYXV3BXY`

### ✅ Correct Setup:

1. **Variable name** (exact, case-sensitive):
   ```
   STRIPE_SECRET_KEY
   ```
   - Must be exactly: `STRIPE_SECRET_KEY` (no spaces, all caps)
   - NOT "ProjectCoachAI Stripe"

2. **Value** (just the key, no variable name):
   ```
   sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy
   ```
   - Just the key itself
   - Remove `STRIPE_SECRET_KEY = ` from the value field
   - The value should be ONLY: `sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy`

## Steps to Fix:

1. In the "Variable name" field, change:
   - From: `ProjectCoachAI Stripe`
   - To: `STRIPE_SECRET_KEY`

2. In the "Value" field, change:
   - From: `STRIPE_SECRET_KEY = sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYXV3BXY`
   - To: `sk_test_EvX8RvkCLHKAzWDt5iqJPiUO00YYxV3BXy`
   - (Just the key, nothing else)

3. Make sure "Type" is set to **"Secret"** (which it already is ✅)

4. Click **"Add variable"** or **"Deploy"**

## Why This Matters:

The Worker code uses `env.STRIPE_SECRET_KEY` to access the variable. If the name doesn't match exactly, it won't work!
