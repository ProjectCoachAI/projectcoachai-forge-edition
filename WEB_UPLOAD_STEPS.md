# Upload Files via GitHub Web Interface - Step by Step

## 🎯 Quick Steps

### Step 1: Open GitHub Releases Page

1. Go to: **https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases**
2. Look for release **V1.0.0**

### Step 2: Edit the Release

**If release V1.0.0 exists:**
- Click the **"Edit"** button (pencil icon) next to V1.0.0

**If release V1.0.0 doesn't exist:**
- Click **"Draft a new release"** button
- **Tag version**: Type `V1.0.0` 
- Click **"Create new tag: V1.0.0 on publish"**
- **Target**: Select `main` (or your default branch)
- **Release title**: `ProjectCoachAI Forge Edition V1.0.0`

### Step 3: Upload Files

1. Scroll down to the section: **"Attach binaries by dropping them here or selecting them"**

2. **IMPORTANT**: Use the **"Select files"** button (NOT drag & drop)

3. Navigate to this folder on your Mac:
   ```
   /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/dist/
   ```

4. **Upload files ONE AT A TIME** (wait for each to finish before next):

   **File 1 - Windows (Fixes the 404 error!):**
   - Select: `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - Wait for upload to complete (you'll see a progress bar)
   - ✅ File should show in the Assets list below

   **File 2 - macOS Apple Silicon:**
   - Click "Select files" again
   - Select: `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`
   - Wait for upload to complete

   **File 3 - macOS Intel:**
   - Click "Select files" again  
   - Select: `ProjectCoachAI Forge Edition V1-1.0.0.dmg`
   - Wait for upload to complete

### Step 4: Verify & Publish

1. **Check Assets section** - You should see all 3 files listed:
   - ✅ `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (146 MB)
   - ✅ `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg` (92 MB)
   - ✅ `ProjectCoachAI Forge Edition V1-1.0.0.dmg` (97 MB)

2. **Click "Update release"** button (or "Publish release" if new)

### Step 5: Test the Download

1. After publishing, the release page will refresh
2. Scroll to **Assets** section
3. **Right-click** on `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
4. Select **"Copy link address"**
5. Paste the link in a new browser tab - it should start downloading (NOT 404)

---

## ✅ Success Checklist

- [ ] All 3 files uploaded successfully
- [ ] Files show correct sizes (146MB, 92MB, 97MB)
- [ ] Release is published (not draft)
- [ ] Windows .exe download URL works (no 404)
- [ ] Can see files in Assets section

---

## 🔗 Correct Download URLs (After Upload)

Once uploaded, these URLs will work:

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

## ⚠️ Troubleshooting

**Problem**: File upload fails or times out  
**Solution**: Upload files one at a time, wait for each to complete

**Problem**: File shows but download still gives 404  
**Solution**: Make sure the filename has **spaces** (not dots). If file was uploaded with dots, delete it and re-upload with the correct name

**Problem**: Can't find the dist/ folder  
**Solution**: The exact path is: `/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/dist/`

---

**Ready to go!** 🚀 Open the GitHub releases page and follow the steps above.


