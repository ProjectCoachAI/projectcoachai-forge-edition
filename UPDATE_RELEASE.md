# Update GitHub Release with New Intel-Compatible DMG

## Steps to Update Release

### Step 1: Locate New DMG File

Your new Intel-compatible DMG should be in:
```
dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg
```
or
```
dist/mac/ProjectCoachAI Forge Edition V1-1.0.0.dmg
```

**File name will be different** from the ARM64 version (won't have "-arm64" in the name).

---

### Step 2: Go to GitHub Release

1. **Visit your release page:**
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/tag/V1.0.0
   ```

2. **Click "Edit release"** (pencil icon) at the top right of the release page

---

### Step 3: Update Release Assets

You have two options:

#### Option A: Replace Old File (Recommended)

1. **Remove old ARM64 DMG:**
   - In the "Attached binaries" section
   - Click the **"X"** next to `ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg`
   - Confirm removal

2. **Upload new Intel DMG:**
   - Drag and drop the new `.dmg` file (from `dist/` folder)
   - Or click "Attach binaries" and browse for the file
   - Wait for upload to complete

3. **Result:** Only the Intel-compatible DMG will be available

---

#### Option B: Add New File (Keep Both)

1. **Keep old ARM64 DMG** (for Apple Silicon Mac users)
2. **Upload new Intel DMG** (for Intel Mac users)
3. **Result:** Both files available (users choose based on their Mac)

**If keeping both**, update release notes to clarify:
- `ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg` - For Apple Silicon Macs (M1/M2/M3)
- `ProjectCoachAI.Forge.Edition.V1-1.0.0.dmg` - For Intel Macs

---

### Step 4: Update Release Notes (Optional)

If replacing the file, you might want to add a note:

```markdown
## Update (Intel Mac Support)

Fixed: Now includes Intel (x64) support
- Previous version: ARM64 only
- New version: Intel-compatible
```

---

### Step 5: Save Changes

1. **Review** your changes
2. **Click "Update release"** button (or "Publish release" if draft)
3. **Wait** for upload to complete
4. **Verify** new file appears in release

---

## After Updating

### Test New Download

1. **Download the new DMG** from GitHub release page
2. **Test on your Intel Mac:**
   - Double-click DMG
   - Drag app to Applications
   - Right-click → Open (if Gatekeeper blocks)
   - App should launch!

### Update Download URLs (If Needed)

If file name changed, update any links on your website:

**New URL format:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI-Forge-Edition-V1-1.0.0.dmg
```

(Remove "-arm64" from filename in URL)

---

## Quick Checklist

- [ ] New DMG file built (Intel-compatible)
- [ ] Located new DMG file in `dist/` folder
- [ ] Opened GitHub release edit page
- [ ] Removed old ARM64 DMG (if replacing)
- [ ] Uploaded new Intel DMG
- [ ] Updated release notes (optional)
- [ ] Saved/updated release
- [ ] Verified new file appears
- [ ] Tested download on Intel Mac

---

**Ready to update the release!** Once uploaded, the Intel-compatible DMG will work on your Mac! ✅
