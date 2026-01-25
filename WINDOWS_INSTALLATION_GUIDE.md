# Windows Installation Guide

## 🪟 Installing ProjectCoachAI Forge Edition on Windows

### Standard Installation (Recommended)
1. Download `ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe`
2. Double-click the `.exe` file
3. If Windows Defender SmartScreen appears:
   - Click **"More info"**
   - Click **"Run anyway"**
4. Follow the installer wizard
5. Launch from Start Menu or Desktop shortcut

---

## ⚠️ If You Get Blocked by Windows Defender SmartScreen

Windows may show a warning: **"Windows protected your PC"** or **"SmartScreen prevented an unrecognized app from starting"**

### Solution 1: Unblock via Properties (Easiest)
1. **Right-click** the `.exe` file
2. Select **"Properties"**
3. At the bottom, check the **"Unblock"** checkbox (if present)
4. Click **"OK"**
5. Double-click the `.exe` again

### Solution 2: Run Anyway (Quick Fix)
1. When the SmartScreen warning appears, click **"More info"**
2. Click **"Run anyway"** button
3. The installer will proceed

### Solution 3: PowerShell Unblock Command
If the file is blocked, run this in PowerShell (as Administrator):

```powershell
# Navigate to the download folder
cd $env:USERPROFILE\Downloads

# Unblock the file
Unblock-File -Path "ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe"

# Verify it's unblocked
Get-Item "ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe" | Select-Object Name, IsReadOnly
```

**Or use Command Prompt:**
```cmd
cd %USERPROFILE%\Downloads
powershell -Command "Unblock-File -Path 'ProjectCoachAI Forge Edition V1 Setup 1.0.0.exe'"
```

### Solution 4: Disable SmartScreen Temporarily (Not Recommended)
⚠️ **Only if other methods fail and you trust the source:**

1. Open **Windows Security** (Settings → Privacy & Security → Windows Security)
2. Click **"App & browser control"**
3. Under **"Check apps and files"**, set to **"Warn"** or **"Off"** (temporarily)
4. Install the app
5. **Re-enable SmartScreen** after installation

---

## 🔒 Why This Happens

- **Unsigned Application**: The app is not code-signed with a Microsoft certificate
- **Unknown Publisher**: Windows hasn't seen this app before
- **SmartScreen Protection**: Windows Defender is protecting you from potentially unsafe apps

**This is normal** for applications that haven't been signed with a code-signing certificate (which requires a paid certificate from a Certificate Authority).

---

## ✅ After Installation

Once installed, the app should run normally. You may see a warning the first time you launch it, but subsequent launches should be smooth.

---

## 📧 For Your Colleague

**Quick Instructions to Share:**

```
Hi! Here's how to install ProjectCoachAI Forge Edition on Windows:

1. Download the .exe file
2. Right-click → Properties → Check "Unblock" (if present) → OK
3. Double-click to install
4. If Windows shows a warning, click "More info" → "Run anyway"

That's it! The app is safe - Windows just doesn't recognize it yet because it's new.

If you have issues, let me know!
```

---

## 🛠️ Troubleshooting

### "The app can't run on your PC"
- **Cause**: Architecture mismatch (32-bit vs 64-bit)
- **Solution**: The installer includes both x64 and ia32, so this shouldn't happen. If it does, try running as Administrator.

### "Administrator permission required"
- **Solution**: Right-click the `.exe` → **"Run as administrator"**

### Installation fails silently
- **Solution**: Check Windows Event Viewer for errors
- Or try installing to a different location (e.g., `C:\Users\YourName\AppData\Local\`)

### Antivirus blocks installation
- **Solution**: Add the installer to your antivirus exception list
- Or temporarily disable real-time protection during installation

---

## 📝 Notes

- The app is **not malware** - it's just unsigned
- Windows SmartScreen warnings are **normal** for new/unsigned apps
- Once installed, the app runs normally
- Future updates may have the same warning until we get code-signing

---

## 🔐 Code Signing (Future)

To eliminate these warnings permanently, we would need:
- A **Code Signing Certificate** from a trusted CA (e.g., DigiCert, Sectigo)
- Cost: ~$200-400/year
- Process: Sign the `.exe` before distribution

For now, the unblock methods above work perfectly fine.
