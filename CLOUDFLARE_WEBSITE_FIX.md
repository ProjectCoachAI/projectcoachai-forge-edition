# Cloudflare Website Download URLs - Fix Summary

## 🎯 The Problem
The Windows download link on `projectcoachai.pages.dev` is using the wrong filename format, causing 404 errors.

## ✅ The Fix

### Windows Download URL (MUST USE DOTS)

**❌ Wrong (causes 404):**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
```

**✅ Correct (works):**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
```

**Reason**: GitHub renames files with spaces to use dots when uploaded via web interface.

---

## 📋 All Download URLs (Copy-Paste Ready)

### Windows Installer
```html
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
```

### macOS Apple Silicon (ARM)
```html
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg
```

### macOS Intel
```html
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0.dmg
```

---

## 🔧 HTML Code for Download Buttons

Copy this complete HTML code and replace in your Cloudflare website:

```html
<!-- Windows Download Button -->
<a href="https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe" 
   class="btn btn-primary" 
   download="ProjectCoachAI-Forge-Edition-V1-Setup-1.0.0.exe">
  Download for Windows (146 MB)
</a>

<!-- macOS Apple Silicon Download Button -->
<a href="https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg" 
   class="btn btn-primary" 
   download="ProjectCoachAI-Forge-Edition-V1-1.0.0-arm64.dmg">
  Download for macOS (Apple Silicon) (92 MB)
</a>

<!-- macOS Intel Download Button -->
<a href="https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0.dmg" 
   class="btn btn-primary" 
   download="ProjectCoachAI-Forge-Edition-V1-1.0.0.dmg">
  Download for macOS (Intel) (97 MB)
</a>
```

---

## 🔍 Where to Update on Cloudflare

1. **Cloudflare Pages Dashboard:**
   - Go to your Cloudflare Pages project
   - Find the file(s) with download links (likely `index.html`, `download.html`, or similar)

2. **Search for this pattern** in your website files:
   - `ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe` (wrong - has %20)
   - `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe` (wrong - has spaces)

3. **Replace with:**
   - `ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe` (correct - has dots)

4. **After updating:**
   - Save and commit changes
   - Cloudflare will auto-deploy
   - Test the download links

---

## ✅ Verification

After updating, test these URLs:

**Windows:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
```

Should start downloading immediately (not 404).

---

## 📝 Summary

- **File to update**: Any HTML/JS file with download links
- **What to change**: Replace spaces (%20) with dots (.) in Windows .exe filename
- **Key change**: `ProjectCoachAI%20Forge%20Edition` → `ProjectCoachAI.Forge.Edition`

**Priority**: HIGH - Fixes 404 download error for Windows users


