# Terminal Fix for Gatekeeper Error

## Issue: App Won't Open Even After Right-Click → Open

If right-click → Open doesn't work, use Terminal to remove the quarantine attribute.

---

## Step-by-Step Terminal Solution

### Step 1: Open Terminal

1. Press **Command + Space** (opens Spotlight)
2. Type **"Terminal"**
3. Press **Enter**

### Step 2: Remove Quarantine Attribute

Copy and paste this command into Terminal:

```bash
xattr -cr "/Volumes/ProjectCoachAI Forge Edition V1 1.0.0/ProjectCoachAI Forge Edition V1.app"
```

Press **Enter** and wait for the command to complete (should finish quickly).

### Step 3: Try Opening the App

After running the command:
1. Go back to the DMG window
2. **Double-click** the app icon (should work now)
3. Or try right-click → Open again

---

## If App is in Applications Folder

If you already dragged the app to Applications:

```bash
xattr -cr "/Applications/ProjectCoachAI Forge Edition V1.app"
```

Then try opening from Applications folder.

---

## Alternative: System Settings Method

If Terminal doesn't work, try System Settings:

1. **Open System Settings** (Apple menu → System Settings)
2. Go to **Privacy & Security**
3. Scroll down to find the blocked app message
4. Look for: **"ProjectCoachAI Forge Edition V1" was blocked...**
5. Click **"Open Anyway"** button
6. Confirm in the dialog

---

## What the Command Does

`xattr -cr` removes the **quarantine attribute** that macOS adds to downloaded files. This attribute is what triggers the Gatekeeper warning.

- `-c` = Clear the attribute
- `-r` = Recursive (apply to all files inside the app bundle)

This is **safe** and **reversible** - you're just telling macOS "I trust this file."

---

## After Running Command

Once the quarantine is removed:
- ✅ You can double-click normally
- ✅ No more Gatekeeper warnings
- ✅ App will launch directly

---

**Try the Terminal command now!** This should fix the issue. 🔧
