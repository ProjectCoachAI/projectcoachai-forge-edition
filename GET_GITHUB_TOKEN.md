# How to Get GitHub Personal Access Token

## Step-by-Step Instructions

### Method 1: Direct Link (Easiest)

**Click this link:**
https://github.com/settings/tokens

This should take you directly to the Personal Access Tokens page.

---

### Method 2: Manual Navigation

1. **Go to GitHub.com** and sign in
2. **Click your profile picture** (top right corner)
3. **Click "Settings"** (from the dropdown menu)
4. **Scroll down** in the left sidebar
5. **Click "Developer settings"** (at the bottom of the left sidebar)
6. **Click "Personal access tokens"** (should expand a submenu)
7. **Click "Tokens (classic)"** (or just "Tokens" depending on GitHub version)

You should now see:
- A list of existing tokens (if any)
- A button: **"Generate new token"** or **"Generate new token (classic)"**

---

### Method 3: If You Don't See "Developer settings"

Sometimes the Settings page layout is different. Try:

1. **Go to:** https://github.com/settings/profile
2. **Look for "Developer settings"** in the left sidebar (scroll down)
3. **If not there**, try this direct link: https://github.com/settings/apps

Then look for "Personal access tokens" in the left sidebar.

---

### Method 4: Search for It

1. **Go to Settings** (click profile picture → Settings)
2. **Use the search box** (at the top of Settings page)
3. **Type:** "Personal access tokens" or "tokens"
4. **Click the result** that says "Personal access tokens"

---

## What You Should See

Once you're on the Personal Access Tokens page, you should see:

- **Heading:** "Personal access tokens"
- **Subheading:** "Tokens (classic)" or just "Tokens"
- **Button:** "Generate new token" or "Generate new token (classic)"
- **List of existing tokens** (if you've created any before)

---

## If You Still Can't Find It

### Check GitHub Account Type

- **Personal accounts**: Should have Personal Access Tokens
- **Organization accounts**: May need different permissions

### Alternative: Use GitHub CLI

If you have GitHub CLI installed:

```bash
gh auth login
```

This will guide you through authentication.

### Alternative: Use SSH Instead

If you can't create a token, you can use SSH instead:

1. **Generate SSH key:**
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Add to GitHub:**
   - Go to: https://github.com/settings/keys
   - Click "New SSH key"
   - Paste your public key

3. **Change remote URL to SSH:**
   ```bash
   cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1
   git remote set-url origin git@github.com:ProjectCoachAI/projectcoachai-forge-edition.git
   git push -u origin main
   ```

---

## Screenshot Locations

When you're in Settings, look for:

1. **Left sidebar** should show:
   - Profile
   - Account
   - Appearance
   - Accessibility
   - ... (many options) ...
   - **Developer settings** ← Look for this at the bottom
     - Personal access tokens ← Click this
       - Tokens (classic) ← Click this

2. **Or search for:** "tokens" in Settings search box

---

## Quick Direct Links

Try these direct links in order:

1. **Tokens (classic) page:**
   https://github.com/settings/tokens

2. **Developer settings:**
   https://github.com/settings/apps

3. **All settings:**
   https://github.com/settings/profile

---

**Try the direct link first:** https://github.com/settings/tokens

If that doesn't work, try the manual navigation steps above! ✅
