# Bypass macOS Gatekeeper - "Could Not Verify" Error

## Error Message

**"Apple could not verify 'ProjectCoachAI Forge Edition V1' is free of malware..."**

This is **Gatekeeper** blocking the unsigned app. This is **normal** and **safe** to bypass.

---

## Solution 1: Right-Click → Open (Easiest)

### If App is in DMG Window:

1. **In the DMG installer window** (the one showing the app and Applications folder)
2. **Right-click** (or Control+Click) on "ProjectCoachAI Forge Edition V1" app icon
3. Select **"Open"** from the context menu
4. A **new dialog** will appear asking "Are you sure you want to open it?"
5. Click **"Open"** button
6. App will launch!

### If App is Already in Applications:

1. **Go to Applications folder**
2. **Right-click** on "ProjectCoachAI Forge Edition V1"
3. Select **"Open"** from the menu
4. Click **"Open"** in confirmation dialog
5. App will launch!

---

## Solution 2: System Settings → Privacy & Security

1. **Open System Settings** (or System Preferences)
2. Go to **Privacy & Security**
3. Scroll down to find a message about the app being blocked
4. Look for: **"ProjectCoachAI Forge Edition V1" was blocked...**
5. Click **"Open Anyway"** button next to it
6. Confirm in the dialog
7. App will launch!

---

## Solution 3: Remove Quarantine Attribute (Terminal)

This removes macOS's quarantine flag permanently:

```bash
# If app is in Applications:
xattr -cr /Applications/"ProjectCoachAI Forge Edition V1.app"

# If app is still in DMG (mounted volume):
xattr -cr /Volumes/"ProjectCoachAI Forge Edition V1 1.0.0"/"ProjectCoachAI Forge Edition V1.app"

# Then try opening normally (double-click)
open "/Applications/ProjectCoachAI Forge Edition V1.app"
```

**After this, you can double-click normally** (no right-click needed).

---

## Solution 4: Terminal Command (Direct Launch)

```bash
# Navigate to app
cd "/Applications"
open "ProjectCoachAI Forge Edition V1.app"

# Or if still in DMG:
cd "/Volumes/ProjectCoachAI Forge Edition V1 1.0.0"
open "ProjectCoachAI Forge Edition V1.app"
```

---

## Why This Happens

**Gatekeeper** blocks apps that:
- Are not code-signed with Apple Developer certificate
- Are downloaded from the internet (including GitHub)
- Don't have a valid signature

**This is normal** for:
- Development builds
- Apps from GitHub
- Free/open-source apps
- Apps without Apple Developer account

---

## For Users (Add to Release Notes)

Add this to your installation instructions:

### macOS Installation:

1. Download the `.dmg` file
2. Double-click to open the DMG
3. **Right-click** on "ProjectCoachAI Forge Edition V1" app
4. Select **"Open"** from the menu
5. Click **"Open"** when macOS asks for confirmation
6. Drag app to Applications folder
7. Launch from Applications

**Note:** The security warning is normal for apps from GitHub. Right-click → Open safely bypasses it.

---

## Quick Fix Summary

**Easiest method:**
1. Right-click on app icon
2. Select "Open"
3. Click "Open" in confirmation dialog
4. Done! ✅

---

**Try right-click → Open now!** This will bypass Gatekeeper and launch the app. 🔧
