# Upload .dmg and .exe Files to GitHub Releases

## 🎯 Overview

This guide shows you how to upload the built `.dmg` (macOS) and `.exe` (Windows) installer files to GitHub Releases so users can download them.

---

## 📋 Prerequisites

1. **Built installers** in the `dist/` folder:
   - `ProjectCoachAI Forge Edition V1-1.0.0.dmg` (macOS)
   - `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (Windows)

2. **GitHub repository** access:
   - Repository: `https://github.com/ProjectCoachAI/projectcoachai-forge-edition`
   - You need write access to create releases

---

## 🚀 Method 1: Manual Upload via GitHub Web Interface (Easiest)

### Step 1: Build the Installers

```bash
cd "/Users/danieljones1562/Downloads/projectcoachai-forge-edition-v1"

# Build macOS .dmg
npm run build:mac

# Build Windows .exe (if on Windows, or use CI/CD)
npm run build:win
```

**Output location:**
- macOS: `dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg`
- Windows: `dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`

### Step 2: Go to GitHub Releases

1. Navigate to your repository:
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition
   ```

2. Click **"Releases"** (right sidebar, or go to `/releases`)

3. Click **"Draft a new release"** (or **"Edit"** if updating existing release)

### Step 3: Fill Out Release Form

#### Tag Version
- **Tag:** `v1.0.0` (or `v1.0.1` for updates)
- **Target:** `main` branch
- Click **"Create new tag: v1.0.0 on publish"** if tag doesn't exist

#### Release Title
```
ProjectCoachAI Forge Edition V1.0.0
```

#### Release Description
```markdown
# ProjectCoachAI Forge Edition V1.0.0

## 🎉 What's New

### Quick Chat Tab Bar (New!)
- ✅ Horizontal tab bar for easy AI switching
- ✅ All 8 AI tools visible at once
- ✅ One-click switching between AIs
- ✅ Corporate design with orange accents
- ✅ Sticky positioning (always visible)

### Features

- **Multi-Pane AI Workspace** - Compare ChatGPT, Claude, Gemini, Perplexity, Grok, DeepSeek & more side-by-side
- **Quick Chat Mode** - Fast single-AI chat with prominent tab bar
- **AI-Powered Synthesis** - 7 analysis frameworks to synthesize insights
- **Privacy-First** - All data stays local on your device (Swiss Privacy Edition)
- **Free Forever** - No subscription required for core features

### System Requirements

- **macOS**: 10.13 or later
- **Windows**: Windows 10 or later
- **Disk Space**: ~250 MB

### Installation

1. **macOS**: Download `.dmg` → Double-click → Drag to Applications
2. **Windows**: Download `.exe` → Double-click → Follow installer wizard

### Supported AI Tools

- 🤖 ChatGPT
- 🔮 Claude
- ✨ Gemini
- 🔍 Perplexity
- 🌟 DeepSeek
- 🚀 Grok
- 🎯 Mistral
- 💡 POE

### Getting Started

1. Launch the app
2. Select AI tools from the toolshelf
3. Use Quick Chat mode for fast switching
4. Use Multi-Pane mode for side-by-side comparison
5. Use Synthesis for deeper insights

---

**Download the installer for your platform below!** ⬇️
```

### Step 4: Upload Installer Files

1. Scroll down to **"Attach binaries by dropping them here or selecting them"**

2. **Drag and drop** or **click to browse**:

   **macOS:**
   - File: `dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg`
   - Wait for upload to complete (shows progress bar)

   **Windows:**
   - File: `dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - Wait for upload to complete

**Note:** 
- Upload can take 2-5 minutes per file (files are ~150-250 MB)
- Don't close the browser tab during upload
- GitHub will show upload progress

### Step 5: Publish Release

