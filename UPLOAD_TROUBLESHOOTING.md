# GitHub Release Upload Troubleshooting

## ✅ Files Are Ready

Your installers are built and ready:
- `ProjectCoachAI Forge Edition V1-1.0.0.dmg` (97MB) - Intel Mac
- `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg` (92MB) - Apple Silicon
- `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (146MB) - Windows

## 🔍 Common Upload Issues & Fixes

### Issue 1: Files Not Uploading (Drag & Drop Not Working)

**Fix:**
1. **Use "Select files" button instead of drag & drop**
   - Click "Select files" or "Browse" button on GitHub
   - Navigate to the `dist/` folder
   - Select files one at a time or in small batches

2. **Check file size**
   - GitHub allows up to 2 GB per file ✅ (your files are under 150MB)
   - Total release size: up to 10 GB ✅

3. **Try uploading one file at a time**
   - Upload DMG files first
   - Then upload EXE file
   - Don't upload all 3 at once

### Issue 2: Browser Issues

**Fix:**
1. **Try a different browser**
   - Chrome, Firefox, Safari
   - Sometimes Safari on Mac has issues

2. **Clear browser cache**
   - Or try incognito/private mode

3. **Check browser extensions**
   - Disable ad blockers or upload-related extensions

### Issue 3: Network/Timeout Issues

**Fix:**
1. **Upload files individually**
   - Don't drag multiple files at once
   - Wait for each upload to complete before adding the next

2. **Use GitHub CLI (Alternative)**
   ```bash
   # Install GitHub CLI if needed
   brew install gh
   
   # Login
   gh auth login
   
   # Upload files
   cd dist
   gh release upload V1.0.0 "ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
     "ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg" \
     "ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe" \
     --repo ProjectCoachAI/projectcoachai-forge-edition
   ```

### Issue 4: File Path Issues

**Fix:**
1. **Make sure files are accessible**
   - Files are in: `/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/dist/`
   - Try navigating to this folder in Finder and drag from there

2. **Check file permissions**
   ```bash
   # If needed, fix permissions
   chmod 644 dist/*.dmg dist/*.exe
   ```

### Issue 5: GitHub UI Issues

**Fix:**
1. **Refresh the page**
   - Sometimes the upload area needs a refresh

2. **Try editing the release directly**
   - Go to the release edit page
   - Scroll down to "Attach binaries"
   - Use "Select files" button

## ✅ Step-by-Step Upload Process

1. **Go to GitHub Releases:**
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases
   ```

2. **Click "Edit" on the existing release** (or create new)

3. **Scroll to "Attach binaries by dropping them here or selecting them"**

4. **Use "Select files" button** (not drag & drop):
   - Click "Select files"
   - Navigate to: `/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/dist/`
   - Select files ONE AT A TIME:
     - First: `ProjectCoachAI Forge Edition V1-1.0.0.dmg`
     - Wait for upload to complete
     - Then: `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`
     - Wait for upload to complete
     - Then: `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`

5. **Click "Update release"** (or "Publish release")

## 🔄 Alternative: GitHub CLI Method

If the web interface keeps failing, use GitHub CLI:

```bash
# Navigate to project directory
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"

# Upload all files at once
gh release upload V1.0.0 dist/*.dmg dist/*.exe \
  --repo ProjectCoachAI/projectcoachai-forge-edition

# Or upload individually
cd dist
gh release upload V1.0.0 "ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
  --repo ProjectCoachAI/projectcoachai-forge-edition

gh release upload V1.0.0 "ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg" \
  --repo ProjectCoachAI/projectcoachai-forge-edition

gh release upload V1.0.0 "ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe" \
  --repo ProjectCoachAI/projectcoachai-forge-edition
```

## ❓ What Error Are You Seeing?

Please describe:
1. **What happens when you try to upload?**
   - Nothing happens?
   - Error message appears?
   - Files upload but don't save?

2. **Which method are you using?**
   - Drag & drop?
   - "Select files" button?
   - GitHub CLI?

3. **Any error messages?**
   - Copy/paste any error text you see

This will help me provide a more specific solution!
