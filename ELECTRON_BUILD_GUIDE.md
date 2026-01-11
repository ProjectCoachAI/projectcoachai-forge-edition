# Electron App Build & Distribution Guide

## Overview

This guide will help you build and distribute the ProjectCoachAI desktop application for macOS and Windows.

## Prerequisites

### Required
- ✅ Node.js 18+ installed
- ✅ npm or yarn installed
- ✅ Electron Builder installed (`npm install` should handle this)

### For macOS Build
- ✅ macOS machine (required to build .dmg files)
- ⚠️ Apple Developer account (optional, for code signing)
- ⚠️ Code signing certificate (optional, for notarization)

### For Windows Build
- ✅ Can build from macOS using Wine (if needed)
- ⚠️ Windows machine recommended for testing
- ⚠️ Code signing certificate (optional, for trusted installers)

---

## Quick Start

### Build for macOS (Priority)

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1
npm run build:mac
```

This will create:
- `dist/mac/ProjectCoachAI.dmg` - Disk image installer (PRIORITY)
- `dist/mac/ProjectCoachAI.app` - Application bundle

### Build for Windows (Priority)

```bash
cd /Users/danieljones1562/Downloads/ProjectCoachAI-Forge-Edition-V1
npm run build:win
```

This will create:
- `dist/win/ProjectCoachAI Setup.exe` - NSIS installer (PRIORITY)
- `dist/win-unpacked/` - Unpacked application files

### Build for All Platforms

```bash
npm run build
```

---

## Build Scripts

| Script | Command | Output |
|--------|---------|--------|
| **Build All** | `npm run build` | All platforms |
| **Build Mac** | `npm run build:mac` | macOS .dmg |
| **Build Windows** | `npm run build:win` | Windows .exe |
| **Build Linux** | `npm run build:linux` | Linux AppImage |

---

## Distribution Checklist

### Pre-Build

- [ ] Update version number in `package.json`
- [ ] Test the app thoroughly (`npm start`)
- [ ] Verify all features work
- [ ] Check for any console errors
- [ ] Test on target platform (if possible)

### Build

- [ ] Run build command for target platform
- [ ] Verify build completed successfully
- [ ] Check `dist/` folder for output files
- [ ] Test installer on clean machine (if possible)

### Post-Build

- [ ] Test installed application
- [ ] Verify all features work in installed app
- [ ] Check file size (should be reasonable)
- [ ] Upload to distribution platform
- [ ] Update download links on website

---

## File Structure After Build

```
dist/
├── mac/
│   ├── ProjectCoachAI.dmg          # ✅ macOS installer (PRIORITY)
│   └── ProjectCoachAI.app/         # Application bundle
├── win/
│   ├── ProjectCoachAI Setup.exe    # ✅ Windows installer (PRIORITY)
│   └── win-unpacked/               # Unpacked files
└── linux/
    └── ProjectCoachAI.AppImage     # Linux AppImage (optional)
```

---

## Code Signing (Optional but Recommended)

### macOS Code Signing

For production builds, you should code sign your app. This requires:

1. **Apple Developer Account** ($99/year)
   - Sign up at [developer.apple.com](https://developer.apple.com)

2. **Create Code Signing Certificate**
   - Xcode → Preferences → Accounts → Manage Certificates
   - Create "Developer ID Application" certificate

3. **Update package.json** (already configured for signing)

The build configuration is already set up for code signing. When you have a certificate:

```bash
# Set environment variable (if needed)
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"

