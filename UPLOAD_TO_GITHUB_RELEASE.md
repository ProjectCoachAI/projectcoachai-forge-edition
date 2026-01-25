# Upload Latest Files to GitHub Release V1.0.0

**Date**: January 18, 2025  
**Release Tag**: V1.0.0  
**Repository**: ProjectCoachAI/projectcoachai-forge-edition

---

## 📦 Files to Upload

Latest files from `dist/` folder (built Jan 18, 2025):

1. **Windows Installer** (146 MB)
   - `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - ⚠️ **This is the one causing 404 errors**

2. **macOS Apple Silicon** (92 MB)
   - `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`

3. **macOS Intel** (97 MB)
   - `ProjectCoachAI Forge Edition V1-1.0.0.dmg`

**Total size**: ~335 MB

---

## 🚀 Method 1: Upload via GitHub Web Interface (Easiest)

### Step 1: Go to GitHub Releases

1. Open your browser and go to:
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases
   ```

2. **If release V1.0.0 exists:**
   - Click **"Edit"** next to the V1.0.0 release

3. **If release V1.0.0 doesn't exist:**
   - Click **"Draft a new release"**
   - **Tag**: `V1.0.0` (create new tag)
   - **Target**: `main` branch (or your default branch)
   - **Release title**: `ProjectCoachAI Forge Edition V1.0.0`
   - **Description**: (add release notes)

### Step 2: Upload Files

1. Scroll down to **"Attach binaries by dropping them here or selecting them"**

2. **DO NOT drag & drop** - use the **"Select files"** button instead

3. Navigate to your `dist/` folder:
   ```
   /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/dist/
   ```

4. **Upload files ONE AT A TIME** (to avoid timeout):

   **First file - Windows:**
   - Select: `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - Wait for upload to complete (shows progress bar)
   - ⚠️ **Make sure filename shows spaces, not dots**

   **Second file - macOS ARM:**
   - Select: `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`
   - Wait for upload to complete

   **Third file - macOS Intel:**
   - Select: `ProjectCoachAI Forge Edition V1-1.0.0.dmg`
   - Wait for upload to complete

5. **Click "Update release"** (or "Publish release" if new)

### Step 3: Verify Upload

1. After publishing, check the Assets section shows all 3 files:
   - ✅ `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - ✅ `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`
   - ✅ `ProjectCoachAI Forge Edition V1-1.0.0.dmg`

2. **Right-click each file → "Copy link address"** to get the download URLs

3. **Test the Windows URL:**
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
   ```
   Should start downloading (not 404)

---

## ⚡ Method 2: Install GitHub CLI and Upload via Terminal

### Install GitHub CLI (if not installed)

```bash
# macOS
brew install gh

# Or download from: https://cli.github.com/
```

### Authenticate

```bash
gh auth login
# Follow prompts to authenticate
```

### Upload Files

```bash
# Navigate to project directory
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"

# Upload all 3 files at once (with --clobber to replace existing)
gh release upload V1.0.0 \
  "dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe" \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg" \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
  --repo ProjectCoachAI/projectcoachai-forge-edition \
  --clobber
```

**`--clobber` flag**: Replaces existing files with the same name (important!)

---

## ✅ After Upload - Update Download URLs

Once files are uploaded, use these URLs:

### Windows
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
```

### macOS ARM (Apple Silicon)
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1-1.0.0-arm64.dmg
```

### macOS Intel
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1-1.0.0.dmg
```

---

## 🔍 Troubleshooting

### Issue: "File already exists"
**Solution**: 
- Delete the old file from GitHub release first
- Or use `--clobber` flag with GitHub CLI

### Issue: "Upload failed" or timeout
**Solution**:
- Upload files one at a time (don't upload all 3 at once)
- Use GitHub CLI for more reliable uploads
- Check your internet connection

### Issue: Still getting 404 after upload
**Solution**:
1. Verify filename matches exactly (including spaces)
2. Check the URL uses `%20` for spaces
3. Make sure release is **Published** (not Draft)
4. Clear browser cache and try again

---

## 📝 Checklist

- [ ] Go to GitHub Releases page
- [ ] Edit or create V1.0.0 release
- [ ] Upload Windows .exe file
- [ ] Upload macOS ARM .dmg file
- [ ] Upload macOS Intel .dmg file
- [ ] Verify all 3 files show in Assets
- [ ] Copy download URLs from GitHub
- [ ] Test Windows download URL (no 404)
- [ ] Update website/download page with correct URLs
- [ ] Test all download links work

---

**Priority**: HIGH - Users cannot download Windows installer  
**Status**: Ready to upload  
**Files Ready**: ✅ All 3 files in `dist/` folder

