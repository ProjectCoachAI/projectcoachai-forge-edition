# Fix Cloudflare Website Download URLs

## ✅ Current Status

- **GitHub:** Files are correct, downloads work ✅
- **Local files:** URLs are correct (using dots) ✅
- **Cloudflare Pages:** Likely serving old HTML with wrong URLs ❌

---

## 🔍 The Problem

Your website on Cloudflare Pages is linking to GitHub, but the HTML files deployed on Cloudflare probably have **old URLs** (with spaces or wrong format) that don't match what GitHub actually has.

---

## ✅ Solution: Update Cloudflare Pages Files

### Step 1: Verify Local Files Are Correct

Your local `forge.html` already has the correct URLs:
- ✅ Windows: `ProjectCoachAI.Forge.Edition.V1.Setup.1.0.0.exe`
- ✅ macOS Intel: `ProjectCoachAI.Forge.Edition.V1-1.0.0.dmg`
- ✅ macOS ARM: `ProjectCoachAI.Forge.Edition.V1-1.0.0-arm64.dmg`

### Step 2: Upload Updated Files to Cloudflare Pages

**Option A: Direct Upload**
1. Go to Cloudflare Dashboard → Pages
2. Select your site
3. Go to "Deployments" or "Upload assets"
4. Upload the updated files from `~/Downloads/projectcoachai/`:
   - `forge.html`
   - `index.html`
   - `start-free.html`
   - Any other HTML files with download links

**Option B: Git Repository (if connected)**
If your Cloudflare Pages is connected to a Git repo:
```bash
cd ~/Downloads/projectcoachai
git add forge.html index.html start-free.html
git commit -m "Fix download URLs to match GitHub filenames"
git push
```

### Step 3: Clear Cloudflare Cache

After uploading:
1. Cloudflare Dashboard → Caching → Purge Everything
2. Wait 2-3 minutes
3. Test the website

---

## 🔍 How to Check What's Currently Deployed

**View the live website source:**
1. Go to: `projectcoachai.pages.dev/forge.html`
2. Right-click → "View Page Source" (or Cmd+Option+U)
3. Search for: `releases/download`
4. Check what URL it shows:
   - If it has `%20` (spaces) = Wrong, needs update
   - If it has `.` (dots) = Correct, but might be cache issue

---

## 📋 Quick Checklist

- [ ] Local files have correct URLs (already verified ✅)
- [ ] Upload updated files to Cloudflare Pages
- [ ] Clear Cloudflare cache
- [ ] Test website download links
- [ ] Verify by viewing page source on live site

---

**The fix:** Upload the correct HTML files (from `~/Downloads/projectcoachai/`) to Cloudflare Pages, then purge cache.


