# Push Code to GitHub - Quick Guide

## Repository Created Successfully! ✅

Repository URL: `https://github.com/ProjectCoachAI/projectcoachai-forge-edition`

---

## Step 1: Get Personal Access Token

**GitHub no longer accepts passwords for HTTPS Git operations. You need a Personal Access Token.**

### Create Token:

1. **Go to GitHub Settings:**
   - Visit: https://github.com/settings/tokens
   - Or: GitHub → Your Profile → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Generate New Token:**
   - Click **"Generate new token"** → **"Generate new token (classic)"**
   - Note: `ProjectCoachAI Push Access`
   - Expiration: Choose duration (90 days, 1 year, or no expiration)
   - Scopes: Check **`repo`** (Full control of private repositories)
     - This gives read/write access to your repositories

3. **Generate and Copy:**
   - Click **"Generate token"** at bottom
   - **IMPORTANT**: Copy the token immediately (you won't see it again!)
   - Format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

## Step 2: Push Code to GitHub

### Option A: Push with Manual Authentication (Recommended)

Open your terminal and run:

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1

# Push to GitHub
git push -u origin main
```

**When prompted:**
- **Username**: `ProjectCoachAI` (or your GitHub username)
- **Password**: **Paste your Personal Access Token** (not your GitHub password)

**That's it!** Your code will be pushed to GitHub.

---

### Option B: Use Token in URL (Alternative)

**Less secure but convenient:**

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1

# Replace YOUR_TOKEN with your actual token
git remote set-url origin https://YOUR_TOKEN@github.com/ProjectCoachAI/projectcoachai-forge-edition.git

# Push (won't prompt for credentials)
git push -u origin main
```

**⚠️ Warning**: Token will be stored in git config. Anyone with access to your machine can see it.

---

### Option C: Use SSH (Most Secure)

**If you have SSH keys set up:**

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1

# Change remote URL to SSH
git remote set-url origin git@github.com:ProjectCoachAI/projectcoachai-forge-edition.git

# Push (uses SSH key)
git push -u origin main
```

**Requires SSH key setup first:**
- Generate SSH key: `ssh-keygen -t ed25519 -C "your_email@example.com"`
- Add to GitHub: Settings → SSH and GPG keys → New SSH key

---

## Step 3: Verify Push Success

After pushing, check GitHub:

1. **Visit repository:**
   - https://github.com/ProjectCoachAI/projectcoachai-forge-edition

2. **You should see:**
   - ✅ All your files (109 files)
   - ✅ README.md
   - ✅ Source code
   - ✅ Documentation

3. **If successful:**
   - Code is now on GitHub! ✅
   - Ready for next steps (build installers, create release)

---

## Troubleshooting

### "Authentication failed"
- ✅ Make sure you're using Personal Access Token (not password)
- ✅ Check token has `repo` scope
- ✅ Verify token hasn't expired
- ✅ Try generating a new token

### "Permission denied"
- ✅ Check you have write access to the repository
- ✅ Verify organization access (if using ProjectCoachAI org)
- ✅ Try using your personal account instead

### "Remote already exists"
- Remote is already configured (this is fine!)
- Just run: `git push -u origin main`

### "fatal: could not read Username"
- This happens in non-interactive environments
- Run the command in your terminal (it will prompt for credentials)
- Or use token in URL (Option B)

---

## Next Steps After Successful Push

Once code is on GitHub:

1. ✅ **Verify on GitHub**: Check repository shows all files
2. ✅ **Build installers**: `npm run build:mac` and `npm run build:win`
3. ✅ **Create first release**: Upload .dmg and .exe files
4. ✅ **Update website**: Add download links to projectcoachai.com

---

## Quick Command Reference

```bash
# Check remote is configured
git remote -v

# Push to GitHub (will prompt for credentials)
git push -u origin main

# Check status
git status

# View commits
git log --oneline -5
```

---

**Ready to push?** Open your terminal and run `git push -u origin main` with your Personal Access Token! 🚀
