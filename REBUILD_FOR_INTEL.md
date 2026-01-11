# Rebuild for Intel Mac - Solution

## Issue Found

**Your Mac**: Intel (x86_64) architecture  
**Current DMG**: Built for ARM64 (Apple Silicon) only

❌ **Architecture mismatch!** The app won't run on Intel Macs.

---

## Solution: Build Universal Binary (Recommended)

**Best option**: Build a **universal binary** that works on BOTH Intel and Apple Silicon Macs!

This means:
- ✅ Works on Intel Macs (your current Mac)
- ✅ Works on Apple Silicon Macs (M1/M2/M3)
- ✅ One DMG file for all Macs
- ✅ Better for distribution

---

## Update package.json

Your `package.json` should have:

```json
"mac": {
  "target": [
    {
      "target": "dmg",
      "arch": ["x64", "arm64"]  // Both architectures
    }
  ]
}
```

This builds a **universal binary**.

---

## Rebuild the App

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1

# Clean old build
rm -rf dist/

# Rebuild for universal (both architectures)
npm run build:mac
```

This will create:
- `dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg` (universal, works on all Macs)

---

## Alternative: Build Intel Only

If you only want Intel support (smaller file):

```json
"mac": {
  "target": [
    {
      "target": "dmg",
      "arch": ["x64"]  // Intel only
    }
  ]
}
```

Then rebuild:
```bash
npm run build:mac
```

---

## After Rebuilding

1. ✅ New DMG will be in `dist/` folder
2. ✅ Test the new DMG on your Intel Mac
3. ✅ Upload new DMG to GitHub Release
4. ✅ Replace the old ARM64-only DMG

---

**Recommendation: Build universal binary (both x64 + arm64) - works on all Macs!** ✅
