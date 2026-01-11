# Fix: DMG is Read-Only - Copy App Out First

## Issue: "Read-only file system" Errors

The errors you're seeing are **normal** - DMG files are read-only by design. You can't modify files inside a mounted DMG.

---

## Solution: Copy App Out of DMG First

### Step 1: Drag App to Applications

1. **In the DMG window**, you should see:
   - Left: "ProjectCoachAI Forge Edition V1" app icon
   - Right: "Applications" folder icon
   - Arrow pointing from app to Applications

2. **Drag the app** from left to right:
   - Click and hold on "ProjectCoachAI Forge Edition V1" app icon
   - Drag it over the "Applications" folder icon
   - Release (drop it)
   - Wait for copy to complete

3. **The app is now in Applications folder** (outside the DMG)

---

### Step 2: Remove Quarantine from Copied App

Now that the app is in Applications (writable location), run:

```bash
xattr -cr "/Applications/ProjectCoachAI Forge Edition V1.app"
```

This will work because Applications folder is writable (unlike the DMG).

---

### Step 3: Open the App

After removing quarantine:

1. **Go to Applications folder**
2. **Double-click** "ProjectCoachAI Forge Edition V1"
3. **App should launch!** ✅

---

## Why This Happens

- **DMG files are read-only** (by design, for security)
- **You can't modify files inside DMG** (that's why xattr failed)
- **Applications folder is writable** (so xattr works there)
- **Solution**: Copy app out first, then remove quarantine

---

## Quick Steps Summary

1. ✅ **Drag app from DMG to Applications** (copy it out)
2. ✅ **Run**: `xattr -cr "/Applications/ProjectCoachAI Forge Edition V1.app"`
3. ✅ **Double-click app** from Applications folder
4. ✅ **App launches!**

---

## Alternative: Right-Click → Open (After Copying)

After copying to Applications:

1. **Go to Applications folder**
2. **Right-click** on "ProjectCoachAI Forge Edition V1"
3. Select **"Open"** from menu
4. Click **"Open"** in confirmation dialog
5. App launches!

---

**The key is: Copy the app OUT of the DMG first, then remove quarantine!** 🔧
