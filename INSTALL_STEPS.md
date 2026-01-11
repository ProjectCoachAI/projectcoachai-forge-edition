# macOS Installation Steps - Detailed Guide

## Issue: App Won't Open from DMG

The app might still be **inside the DMG file** and needs to be extracted first!

---

## Correct Installation Steps

### Step 1: Download the DMG

1. Download `ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg` from GitHub
2. The file should be in your Downloads folder

### Step 2: Open (Mount) the DMG

1. **Double-click the `.dmg` file** in Downloads
2. A new window should open showing:
   - Left side: "ProjectCoachAI Forge Edition V1" app icon
   - Right side: "Applications" folder icon
   - Arrow pointing from app to Applications

**This is the DMG window - the app is INSIDE this mounted disk image!**

### Step 3: Extract/Copy the App

You have two options:

#### Option A: Drag to Applications (Recommended)

1. **Drag** the "ProjectCoachAI Forge Edition V1" app icon
2. **Drop it** onto the "Applications" folder icon
3. Wait for copy to complete
4. The app is now in Applications folder

#### Option B: Copy to Desktop

1. **Drag** the app to your Desktop
2. Copy will happen automatically
3. You can run it from Desktop or move it later

### Step 4: Open the App (After Extraction)

**Now the app is OUTSIDE the DMG and can be opened:**

1. **Go to Applications folder** (or Desktop if you copied there)
2. **Right-click** on "ProjectCoachAI Forge Edition V1"
3. Select **"Open"** from the menu
4. Click **"Open"** in the confirmation dialog
5. App should launch!

---

## If Right-Click → Open Still Doesn't Work

Try these solutions:

### Solution 1: Remove Quarantine Attribute (Terminal)

```bash
# If app is in Applications:
xattr -cr /Applications/"ProjectCoachAI Forge Edition V1.app"

# If app is on Desktop:
xattr -cr ~/Desktop/"ProjectCoachAI Forge Edition V1.app"

# Then try opening normally
open "/Applications/ProjectCoachAI Forge Edition V1.app"
```

### Solution 2: System Settings → Privacy & Security

1. Open **System Settings** (or System Preferences)
2. Go to **Privacy & Security**
3. Scroll down
4. Look for a message about the app being blocked
5. Click **"Open Anyway"** button if it appears

### Solution 3: Try Running from Terminal

```bash
# Navigate to app
cd /Applications
./"ProjectCoachAI Forge Edition V1.app/Contents/MacOS/ProjectCoachAI Forge Edition V1"
```

This will show any actual errors.

---

## Common Issues

### "App is damaged" Error

Run this to fix:
```bash
xattr -cr "/Applications/ProjectCoachAI Forge Edition V1.app"
```

### "App won't open" from DMG

**The app MUST be extracted from the DMG first!**

- ❌ Don't try to run it while still inside the DMG window
- ✅ Drag it to Applications folder first
- ✅ Then open from Applications

### DMG Won't Open

1. Check file downloaded completely (89.8 MB)
2. Try downloading again
3. Check macOS version (needs 10.13+)

---

## Quick Checklist

- [ ] DMG file downloaded completely
- [ ] DMG file opened (double-clicked)
- [ ] DMG window shows app icon
- [ ] App dragged to Applications folder (or Desktop)
- [ ] Copy completed
- [ ] Right-click on app in Applications
- [ ] Select "Open" from menu
- [ ] Click "Open" in confirmation dialog
- [ ] App launches!

---

**Most likely issue: The app is still inside the DMG and needs to be extracted first!** 🔧
