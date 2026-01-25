# Cloudflare Worker Deployment Troubleshooting

## Common Errors & Fixes

### Error 1: "Environment variable not found" or "env.STRIPE_SECRET_KEY is undefined"

**Fix:**
1. Make sure the variable name is exactly: `STRIPE_SECRET_KEY` (case-sensitive, no spaces)
2. Go to Settings → Variables and Secrets
3. Verify it shows "STRIPE_SECRET_KEY" (Type: Secret, Value encrypted)
4. If missing, add it again and redeploy

### Error 2: Syntax Error or "Unexpected token"

**Fix:**
- Make sure you pasted the complete code (all 211 lines)
- Check for any copy/paste errors
- Try clicking "Edit code" to view the full code in the editor

### Error 3: "Failed to fetch" or Network Error

**Fix:**
- This usually means the Worker deployed successfully, but there's an issue with Stripe API calls
- Check that `STRIPE_SECRET_KEY` is set correctly
- Verify the key is valid (starts with `sk_test_` or `sk_live_`)

### Error 4: Deployment Timeout

**Fix:**
- Try deploying again
- Check Cloudflare status page
- Reduce the code if it's too large

## Quick Test After Deployment

Once deployed, test the health endpoint:

```
https://broken-cake-8815.daniel-jones-0fb.workers.dev/health
```

Should return:
```json
{"status":"ok","service":"stripe-api"}
```

## Next Steps

After successful deployment:

1. **Note your Worker URL:**
   - `https://broken-cake-8815.daniel-jones-0fb.workers.dev`
   - Or you can rename it to something better like `projectcoachai-stripe-api`

2. **Test the Stripe endpoint:**
   ```bash
   curl -X POST https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe/create-checkout-session \
     -H "Content-Type: application/json" \
     -d '{"priceId": "price_1Smim8D9SDC8fk3Bn8O6zXh0", "tierId": "creator"}'
   ```

3. **Update Forge app** with the Worker URL in `stripe-client.js`

## Still Having Issues?

Please share:
1. The exact error message from Cloudflare
2. Where the error appeared (deployment log, browser console, etc.)
3. Any red error notifications in the Cloudflare dashboard
