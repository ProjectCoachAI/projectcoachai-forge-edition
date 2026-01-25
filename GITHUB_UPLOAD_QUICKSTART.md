# Quick Upload Guide - GitHub Release Files

## 🎯 Goal
Upload the latest Windows .exe and macOS .dmg files to GitHub Release V1.0.0 to fix the 404 download error.

---

## ✅ Files Ready to Upload

All files are in `dist/` folder (built Jan 18, 2025):

1. **Windows**: `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (146 MB) ⚠️ **FIXES 404 ERROR**
2. **macOS ARM**: `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg` (92 MB)
3. **macOS Intel**: `ProjectCoachAI Forge Edition V1-1.0.0.dmg` (97 MB)

---

## 🚀 Option A: Terminal Upload (Fastest)

### Step 1: Authenticate with GitHub
```bash
gh auth login
```
Follow the prompts:
- Choose: GitHub.com
- Protocol: HTTPS
- Authenticate: Login with a web browser

### Step 2: Upload Files
```bash
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"

gh release upload V1.0.0 \
  "dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe" \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg" \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
  --repo ProjectCoachAI/projectcoachai-forge-edition \
  --clobber
```

**Done!** ✅ Files will be uploaded and replace any existing files.

---

## 🌐 Option B: Web Interface (No Terminal)

### Step 1: Go to GitHub Releases
1. Open: https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases
2. Click **"Edit"** on release V1.0.0 (or create if it doesn't exist)

### Step 2: Upload Files
1. Scroll to **"Attach binaries"** section
2. Click **"Select files"** button
3. Navigate to: `dist/` folder
4. Upload files **ONE AT A TIME**:
   - First: `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - Second: `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`
   - Third: `ProjectCoachAI Forge Edition V1-1.0.0.dmg`
5. Click **"Update release"**

---

## ✅ After Upload - Verify

1. Check the release page shows all 3 files in Assets
2. Right-click the Windows .exe → "Copy link"
3. Test the URL in a new tab - should download (not 404)

### Correct Download URLs (after upload):

**Windows:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
```

**macOS ARM:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1-1.0.0-arm64.dmg
```

**macOS Intel:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1-1.0.0.dmg
```

---

## 📝 Next Steps

After upload, update:
- ✅ `DOWNLOAD_URLS.md` (already fixed)
- ✅ Your website download page with correct URLs
- ✅ Test all download links work

---

**Status**: Ready to upload  
**Priority**: HIGH - Fixes 404 error for Windows users  
**Files Location**: `/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/dist/`

