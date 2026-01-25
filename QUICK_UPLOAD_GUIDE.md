# Quick Upload Guide - .dmg and .exe to GitHub

## ✅ Your Installers Are Ready!

Found in `dist/` folder:
- ✅ `ProjectCoachAI Forge Edition V1-1.0.0.dmg` (97 MB - Intel Mac)
- ✅ `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg` (92 MB - Apple Silicon)
- ✅ `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (146 MB - Windows)

---

## 🚀 Quick Upload Steps (5 minutes)

### Step 1: Go to GitHub Releases

1. Open: https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases
2. Click **"Draft a new release"** (or **"Edit"** if updating existing)

### Step 2: Fill Release Form

**Tag:** `v1.0.0`  
**Title:** `ProjectCoachAI Forge Edition V1.0.0`  
**Description:** (Copy from below)

### Step 3: Upload Files

Drag and drop these 3 files from `dist/` folder:
1. `ProjectCoachAI Forge Edition V1-1.0.0.dmg`
2. `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`
3. `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`

### Step 4: Publish

- Uncheck "Set as a pre-release"
- Click **"Publish release"**

---

## 📝 Release Description (Copy This)

```markdown
# ProjectCoachAI Forge Edition V1.0.0

## 🎉 What's New

### Quick Chat Tab Bar (New!)
- ✅ Horizontal tab bar for easy AI switching
- ✅ All 8 AI tools visible at once
- ✅ One-click switching between AIs
- ✅ Corporate design with orange accents
- ✅ Sticky positioning (always visible)

## ✨ Features

- **Multi-Pane AI Workspace** - Compare ChatGPT, Claude, Gemini, Perplexity, Grok, DeepSeek & more side-by-side
- **Quick Chat Mode** - Fast single-AI chat with prominent tab bar
- **AI-Powered Synthesis** - 7 analysis frameworks to synthesize insights
- **Privacy-First** - All data stays local on your device (Swiss Privacy Edition)
- **Free Forever** - No subscription required for core features

## 📥 Installation

1. **macOS Intel**: Download `ProjectCoachAI Forge Edition V1-1.0.0.dmg`
2. **macOS Apple Silicon**: Download `ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg`
3. **Windows**: Download `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`

Double-click the installer and follow the prompts.

## 🛠️ System Requirements

- **macOS**: 10.13 or later
- **Windows**: Windows 10 or later
- **Disk Space**: ~250 MB

## 🤖 Supported AI Tools

- 🤖 ChatGPT
- 🔮 Claude
- ✨ Gemini
- 🔍 Perplexity
- 🌟 DeepSeek
- 🚀 Grok
- 🎯 Mistral
- 💡 POE

---

**Download the installer for your platform below!** ⬇️
```

---

## 🔗 After Publishing - Get Download URLs

After publishing, GitHub will show download links like:

**macOS Intel:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-1.0.0.dmg
```

**macOS Apple Silicon:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-1.0.0-arm64.dmg
```

**Windows:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/v1.0.0/ProjectCoachAI-Forge-Edition-V1-Setup-1.0.0.exe
```

**Note:** GitHub automatically URL-encodes spaces, so the URLs will have `%20` for spaces.

---

## ⚡ Alternative: GitHub CLI (Faster)

If you have GitHub CLI installed:

```bash
cd "/Users/danieljones1562/Downloads/projectcoachai-forge-edition-v1"

gh release create v1.0.0 \
  --title "ProjectCoachAI Forge Edition V1.0.0" \
  --notes "Release notes here" \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0.dmg" \
  "dist/ProjectCoachAI Forge Edition V1-1.0.0-arm64.dmg" \
  "dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe"
```

---

## ✅ That's It!

After uploading, your installers will be available for download from the GitHub Releases page. Users can download directly from there, or you can link to the release page from your website.
