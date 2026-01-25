# Windows Download 404 Error - Fix Guide

**Issue**: Users getting 404 error when downloading Windows installer  
**URL reported**: `https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe`

---

## 🔍 Root Cause

**Filename Mismatch**: The URL uses dots (`ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe`), but the actual file has **spaces** (`ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`).

**Local file (in `dist/` folder):**
```
ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe  ✅ (spaces)
```

**URL being used:**
```
ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe  ❌ (dots)
```

GitHub Releases require **exact filename matches** (case-sensitive, spaces vs dots matter).

---

## ✅ Solution Steps

### Step 1: Verify What's Actually on GitHub

1. Go to the GitHub release page:
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/tag/V1.0.0
   ```

2. Check the **Assets** section - look at the exact filename of the `.exe` file:
   - Does it say `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`? (spaces)
   - Or `ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe`? (dots)

3. Right-click the file on GitHub → "Copy link address" to get the **actual download URL**

### Step 2: Fix Option A - If File Has Spaces (Recommended)

If the file on GitHub has **spaces**, update your download URL to use URL-encoded spaces:

**Correct URL:**
```
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
```

**HTML for website:**
```html
<a href="https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe" 
   class="btn btn-primary">
  Download for Windows
</a>
```

### Step 3: Fix Option B - Re-upload with Correct Name

If the file is missing or has the wrong name:

1. **Go to GitHub Releases:**
   ```
   https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases
   ```

2. **Edit the V1.0.0 release** (click "Edit" button)

3. **Remove the old .exe file** (if it exists with wrong name)

4. **Upload the correct file:**
   - File location: `dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
   - Make sure to upload with the **spaces** in the filename

5. **Or use GitHub CLI:**
   ```bash
   cd "/Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1"
   
   gh release upload V1.0.0 "dist/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe" \
     --repo ProjectCoachAI/projectcoachai-forge-edition \
     --clobber
   ```

6. **After upload**, right-click the file on GitHub → "Copy link" to get the correct URL

### Step 4: Update Your Website/Download Page

Update any download links on `projectcoachai.com` to use the correct URL format:

**If file has spaces (most likely):**
```html
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe
```

**Alternative (browser will auto-encode):**
```html
https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe
```

---

## 🧪 Testing

After fixing:

1. **Test the URL directly in browser:**
   - Open: `https://github.com/ProjectCoachAI/projectcoachai-forge-edition/releases/download/V1.0.0/ProjectCoachAI%20Forge%20Edition%20V1%20Setup%201.0.0.exe`
   - Should start downloading (not 404)

2. **Test from your website:**
   - Click the download button
   - Verify it downloads correctly

3. **Test on Windows:**
   - Have a Windows user try the download
   - Verify they can install it

---

## 📝 Notes

- **GitHub URL encoding**: Spaces in filenames are URL-encoded as `%20`
- **Case sensitivity**: GitHub URLs are case-sensitive for tags and filenames
- **Browser handling**: Modern browsers auto-encode spaces, but it's safer to use `%20` explicitly
- **Filename vs URL**: The filename can have spaces, the URL needs `%20` for spaces

---

## 🔗 Related Files

- `DOWNLOAD_URLS.md` - Contains download URLs (updated with correct format)
- `UPLOAD_TROUBLESHOOTING.md` - General upload issues guide
- `GITHUB_RELEASE_UPLOAD_GUIDE.md` - How to upload files to releases

---

**Status**: ⚠️ Action Required  
**Priority**: HIGH - Users cannot download Windows installer  
**Next Step**: Verify GitHub release and update download URLs

