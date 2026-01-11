# macOS Installation Fix - Gatekeeper Error

## Error Message

**"You can't open the application 'ProjectCoachAI Forge Edition V1' because this application is not supported on this Mac."**

This is a **Gatekeeper** security feature blocking unsigned apps. This is normal for apps that aren't code-signed.

---

## Quick Fix (For Testing)

### Method 1: Right-Click → Open (Recommended)

1. **In the DMG installer window:**
   - **Right-click** (or Control+Click) on the "ProjectCoachAI Forge Edition V1" app icon
   - Select **"Open"** from the context menu
   - Click **"Open"** again when macOS asks for confirmation

2. **Or from Applications folder:**
   - If you already dragged it to Applications:
   - Go to Applications folder
   - **Right-click** on "ProjectCoachAI Forge Edition V1"
   - Select **"Open"**
   - Click **"Open"** in the confirmation dialog

This bypasses Gatekeeper and allows the app to run.

---

### Method 2: System Settings (Alternative)

1. **Open System Settings** (or System Preferences on older macOS)
2. Go to **Privacy & Security**
3. Scroll down to find a message about "ProjectCoachAI Forge Edition V1" being blocked
4. Click **"Open Anyway"** or **"Allow"** button
5. Confirm in the dialog that appears

---

## Why This Happens

**Gatekeeper** is macOS's security feature that blocks apps that:
- Are not code-signed with an Apple Developer certificate
- Are downloaded from the internet (even from trusted sources like GitHub)
- Don't have a valid signature

**This is normal** for:
- Development builds
- Apps from GitHub (unless signed)
- Free/open-source apps without signing certificates

---

## For Production (Optional - Future)

### Code Signing (Recommended but Optional)

For production releases, you can code-sign the app:

1. **Requirements:**
   - Apple Developer Account ($99/year)
   - Code signing certificate

2. **Benefits:**
   - No Gatekeeper warnings
   - Better user experience
   - Notarization support (for macOS 10.15+)
   - Trusted by users

3. **Not Required For:**
   - Development/testing
   - Beta releases
   - Users can still use right-click → Open

4. **We can add this later** if needed (for production releases)

---

## For Users (Installation Instructions)

Add this to your release notes/website:

### macOS Installation Instructions:

1. Download the `.dmg` file
2. Double-click to open the DMG
3. **Right-click** (or Control+Click) on "ProjectCoachAI Forge Edition V1"
4. Select **"Open"** from the menu
5. Click **"Open"** when macOS asks for confirmation
6. Drag the app to Applications folder (if not already there)
7. Launch from Applications folder

**Note:** This security prompt is normal for apps from GitHub. Right-click → Open bypasses it safely.

---

## Alternative: Remove Quarantine Attribute (Advanced)

For advanced users only:

```bash
# After downloading, remove quarantine attribute
xattr -d com.apple.quarantine "/path/to/ProjectCoachAI Forge Edition V1.app"
```

This removes the quarantine flag, allowing normal double-click to work.

---

## Testing After Installation

Once the app opens successfully:

1. ✅ **Verify app launches** correctly
2. ✅ **Test workspace** opens
3. ✅ **Test tool selection** works
4. ✅ **Test comparison** feature
5. ✅ **Test synthesis** feature
6. ✅ **Check for any errors** in console

---

**For now: Use right-click → Open to bypass Gatekeeper!** ✅
