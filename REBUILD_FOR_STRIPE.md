# Rebuild Forge App for Stripe Integration

## ✅ Why Rebuild is Needed

The `stripe-client.js` file is part of the Electron app code and gets bundled into the app during build. The changes we made to use the Cloudflare Worker won't take effect until you rebuild.

## 🚀 Build Commands

### For macOS (both Intel and Apple Silicon):

```bash
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"
npm run build:mac
```

This will create:
- `dist/mac/ProjectCoachAI Forge Edition V1-1.0.0.dmg` (Intel)
- `dist/mac-arm64/ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg` (Apple Silicon)

### For Windows:

```bash
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"
npm run build:win
```

This will create:
- `dist/win-unpacked/ProjectCoachAI Forge Edition V1.exe`
- `dist/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe` (installer)

### Build Both:

```bash
npm run build
```

## 📋 After Building

1. **Test the new build:**
   - Open the app
   - Go to Pricing page
   - Click "Upgrade Now" for Creator/Professional/Team
   - Should open Stripe checkout (no "fetch failed" error)

2. **Upload to GitHub Releases:**
   - Follow your existing process
   - Replace the old installers with the new ones

## ✅ What Changed

- `stripe-client.js` now uses Cloudflare Worker URL:
  - `https://broken-cake-8815.daniel-jones-0fb.workers.dev/api/stripe`
- All Stripe API calls now go through your Cloudflare Worker
- Stripe secret key is securely stored in Cloudflare (not in the app)
