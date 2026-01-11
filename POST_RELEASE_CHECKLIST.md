# Post-Release Testing & Cleanup Checklist

## Step 1: Publish Release ✅

**On the GitHub release page:**
1. Review everything one more time
2. Click the green **"Publish release"** button
3. Wait for release to be created
4. You'll be redirected to the release page

---

## Step 2: Test Downloads

### Test macOS Download:

1. **Get Download URL:**
   - On the release page, find the `.dmg` file
   - Right-click → "Copy link address"
   - URL should be: `https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg`

2. **Download Test:**
   - Open URL in a new browser/incognito window (simulates new user)
   - Download should start automatically
   - Verify file downloads completely (~90 MB)
   - Check file name and size match

3. **Installation Test:**
   - Double-click downloaded `.dmg`
   - Drag app to Applications folder
   - Launch app from Applications
   - Verify app works correctly
   - Test key features (workspace, comparison, etc.)

### Test Windows Download:

1. **Get Download URL:**
   - On the release page, find the `.exe` file
   - Right-click → "Copy link address"
   - URL should be: `https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe`

2. **Download Test:**
   - Open URL in a new browser/incognito window
   - Download should start automatically
   - Verify file downloads completely (~146 MB)
   - Check file name and size match

3. **Installation Test (if you have Windows):**
   - Double-click downloaded `.exe`
   - Follow installer wizard
   - Install to default location
   - Launch app from desktop/Start menu
   - Verify app works correctly

---

## Step 3: Verify App Functionality

Test these features after installation:

- [ ] ✅ App launches successfully
- [ ] ✅ Toolshelf loads correctly
- [ ] ✅ Can select AI tools
- [ ] ✅ Can open workspace/panes
- [ ] ✅ Comparison feature works
- [ ] ✅ Synthesis feature works
- [ ] ✅ All 7 synthesis frameworks display correctly
- [ ] ✅ Data capture works for all AI tools
- [ ] ✅ No console errors
- [ ] ✅ App branding shows "ProjectCoachAI Forge Edition V1"

---

## Step 4: Repository Cleanup (After Testing)

**Once downloads and installation are tested successfully, we can clean up:**

### Files to Review for Removal:

**Documentation Files (Consider moving to `/docs` folder or removing):**
- Multiple `.md` files that are internal docs (not needed by end users)
- Old documentation/guides
- Troubleshooting docs (keep in private repo only)

**Build/Temp Files:**
- `dist/` folder (already excluded by .gitignore, but verify)
- `node_modules/` (already excluded)
- Temporary files

**Sensitive Files (Should NOT be in repo):**
- Any API key files (should already be in .gitignore)
- User data files
- Local configuration files

**Backup/Test Files:**
- Test scripts
- Backup files (`.backup`, `.bak`)
- Old versions of files

### Cleanup Strategy:

1. **Create `/docs` folder** for internal documentation
2. **Move internal docs** to `/docs` (keep them but organize better)
3. **Remove test/backup files** (not needed in production repo)
4. **Verify .gitignore** is working (should exclude most unwanted files)
5. **Create cleanup commit** after testing

---

## Step 5: Update Website (projectcoachai.com)

After successful testing:

1. **Copy download URLs** from GitHub release page
2. **Update projectcoachai.com** with download links:
   - Add download buttons
   - Link to GitHub Releases or direct download URLs
   - Add system requirements
   - Add installation instructions

3. **Test website links:**
   - Click download buttons
   - Verify they link to correct GitHub release
   - Test on different browsers/devices

---

## Step 6: Launch Announcement

Once everything is tested:

- [ ] Website updated with download links
- [ ] Downloads tested successfully
- [ ] Installation tested successfully
- [ ] App functionality verified
- [ ] Ready for launch announcement!

---

## Quick Testing Checklist

**Before cleaning up:**

- [ ] ✅ Release published on GitHub
- [ ] ✅ macOS download works
- [ ] ✅ Windows download works
- [ ] ✅ macOS installation works
- [ ] ✅ Windows installation works (if possible)
- [ ] ✅ App launches correctly
- [ ] ✅ Key features work
- [ ] ✅ No critical errors

**After testing:**
- [ ] ✅ Clean up repository (remove unwanted files)
- [ ] ✅ Update website with download links
- [ ] ✅ Prepare launch announcement

---

**Let's test first, then clean up!** Good approach! ✅
