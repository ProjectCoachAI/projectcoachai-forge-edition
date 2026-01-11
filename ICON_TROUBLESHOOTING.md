# 🎨 Icon Troubleshooting Guide

## Issue: Seeing Electron Logo Instead of ProjectCoachAI Logo

### ✅ What's Confirmed Working:
1. **Icon file exists:** `build/icon.icns` (223KB) - ProjectCoachAI logo
2. **Icon embedded in app:** Verified in app bundle Resources folder
3. **Info.plist configured:** `CFBundleIconFile = icon.icns`
4. **package.json configured:** `"icon": "build/icon.icns"` in mac section

### 🔍 The Problem: macOS Icon Cache

macOS caches app icons aggressively. Even when the icon is correctly embedded, macOS may show a cached version.

---

## Solutions

### Solution 1: Clear Icon Cache (Recommended)

```bash
# Close Finder
killall Finder

# Clear icon cache database (may need password)
sudo rm -rf /Library/Caches/com.apple.iconservices.store

# Clear user icon cache
rm -rf ~/Library/Caches/com.apple.iconservices.store

# Wait 5 seconds, then reopen DMG
open "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg"
```

### Solution 2: Force Icon Refresh

```bash
# Touch the app to update timestamp
touch "/Applications/ProjectCoachAI Forge Edition V1.app"

# Or if in DMG:
touch "/Volumes/ProjectCoachAI Forge Edition V1 1.0.0/ProjectCoachAI Forge Edition V1.app"

# Restart Finder
killall Finder
```

### Solution 3: Copy App Out of DMG First

1. Drag app from DMG to Desktop
2. Check icon on Desktop (should show your logo)
3. Drag from Desktop to Applications
4. This forces macOS to read the icon fresh

### Solution 4: Check Icon File Directly

```bash
# Mount DMG
hdiutil attach "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg"

# Open icon file directly (will show preview)
open "/Volumes/ProjectCoachAI Forge Edition V1 1.0.0/ProjectCoachAI Forge Edition V1.app/Contents/Resources/icon.icns"

# This confirms the icon file is correct
```

---

## Verification Steps

### 1. Verify Icon is in App Bundle

```bash
hdiutil attach "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg" -nobrowse
ls -lh "/Volumes/ProjectCoachAI Forge Edition V1 1.0.0/ProjectCoachAI Forge Edition V1.app/Contents/Resources/"*.icns
```

**Expected:** Should see `icon.icns` (223KB)

### 2. Verify Info.plist Configuration

```bash
defaults read "/Volumes/ProjectCoachAI Forge Edition V1 1.0.0/ProjectCoachAI Forge Edition V1.app/Contents/Info.plist" CFBundleIconFile
```

**Expected:** Should show `icon.icns`

### 3. Check Icon File Content

```bash
# Open icon.icns to preview
open "/Volumes/ProjectCoachAI Forge Edition V1 1.0.0/ProjectCoachAI Forge Edition V1.app/Contents/Resources/icon.icns"
```

**Expected:** Should show your ProjectCoachAI logo (red gradient with speech bubble)

---

## If Icon Still Doesn't Show

### Check Build Configuration

Verify `package.json` has:
```json
{
  "build": {
    "mac": {
      "icon": "build/icon.icns"
    }
  }
}
```

### Rebuild from Scratch

```bash
# Clean build
rm -rf dist/
rm -rf node_modules/.cache/

# Rebuild
npm run build:mac
```

### Verify Icon File Format

```bash
# Check icon file type
file build/icon.icns

# Should show: "Mac OS X icon..."
```

---

## When Icon Will Update

The icon will update:
- ✅ In new DMG installs (fresh cache)
- ✅ After cache is cleared
- ✅ When copied to new location (Desktop, then Applications)
- ✅ After Finder restart
- ✅ After macOS restart (most reliable)

---

**Current Status:** Icon is correctly embedded. This is a macOS cache issue. 🎨