1. **Uncheck** "Set as a pre-release" (unless it's a beta)
2. Click **"Publish release"** (green button)
3. Wait for release to be created
4. You'll be redirected to the release page

---

## 🔗 Method 2: Using GitHub CLI (gh)

### Install GitHub CLI

```bash
# macOS
brew install gh

# Or download from: https://cli.github.com/
```

### Authenticate

```bash
gh auth login
```

### Create Release and Upload Files

```bash
cd "/Users/danieljones1562/Downloads/projectcoachai-forge-edition-v1"

# Create release and upload files in one command
gh release create v1.0.0 \
  --title "ProjectCoachAI Forge Edition V1.0.0" \
  --notes-file RELEASE_NOTES.md \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
  "dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe"
```

**Or update existing release:**

```bash
# Upload files to existing release
gh release upload v1.0.0 \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
  "dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe" \
  --clobber  # Replace if files already exist
```

---

## 🤖 Method 3: GitHub Actions (Automated)

Create `.github/workflows/release.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build
        run: |
          if [ "${{ matrix.os }}" == "macos-latest" ]; then
            npm run build:mac
          else
            npm run build:win
          fi
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.os }}-installer
          path: dist/*.dmg dist/*.exe
  
  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Download artifacts
        uses: actions/download-artifact@v3
        with:
          path: ./artifacts
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            artifacts/**/*
          tag_name: ${{ github.ref }}
          name: Release ${{ github.ref }}
          body: |
            See RELEASE_NOTES.md for details
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## 📍 File Locations

After building, files will be in:

```
dist/
├── ProjectCoachAI Forge Edition V1-1.0.0.dmg          (macOS)
├── ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg     (macOS Apple Silicon)
└── win/
    └── ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe  (Windows)
```

---

## 🔗 Download URLs

After publishing, GitHub will provide download URLs:

**macOS:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-1.0.0.dmg
```

**Windows:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-Setup-1.0.0.exe
```

**Note:** GitHub automatically URL-encodes spaces in filenames.

---

## ✅ Verification Checklist

After uploading:

- [ ] Both `.dmg` and `.exe` files are listed on release page
- [ ] File sizes are correct (~150-250 MB each)
- [ ] Download links work (test by clicking)
- [ ] Release notes are complete
- [ ] Tag is correct (v1.0.0)
- [ ] Release is published (not draft)

---

## 🔄 Updating an Existing Release

If you need to update files on an existing release:

1. Go to the release page
2. Click **"Edit release"**
3. Scroll to **"Attach binaries"**
4. **Remove old files** (click X next to filename)
5. **Upload new files** (drag and drop)
6. Click **"Update release"**

---

## 📝 Release Notes Template

Save this as `RELEASE_NOTES.md`:

```markdown
# ProjectCoachAI Forge Edition V1.0.0

## 🎉 What's New

### Quick Chat Tab Bar
- Horizontal tab bar for easy AI switching
- All 8 AI tools visible at once
- One-click switching between AIs
- Corporate design with orange accents
- Sticky positioning (always visible)

## ✨ Features

- Multi-Pane AI Workspace
- Quick Chat Mode with prominent tab bar
- AI-Powered Synthesis (7 analysis frameworks)
- Privacy-First (Swiss Privacy Edition)
- Free Forever (core features)

## 📥 Installation

1. Download the installer for your platform
2. macOS: Double-click `.dmg` → Drag to Applications
3. Windows: Double-click `.exe` → Follow installer wizard

## 🛠️ System Requirements

- macOS: 10.13 or later
- Windows: Windows 10 or later
- Disk Space: ~250 MB

## 🐛 Bug Fixes

- Fixed Quick Chat selector prominence
- Improved tab bar visibility
- Enhanced corporate design consistency

## 📚 Documentation

- Website: https://projectcoachai.com
- Issues: https://github.com/ProjectCoachAI/projectcoachai-forge-edition/issues
```

---

## 🚀 Quick Command Reference

```bash
# Build installers
npm run build:mac    # macOS .dmg
npm run build:win    # Windows .exe

# Upload via GitHub CLI
gh release create v1.0.0 \
  --title "V1.0.0" \
  --notes "Release notes here" \
  dist/*.dmg dist/win/*.exe

# Or update existing release
gh release upload v1.0.0 dist/*.dmg dist/win/*.exe --clobber
```

---

## ⚠️ Important Notes

1. **File Size Limits:**
   - GitHub allows files up to 2 GB
   - Your installers should be well under this (~150-250 MB)

2. **Upload Time:**
   - ~2-5 minutes per file depending on internet speed
   - Don't close browser during upload

3. **Versioning:**
   - Use semantic versioning: `v1.0.0`, `v1.0.1`, `v1.1.0`, etc.
   - Tag format: `v1.0.0` (with 'v' prefix recommended)

4. **Release Types:**
   - **Release**: Production-ready (uncheck "pre-release")
   - **Pre-release**: Beta/alpha versions (check "pre-release")

---

## 🎯 Next Steps After Uploading

1. ✅ **Test download links** from the release page
2. ✅ **Update website** (`forge.html`) with new download URLs
3. ✅ **Verify installers work** on clean systems
4. ✅ **Announce release** (if ready for public launch)

---

## 📞 Troubleshooting

### Upload Fails
- Check file size (must be < 2 GB)
- Check internet connection
- Try uploading one file at a time
- Use GitHub CLI as alternative

### Files Not Appearing
- Refresh the release page
- Check if upload completed (progress bar)
- Verify files are in `dist/` folder

### Wrong Files Uploaded
- Edit release → Remove old files → Upload new ones
- Or create a new release with correct files

---

**Ready to upload?** Build your installers, then follow Method 1 (web interface) for the easiest upload process! 🚀
