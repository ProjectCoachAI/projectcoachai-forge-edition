# How to Test Your Cloudflare Worker

## ✅ Quick Verification Steps

### 1. Check Health Endpoint

Open in your browser or run this command:

```
https://broken-cake-8815.daniel-jones-0fb.workers.dev/health
```

**Expected Response:**
```json
{"status":"ok","service":"stripe-api"}
```

If you see this, your Worker is deployed and running! ✅

### 2. Test Stripe Checkout Endpoint

Test the main Stripe API endpoint:

**Option A: Browser (easiest)**
1. Open browser developer tools (F12)
2. Go to Console tab
3. Run this code:

```javascript
fetch('https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe/create-checkout-session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    priceId: 'price_1Smim8D9SDC8fk3Bn8O6zXh0',
    tierId: 'creator'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**Option B: Terminal (curl)**
```bash
curl -X POST https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe/create-checkout-session \
  -H "Content-Type: application/json" \
  -d '{"priceId": "price_1Smim8D9SDC8fk3Bn8O6zXh0", "tierId": "creator"}'
```

**Expected Response (if working):**
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

**If you get an error:**
- Check that `STRIPE_SECRET_KEY` is set in Variables and Secrets
- Verify the key value is correct

### 3. Check in Cloudflare Dashboard

1. Go to your Worker in Cloudflare Dashboard
2. Click **"Metrics"** tab
3. You should see request counts if the endpoints are being hit
4. Click **"Deployments"** tab
5. Latest deployment should show "Active" status

## ✅ Success Indicators

You'll know it's working if:
- ✅ Health endpoint returns `{"status":"ok"}`
- ✅ Stripe endpoint returns a `sessionId` and `url`
- ✅ No error messages in the response
- ✅ Deployment shows "Active" in Cloudflare Dashboard

## 🔧 Next Steps (Once Verified)

After confirming it works:

1. **Update Forge App** - Update `stripe-client.js` with your Worker URL:
   ```javascript
   const API_URL = 'https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe';
   ```

2. **Test in Forge App** - Try clicking a pricing button (Creator/Professional/Team) in the Forge app to see if Stripe checkout opens

3. **(Optional) Rename Worker** - You can rename "broken-cake-8815" to something like "projectcoachai-stripe-api" for better clarity
