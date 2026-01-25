# Windows Code Signing Setup Guide

## 🎯 Goal: Click-and-Play Installation (No Warnings)

To eliminate Windows SmartScreen warnings, you need a **Code Signing Certificate** from a trusted Certificate Authority.

---

## 📋 What You Need to Purchase

### Option 1: Standard Code Signing Certificate (Recommended)
**Providers:**
- **DigiCert** - $199-399/year (most trusted)
- **Sectigo (formerly Comodo)** - $199-299/year (popular, good value)
- **GlobalSign** - $249-499/year
- **SSL.com** - $199-299/year

**What to buy:**
- **"Code Signing Certificate"** (not SSL certificate)
- **EV (Extended Validation)** is better but more expensive ($400-600/year)
- **Standard** works fine for most apps ($200-300/year)

### Option 2: Microsoft Store (Alternative)
- Publish to Microsoft Store (requires Microsoft Developer account: $19 one-time)
- Microsoft handles code signing automatically
- But requires Store submission process

---

## 🔐 Recommended: DigiCert Code Signing Certificate

**Why DigiCert:**
- Most trusted by Windows
- Fastest SmartScreen reputation building
- Excellent support
- Works immediately after signing

**Cost:** ~$299/year for standard code signing

**Purchase:**
1. Go to: https://www.digicert.com/code-signing
2. Select "Code Signing Certificate"
3. Choose "Standard" (EV not required for Electron apps)
4. Complete purchase and verification

---

## 📝 Certificate Requirements

**Before purchasing, you need:**
1. **Company/Organization Name**: Xencore Global GmbH (already in package.json)
2. **Business Verification**: Certificate Authority will verify your business
3. **Windows Machine**: To install certificate and sign (can be Windows VM on Mac)

---

## 🛠️ Setup Process (After Purchase)

### Step 1: Receive Certificate
- CA will email you certificate file (.pfx or .p12)
- Or download from their portal

### Step 2: Install Certificate on Windows Machine
```powershell
# Import certificate
Import-PfxCertificate -FilePath "certificate.pfx" -CertStoreLocation Cert:\LocalMachine\My
```

### Step 3: Configure Electron Builder

Update `package.json`:

```json
{
  "build": {
    "win": {
      "target": ["nsis"],
      "publisherName": "Xencore Global GmbH",
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "your-password",
      "signingHashAlgorithms": ["sha256"],
      "sign": "path/to/signtool.exe"
    }
  }
}
```

**Or use environment variables (more secure):**
```json
{
  "build": {
    "win": {
      "target": ["nsis"],
      "publisherName": "Xencore Global GmbH",
      "certificateFile": "${env.CSC_LINK}",
      "certificatePassword": "${env.CSC_KEY_PASSWORD}"
    }
  }
}
```

Then set environment variables:
```bash
export CSC_LINK="path/to/certificate.pfx"
export CSC_KEY_PASSWORD="your-password"
```

### Step 4: Build Signed Installer
```bash
npm run build:win
```

The installer will be automatically signed during build.

---

## ✅ After Signing

**Results:**
- ✅ No SmartScreen warnings
- ✅ "Publisher: Xencore Global GmbH" shown
- ✅ Click-and-play installation
- ✅ Users trust the app immediately

**Note:** First-time signing may take 24-48 hours for SmartScreen to recognize, but no warnings after that.

---

## 💰 Cost Summary

**One-time costs:**
- Code Signing Certificate: $200-300/year
- Windows machine/VM (if needed): $0-100 (can use free Windows VM)

**Ongoing:**
- Certificate renewal: $200-300/year
- No per-installation costs

---

## 🚀 Quick Start Checklist

- [ ] Purchase code signing certificate (DigiCert recommended)
- [ ] Complete business verification with CA
- [ ] Receive certificate file (.pfx)
- [ ] Set up Windows build environment (or VM)
- [ ] Install certificate on Windows machine
- [ ] Configure `package.json` with certificate path
- [ ] Build signed installer: `npm run build:win`
- [ ] Test installer on clean Windows machine
- [ ] Verify no SmartScreen warnings appear

---

## 📞 Next Steps

1. **Purchase certificate** from DigiCert or Sectigo
2. **Complete verification** (usually 1-3 business days)
3. **I'll help configure** the build process once you have the certificate
4. **Rebuild installer** with signing enabled
5. **Test** on clean Windows machine

---

## 🔒 Security Notes

- **Never commit** certificate files to Git
- Use environment variables for passwords
- Store certificate securely (password manager)
- Keep certificate backup in secure location

---

## 📚 Resources

- **DigiCert Code Signing**: https://www.digicert.com/code-signing
- **Sectigo Code Signing**: https://sectigo.com/ssl-certificates-tls/code-signing
- **Electron Builder Signing**: https://www.electron.build/code-signing
