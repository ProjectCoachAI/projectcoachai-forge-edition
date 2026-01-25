# GitHub Update Instructions

## ✅ Code Already Committed
All changes have been committed locally with message:
```
Update: Replace Electron logo with ProjectCoachAI Forge logo
```

## 🚀 Push Code to GitHub

### Option 1: Using Personal Access Token (CLI)
```bash
cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"
git push https://YOUR_TOKEN@github.com/ProjectCoachAI/projectcoachai-forge-edition.git main
```

Replace `YOUR_TOKEN` with your GitHub Personal Access Token.

### Option 2: Using GitHub Desktop or Web Interface
1. Open GitHub Desktop (if installed)
2. Or use GitHub web interface to upload files
3. Or configure SSH keys for future pushes

## 📦 Update GitHub Release with New Installers

### Step 1: Go to Releases
Visit: https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases

### Step 2: Edit Latest Release
1. Click **"Edit"** on the latest release (v1.0.0)
2. Or create a new release if needed

### Step 3: Upload New Install Files
Drag and drop these files from `dist/` folder:

**macOS:**
- `ProjectCoachAI Forge Edition V1-1.0.0.dmg` (97MB - Intel)
- `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg` (92MB - Apple Silicon)

**Windows:**
- `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (146MB - Universal)

### Step 4: Remove Old Files (Optional)
If old installers are present, remove them to avoid confusion.

### Step 5: Update Release Notes
Add note about logo update:
```markdown
## 🎨 Logo Update
- Replaced Electron logo with ProjectCoachAI Forge Edition logo
- All installers now display correct branding
```

### Step 6: Publish
Click **"Update release"** or **"Publish release"**

## 📍 Installer File Locations

All files are in:
```
/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1/dist/
```

**Files to upload:**
1. `ProjectCoachAI Forge Edition V1-1.0.0.dmg` (Intel Mac)
2. `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg` (Apple Silicon Mac)
3. `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (Windows)

## ✅ Verification

After updating:
1. Visit the release page
2. Verify all 3 installers are listed
3. Test download links work
4. Update website with new download URLs if needed
