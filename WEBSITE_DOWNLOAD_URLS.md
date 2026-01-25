# Download URLs for projectcoachai.pages.dev Website

## 🎯 Important: Use GitHub's Actual Filenames

Since GitHub renames files with spaces to use dots, you must use the **dots version** in your website download links.

---

## ✅ Correct Download URLs (Use These on Website)

### Windows Installer
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
```

### macOS Apple Silicon (ARM)
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg
```

### macOS Intel
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0.dmg
```

⚠️ **Note**: After you upload the macOS files, check what GitHub actually named them and update these URLs if different.

---

## 📝 HTML Code for Download Buttons

Copy this HTML into your website at `projectcoachai.pages.dev`:

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

## 🔍 What to Update on Your Website

1. **Find all download links** pointing to:
   - Old (spaces): `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - Old (spaces URL-encoded): `ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe`

2. **Replace with** (dots version):
   - New: `ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe`

3. **Common locations to check:**
   - Homepage download buttons
   - Download page (`/download`)
   - Navigation menu
   - Footer links
   - Any JavaScript that generates download URLs

---

## ✅ Verification Steps

1. **Test the Windows URL directly:**
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
   ```
   Should start downloading (not 404)

2. **Test from your website:**
   - Go to `projectcoachai.pages.dev`
   - Click Windows download button
   - Should download successfully

3. **Check browser console:**
   - Open DevTools (F12)
   - Look for any 404 errors when clicking download buttons

---

## 📋 After macOS Files Upload

Once you've uploaded the macOS files to GitHub:

1. Go to the GitHub release page
2. Check the **exact filenames** GitHub shows
3. Update the URLs above if GitHub named them differently

---

**Current Status**: Windows URL fixed (uses dots) ✅  
**Action Needed**: Update download links on `projectcoachai.pages.dev` to use the dots version URLs above


