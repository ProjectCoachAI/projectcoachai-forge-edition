# GitHub Setup Guide for ProjectCoachAI Forge Edition V1

## Overview

This guide will help you set up GitHub for hosting your installers and managing releases.

---

## Step 1: Create GitHub Repository

### Option A: Create Repository on GitHub Website (Recommended)

1. **Go to GitHub:**
   - Visit [github.com](https://github.com)
   - Sign in (or create account if needed)

2. **Create New Repository:**
   - Click the **"+"** icon (top right) → **"New repository"**
   - Repository name: `projectcoachai-forge-edition` (or your preferred name)
   - Description: "ProjectCoachAI Forge Edition V1 - Desktop AI Workspace Manager"
   - Visibility: **Private** (recommended) or **Public**
   - **DO NOT** initialize with README, .gitignore, or license (we'll add these)
   - Click **"Create repository"**

3. **Copy Repository URL:**
   - GitHub will show you the repository URL
   - Example: `https://github.com/YOUR_USERNAME/projectcoachai-forge-edition.git`
   - Save this URL for Step 2

### Option B: Create via GitHub CLI (If installed)

```bash
gh repo create projectcoachai-forge-edition --private --description "ProjectCoachAI Forge Edition V1 - Desktop AI Workspace Manager"
```

---

## Step 2: Initialize Git Repository (If Not Already Done)

### Check Current Status

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1
git status
```

### If Not a Git Repository:

```bash
# Initialize git repository
git init

# Add all files (respects .gitignore)
git add .

# Create initial commit
git commit -m "Initial commit: ProjectCoachAI Forge Edition V1"

# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/projectcoachai-forge-edition.git

# Rename default branch to main (if needed)
git branch -M main

# Push to GitHub
git push -u origin main
```

### If Already a Git Repository:

```bash
# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/projectcoachai-forge-edition.git

# Check current branch
git branch

# If branch is 'master', rename to 'main'
git branch -M main

# Push to GitHub
git push -u origin main
```

---

## Step 3: Verify .gitignore is Set Up

The `.gitignore` file should exclude:
- ✅ `node_modules/`
- ✅ `dist/` (build outputs)
- ✅ API key files (`*API*.txt`, `*key*.txt`, etc.)
- ✅ User data (`userData/`)
- ✅ OS files (`.DS_Store`, etc.)

**Important:** Never commit API keys or user data!

Verify `.gitignore` is working:

```bash
# Check what will be committed (should NOT show node_modules, dist, API keys)
git status

# Check .gitignore exists
ls -la .gitignore
```

---

## Step 4: Create Initial README.md

Create a professional README for your repository:

```bash
# The README.md file already exists, but you can update it with:
```

**README.md should include:**
- Project description
- Features
- Installation instructions
- Download links (pointing to Releases)
- System requirements
- License

---

## Step 5: Push Code to GitHub

```bash
# Check status
git status

# Add any new files (respects .gitignore)
git add .

# Commit changes
git commit -m "Setup: ProjectCoachAI Forge Edition V1 - Ready for release"

# Push to GitHub
git push origin main
```

---

## Step 6: Create Your First Release (After Building Installers)

### Step 6a: Build Installers First

**Before creating a release, you need to build the installers:**

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1

# Build macOS installer
npm run build:mac
# Output: dist/mac/ProjectCoachAI Forge Edition V1-1.0.0.dmg

# Build Windows installer
npm run build:win
# Output: dist/win/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe
```

### Step 6b: Create GitHub Release

**Option A: Via GitHub Website (Recommended for First Release)**

1. **Go to Your Repository:**
   - Visit: `https://github.com/YOUR_USERNAME/projectcoachai-forge-edition`

2. **Create Release:**
   - Click **"Releases"** (right sidebar, or `/releases` in URL)
   - Click **"Draft a new release"** or **"Create a new release"**

3. **Fill Release Form:**
   - **Tag version**: `v1.0.0` (or `1.0.0`)
   - **Release title**: `ProjectCoachAI Forge Edition V1 - Initial Release`
   - **Description** (Release notes):
     ```markdown
     # ProjectCoachAI Forge Edition V1 - Initial Release
     
     ## What's New
     - Initial release of ProjectCoachAI Forge Edition V1
     - Multi-pane AI workspace for comparing ChatGPT, Claude, Gemini, Perplexity, and more
     - AI-powered synthesis with 7 analysis frameworks
     - Clean, beautiful interface
     - Privacy-first (all data stays local)
     
     ## System Requirements
     - **macOS**: 10.13 or later
     - **Windows**: Windows 10 or later
     
     ## Installation
     1. Download the installer for your platform
     2. Double-click to install
     3. Launch ProjectCoachAI Forge Edition V1
     
     ## Support
     - Website: https://projectcoachai.com
     - Issues: [Report issues here](https://github.com/YOUR_USERNAME/projectcoachai-forge-edition/issues)
     ```

4. **Attach Installers:**
   - Scroll down to **"Attach binaries by dropping them here"**
   - Drag and drop:
     - `dist/mac/ProjectCoachAI Forge Edition V1-1.0.0.dmg`
     - `dist/win/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - Wait for uploads to complete

5. **Publish Release:**
   - Click **"Publish release"** button
   - Release is now live!

**Option B: Via GitHub CLI (If installed)**

```bash
# Create release with tag
gh release create v1.0.0 \
  --title "ProjectCoachAI Forge Edition V1 - Initial Release" \
  --notes "Initial release of ProjectCoachAI Forge Edition V1" \
  "dist/mac/ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
  "dist/win/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe"
```

**Option C: Via Git Tags**

```bash
# Tag the release
git tag -a v1.0.0 -m "ProjectCoachAI Forge Edition V1 - Initial Release"

# Push tag to GitHub
git push origin v1.0.0

# Then go to GitHub website to create release and attach files
```

---

## Step 7: Get Download URLs

After creating the release, you'll have direct download URLs:

**macOS:**
```
https://github.com/YOUR_USERNAME/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-1.0.0.dmg
```

**Windows:**
```
https://github.com/YOUR_USERNAME/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-Setup-1.0.0.exe
```

**Save these URLs** - you'll use them on your website!

---

## Step 8: Link from Your Website (projectcoachai.com)

Update your website to link to GitHub Releases:

**Option A: Direct Links to Installers:**
```html
<!-- projectcoachai.com/download -->
<div class="download-buttons">
  <a href="https://github.com/YOUR_USERNAME/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-1.0.0.dmg" 
     class="btn btn-primary" 
     download>
    Download for macOS
  </a>
  <a href="https://github.com/YOUR_USERNAME/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-Setup-1.0.0.exe" 
     class="btn btn-primary" 
     download>
    Download for Windows
  </a>
</div>
```

**Option B: Link to Releases Page:**
```html
<a href="https://github.com/YOUR_USERNAME/projectcoachai-forge-edition/releases" 
   class="btn btn-primary">
  Download from GitHub Releases
</a>
```

---

## Step 9: Future Releases (Workflow)

For future versions:

```bash
# 1. Update version in package.json
# "version": "1.0.1"

# 2. Build new installers
npm run build:mac
npm run build:win

# 3. Commit and push
git add .
git commit -m "Release v1.0.1: [description of changes]"
git push origin main

# 4. Create new release on GitHub
# Tag: v1.0.1
# Attach new .dmg and .exe files
# Update release notes

# 5. Update website links to new version
```

---

## Security Checklist

Before pushing to GitHub:

- [ ] ✅ `.gitignore` is set up correctly
- [ ] ✅ No API keys in repository (`git grep -i "sk-"` should return nothing)
- [ ] ✅ No user data files
- [ ] ✅ No sensitive credentials
- [ ] ✅ `node_modules/` is excluded
- [ ] ✅ `dist/` is excluded (installers uploaded separately to Releases)

**Verify no sensitive data:**

```bash
# Check for API keys (should return nothing)
git grep -i "sk-" --cached
git grep -i "api.*key" --cached

# Check what will be committed
git status
git diff --cached
```

---

## Quick Reference Commands

```bash
# Initialize repository
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/projectcoachai-forge-edition.git
git push -u origin main

# Regular workflow
git add .
git commit -m "Description of changes"
git push origin main

# Create release tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0

# Build installers
npm run build:mac
npm run build:win

# Check what will be committed
git status
git diff
```

---

## Troubleshooting

### "Repository not found"
- Check repository URL is correct
- Verify you have access to the repository
- Check GitHub username is correct

### "Permission denied"
- Check GitHub authentication (use Personal Access Token if needed)
- Verify SSH keys are set up (if using SSH)
- Use HTTPS instead of SSH if issues persist

### Large files / Slow push
- `.gitignore` should exclude `node_modules/`, `dist/`, etc.
- Use `git status` to verify large files aren't being committed
- Consider Git LFS for very large files (not needed for this project)

### API keys in repository
- **CRITICAL**: Remove immediately if accidentally committed
- Use `git filter-branch` or BFG Repo-Cleaner to remove from history
- Rotate API keys immediately
- Add to `.gitignore` and recommit

---

## Next Steps

1. ✅ Create GitHub repository
2. ✅ Initialize git (if needed)
3. ✅ Push code to GitHub
4. ✅ Build installers (`npm run build:mac` and `npm run build:win`)
5. ✅ Create first release on GitHub
6. ✅ Update projectcoachai.com with download links
7. ✅ Launch! 🚀

---

**Ready to set up?** Start with Step 1 and you'll be ready to host installers on GitHub in minutes! ✅
