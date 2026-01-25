# Fix Download URLs in Cloudflare HTML Files

## 🔍 What to Search For and Replace

Open each HTML file in your "Cloudflare upload" folder and search for download URLs.

### Files to Check:
- `index.html`
- `forge.html` 
- `start-free.html`
- Any other HTML files with download buttons

---

## ✅ Search & Replace Instructions

### Find This (Wrong - causes 404):

**Pattern 1** (URL-encoded spaces):
```
ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
```

**Pattern 2** (plain spaces):
```
ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe
```

### Replace With (Correct - works):

```
ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
```

---

## 📋 Complete URLs to Replace

### Find This (Complete Wrong URL):
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
```

### Replace With (Complete Correct URL):
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
```

---

## 🔧 Step-by-Step Fix

### In Each HTML File:

1. **Open the file** (e.g., `index.html`, `forge.html`, `start-free.html`)

2. **Search** (Cmd+F or Ctrl+F) for:
   - `ProjectCoachAI%20` (spaces URL-encoded)
   - OR `ProjectCoachAI Forge` (plain spaces)

3. **Find** any download links like:
   ```html
   <a href="https://github.com/.../ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe">
   ```

4. **Replace** with:
   ```html
   <a href="https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe">
   ```

5. **Save** the file

---

## ✅ All Correct URLs (Copy These)

### Windows:
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe
```

### macOS ARM:
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg
```

### macOS Intel:
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1-1.0.0.dmg
```

---

## 🧪 After Fixing - Verify

1. Open each HTML file
2. Search for `releases/download` to find all download links
3. Verify all Windows .exe URLs use **dots** (`.`) not spaces (`%20` or ` `)
4. Save all files
5. Upload to Cloudflare Pages

---

## 📝 Quick Reference

**Key Change:**
- `%20` (spaces encoded) → `.` (dots)
- `ProjectCoachAI Forge` → `ProjectCoachAI.Forge`

**Files to update:**
- ✅ `index.html`
- ✅ `forge.html`
- ✅ `start-free.html`
- ✅ Any other HTML with download links

---

**After making these changes and uploading to Cloudflare, the 404 error will be fixed!** ✅


