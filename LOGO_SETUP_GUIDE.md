# 🎨 Logo Setup Guide for Electron App

## Required Files

Electron Builder needs icon files in the `build/` directory:

### Option 1: Single PNG File (Recommended)
- **File:** `build/icon.png`
- **Size:** 512x512 pixels minimum (1024x1024 recommended)
- **Format:** PNG with transparency
- **What it does:** Electron Builder automatically converts this to:
  - `icon.icns` for macOS
  - `icon.ico` for Windows

### Option 2: Platform-Specific Files
- **macOS:** `build/icon.icns` (multiple sizes embedded)
- **Windows:** `build/icon.ico` (multiple sizes embedded)

---

## Quick Setup Steps

### Step 1: Prepare Your Logo
1. **If you have a PNG/SVG/Logo file:**
   - Resize to 1024x1024 pixels (square)
   - Export as PNG with transparent background
   - Save as `build/icon.png`

2. **If you only have the SVG from HTML:**
   - Extract the SVG code from `index.html` (logo section)
   - Convert SVG to PNG using:
     - Online tool: https://cloudconvert.com/svg-to-png
     - Or use ImageMagick: `convert logo.svg -resize 1024x1024 icon.png`

### Step 2: Place Icon File
```bash
# Place your icon file here:
build/icon.png
```

### Step 3: Verify Configuration
The `package.json` should already be configured to use `build/icon.png` automatically.

### Step 4: Rebuild
```bash
npm run build:mac
```

Electron Builder will:
- ✅ Convert `icon.png` → `icon.icns` for macOS
- ✅ Use `icon.png` for Windows (or create `icon.ico`)
- ✅ Apply icon to the app bundle

---

## Icon Requirements

### macOS (.icns)
- Contains multiple sizes: 16x16, 32x32, 128x128, 256x256, 512x512, 1024x1024
- Electron Builder creates this automatically from PNG

### Windows (.ico)
- Contains multiple sizes: 16x16, 32x32, 48x48, 256x256
- Electron Builder creates this automatically from PNG

---

## Creating Icons from SVG

If you have the SVG logo from your HTML files:

1. **Extract SVG** from `index.html` (the logo SVG element)

2. **Convert to PNG** using one of these methods:

   **Method A: Online Converter**
   - Go to https://cloudconvert.com/svg-to-png
   - Upload SVG
   - Set size: 1024x1024
   - Download PNG
   - Save as `build/icon.png`

   **Method B: Command Line (macOS)**
   ```bash
   # Install ImageMagick if needed
   brew install imagemagick
   
   # Convert SVG to PNG
   convert logo.svg -resize 1024x1024 -background none icon.png
   mv icon.png build/icon.png
   ```

   **Method C: Using Node.js (if you have sharp)**
   ```bash
   npm install -g sharp-cli
   sharp -i logo.svg -o build/icon.png --resize 1024 1024
   ```

---

## Testing the Icon

After adding the icon and rebuilding:

1. **macOS:**
   - Check app icon in Applications folder
   - Check icon in Dock when app is running
   - Check icon in DMG installer

2. **Windows:**
   - Check app icon in Start menu
   - Check icon in Task Manager
   - Check icon in installer

---

## Troubleshooting

### Icon not showing?
1. Verify file is in `build/icon.png`
2. Check file size is at least 512x512
3. Ensure PNG format (not JPEG)
4. Rebuild the app after adding icon

### Icon looks blurry?
- Use larger source image (1024x1024 or 2048x2048)
- Ensure PNG has transparency preserved
- Use PNG-24 format, not PNG-8

### Icon not updating?
- Delete `dist/` folder before rebuilding
- Clear Electron Builder cache: `rm -rf ~/.cache/electron-builder`

---

## Current Configuration

Your `package.json` is already set up with:
```json
{
  "build": {
    "directories": {
      "buildResources": "build"
    }
  }
}
```

This means Electron Builder automatically looks for `build/icon.png` (or `build/icon.icns`/`build/icon.ico`).

---

**Next Step:** Provide your logo file, and I'll help you set it up! 🎨