# Build with signing
npm run build:mac
```

4. **Notarization** (for macOS Gatekeeper)
   - Automatically handled by electron-builder if configured
   - Requires Apple Developer account

### Windows Code Signing

For Windows, you'll need a code signing certificate from a trusted CA.

1. Purchase certificate (e.g., from DigiCert, Sectigo)
2. Install certificate on build machine
3. Configure in `package.json` (already set up)

---

## Distribution Options

### Option 1: Website Hosting (Recommended for Launch)

1. **Upload installers to your website/CDN**
   - Host on your website or CDN (e.g., Cloudflare, AWS S3)
   - Create download pages
   - Provide direct download links

2. **File Hosting Services**
   - GitHub Releases (free, public)
   - Dropbox/Google Drive (simple)
   - AWS S3 (scalable)
   - Cloudflare R2 (cheap, fast)

### Option 2: GitHub Releases (Recommended)

1. **Create GitHub Release**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **Upload Builds**
   - Go to GitHub → Releases → Draft new release
   - Attach `ProjectCoachAI.dmg` and `ProjectCoachAI Setup.exe`
   - Add release notes

### Option 3: Auto-Updater (Future)

For automatic updates, consider:
- `electron-updater` (already in electron-builder ecosystem)
- Update server (can be GitHub Releases or custom server)
- Configure in `main.js`

---

## Testing Your Build

### macOS

1. **Test DMG**
   ```bash
   # Mount DMG
   open dist/mac/ProjectCoachAI.dmg
   
   # Install to Applications
   # Run the app
   ```

2. **Test on Clean System**
   - Use another Mac (if available)
   - Or create a new macOS user account
   - Install and test fresh

3. **Check Gatekeeper**
   - First launch may show security warning (if not signed)
   - Right-click → Open (if needed)
   - System Preferences → Security & Privacy → Allow

### Windows

1. **Test Installer**
   - Run `ProjectCoachAI Setup.exe`
   - Test installation process
   - Verify desktop shortcut
   - Test uninstaller

2. **Test on Clean System**
   - Use Windows VM or another machine
   - Fresh Windows installation
   - Install and test

---

## Build Configuration

The build configuration is in `package.json` under the `"build"` key:

### Key Settings

- **appId**: `com.xencore.projectcoachai` (unique identifier)
- **productName**: `ProjectCoachAI` (display name)
- **output**: `dist/` (build output directory)

### Mac Settings

- **target**: `dmg` (Disk image installer)
- **arch**: `x64`, `arm64` (Intel + Apple Silicon support)
- **category**: `public.app-category.productivity`

### Windows Settings

- **target**: `nsis` (Nullsoft Scriptable Install System)
- **arch**: `x64`, `ia32` (64-bit and 32-bit support)
- **oneClick**: `false` (allows custom installation path)

---

## Troubleshooting

### Build Fails

1. **Check Node.js version**
   ```bash
   node --version  # Should be 18+
   ```

2. **Clean and rebuild**
   ```bash
   rm -rf dist node_modules
   npm install
   npm run build:mac
   ```

3. **Check for errors**
   - Review build output
   - Check console for specific errors
   - Verify all dependencies are installed

### DMG Creation Issues

- **Ensure you're on macOS** (DMG creation requires macOS)
- Check disk space (DMG files can be large)
- Try building with `--dir` flag first to test app bundle

### Code Signing Issues

- **Verify certificate is installed**
  ```bash
  security find-identity -v -p codesigning
  ```

- **Check certificate validity**
  - Keychain Access → My Certificates
  - Verify "Developer ID Application" certificate exists

### File Size Too Large

- **Check what's included**
  - Review `files` array in `package.json`
  - Exclude unnecessary files
  - Remove debug/test files

- **Common culprits**
  - `node_modules` (should be excluded)
  - Large test files
  - Documentation files
  - Source maps (if not needed)

---

## File Size Expectations

### Typical Sizes

- **macOS .dmg**: ~150-250 MB
- **Windows .exe**: ~150-250 MB
- **Linux AppImage**: ~150-250 MB

These sizes are normal for Electron apps (includes Chromium + Node.js).

---

## Version Management

### Update Version

Before building a new release:

1. **Update version in package.json**
   ```json
   {
     "version": "1.0.1"  // Increment as needed
   }
   ```

2. **Build new version**
   ```bash
   npm run build:mac
   npm run build:win
   ```

3. **Tag release (if using Git)**
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

---

## Launch Checklist (February 1)

### Pre-Launch

- [ ] Final testing complete
- [ ] All builds successful
- [ ] Installers tested
- [ ] Download links ready
- [ ] Website updated
- [ ] Release notes written

### Launch Day

- [ ] Upload installers
- [ ] Update download links
- [ ] Announce release
- [ ] Monitor for issues
- [ ] Collect feedback

### Post-Launch

- [ ] Monitor downloads
- [ ] Address any issues
- [ ] Plan next version
- [ ] Gather user feedback

---

## Next Steps

1. ✅ **Build macOS installer** (`npm run build:mac`)
2. ✅ **Build Windows installer** (`npm run build:win`)
3. ✅ **Test both installers**
4. ✅ **Upload to distribution platform**
5. ✅ **Update website with download links**
6. ✅ **Launch February 1!**

---

## Resources

- **Electron Builder Docs**: [www.electron.build](https://www.electron.build)
- **Apple Code Signing**: [developer.apple.com/codesigning](https://developer.apple.com/codesigning)
- **Windows Code Signing**: [docs.microsoft.com/code-signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools)

---

**Ready to build?** Run `npm run build:mac` to get started! 🚀
