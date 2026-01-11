# macOS Installation Troubleshooting

## Issue: "Application is not supported on this Mac" Error

If right-click → Open doesn't work, try these solutions:

---

## Solution 1: Remove Quarantine Attribute (Terminal)

This removes macOS's quarantine flag that blocks unsigned apps:

```bash
# First, find where the app is located
# It might be in Downloads or already in Applications

# If in Downloads (after opening DMG):
xattr -cr ~/Downloads/"ProjectCoachAI Forge Edition V1.app"

# If you dragged it to Applications:
xattr -cr /Applications/"ProjectCoachAI Forge Edition V1.app"

# Then try opening normally (double-click)
open ~/Downloads/"ProjectCoachAI Forge Edition V1.app"
# or
open /Applications/"ProjectCoachAI Forge Edition V1.app"
```

---

## Solution 2: System Settings → Privacy & Security

1. **Open System Settings** (or System Preferences)
2. Go to **Privacy & Security**
3. Scroll down to find a message about the app being blocked
4. Look for **"ProjectCoachAI Forge Edition V1"** in the list
5. Click **"Open Anyway"** button if it appears
6. Or click the lock icon (bottom left) to make changes, then allow the app

---

## Solution 3: Check App Architecture

Verify the app matches your Mac's architecture:

```bash
# Check your Mac architecture
uname -m
# Should show: arm64 (Apple Silicon) or x86_64 (Intel)

# Check app architecture
file "/path/to/ProjectCoachAI Forge Edition V1.app/Contents/MacOS/ProjectCoachAI Forge Edition V1"
# Should match your Mac's architecture
```

**If mismatch:** We need to rebuild for the correct architecture.

---

## Solution 4: Verify App Bundle Structure

Check if the app bundle is complete:

```bash
# Check app bundle
ls -la "/path/to/ProjectCoachAI Forge Edition V1.app/Contents/"

# Should show:
# - MacOS/ (executable files)
# - Resources/ (app resources)
# - Info.plist (app configuration)
```

**If missing files:** The build might be incomplete.

---

## Solution 5: Try Running from Terminal

Sometimes running from terminal gives better error messages:

```bash
# Navigate to app
cd "/path/to/ProjectCoachAI Forge Edition V1.app/Contents/MacOS"

# Try running directly
./"ProjectCoachAI Forge Edition V1"
```

This will show any actual errors (missing dependencies, architecture issues, etc.).

---

## Solution 6: Check macOS Version Compatibility

Verify your macOS version:

```bash
sw_vers
# Check macOS version
```

Electron apps typically require:
- **macOS 10.13+** for older versions
- **macOS 11+** recommended for newer Electron

---

## Solution 7: Rebuild for Correct Architecture

If architecture mismatch:

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1

# For Apple Silicon (M1/M2/M3):
npm run build:mac

# This should create arm64 build
```

---

## Quick Diagnostic Commands

Run these to diagnose:

```bash
# 1. Find app location
find ~/Downloads -name "*ProjectCoachAI*.app" 2>/dev/null

# 2. Check quarantine
xattr -l "/path/to/app.app"

# 3. Remove quarantine
xattr -cr "/path/to/app.app"

# 4. Check architecture
file "/path/to/app.app/Contents/MacOS/*"

# 5. Check macOS version
sw_vers
```

---

## Most Likely Solution

**Try this first (removes quarantine):**

1. **Open Terminal**
2. **Run:**
   ```bash
   xattr -cr ~/Downloads/"ProjectCoachAI Forge Edition V1.app"
   ```
   (Adjust path if app is in Applications folder)

3. **Then double-click the app** (should work now)

---

**If none of these work, we may need to rebuild the app or check for build issues.** 🔧
