# macOS Security Warning - How to Open Unsigned App

## 🔒 What's Happening

macOS Gatekeeper is blocking the app because it's not signed with an Apple Developer certificate. This is normal for development builds.

**The warning says:**
> "Apple could not verify 'ProjectCoachAI Forge Edition V1' is free of malware"

This doesn't mean the app is malicious - it just means it's not code-signed.

---

## ✅ Solution: Bypass the Warning

### Method 1: Right-Click to Open (Recommended)

1. **Don't click "Move to Bin"** - Click "Done" instead
2. **Right-click** on "ProjectCoachAI Forge Edition V1" in Finder
3. Select **"Open"** from the context menu
4. You'll see another warning - click **"Open"** again
5. The app will launch and be added to your allowed apps

### Method 2: System Settings

1. Click **"Done"** on the warning dialog
2. Open **System Settings** (or System Preferences on older macOS)
3. Go to **Privacy & Security**
4. Scroll down to find a message about "ProjectCoachAI Forge Edition V1"
5. Click **"Open Anyway"** button
6. The app will launch

### Method 3: Terminal Command (Advanced)

```bash
# Remove quarantine attribute
xattr -d com.apple.quarantine "/Applications/ProjectCoachAI Forge Edition V1.app"

# Then open normally
open "/Applications/ProjectCoachAI Forge Edition V1.app"
```

---

## 🎯 Quick Steps (Easiest)

1. **Click "Done"** on the warning
2. **Right-click** the app in Finder
3. **Click "Open"**
4. **Click "Open"** on the second warning
5. ✅ App launches!

---

## 📝 Why This Happens

- **Development builds** aren't code-signed (requires Apple Developer account, $99/year)
- **macOS Gatekeeper** blocks unsigned apps by default
- This is a **security feature**, not an error
- The app is **safe** - you built it yourself!

---

## 🔐 For Production Distribution

If you plan to distribute the app publicly, you'll need:

1. **Apple Developer Account** ($99/year)
2. **Code Signing Certificate**
3. **Notarization** (Apple's malware scanning)

This is only needed for public distribution. For personal use or testing, the bypass methods above work fine.

---

## ⚠️ Important Notes

- **First time only:** After bypassing once, macOS remembers your choice
- **Future launches:** The app will open normally after the first bypass
- **Security:** This is macOS protecting you - it's working as designed
- **Your app is safe:** Since you built it, you know it's not malware

---

## 🚀 After Bypassing

Once you've bypassed the warning:
1. The app will launch normally
2. You can test the Quick Chat tab bar
3. Future launches won't show the warning
4. The app is added to your "allowed" list

---

## 📋 Troubleshooting

### "Open" option not available?
- Make sure you're right-clicking the **.app** file, not a shortcut
- Try Method 2 (System Settings) instead

### Still blocked after bypassing?
- Check System Settings > Privacy & Security
- Look for any additional security messages
- Try the Terminal command (Method 3)

### Want to remove the warning permanently?
- Code sign the app (requires Apple Developer account)
- Or use the Terminal command to remove quarantine attribute

---

## ✅ Success

After bypassing, you should be able to:
- Launch the app normally
- See the Quick Chat tab bar when switching to Quick Chat mode
- Test all the new features

The security warning is just macOS being cautious - your app is fine!
