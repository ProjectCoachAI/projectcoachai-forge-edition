# Production Security Configuration

## Overview
This document outlines the security measures implemented for production builds of ProjectCoachAI Forge Edition V1.

## Production Mode Detection
The application uses `app.isPackaged` to detect if it's running in a packaged/production build:
- **Development**: `app.isPackaged === false` (DevTools enabled, debug logging)
- **Production**: `app.isPackaged === true` (DevTools disabled, security measures active)

## Security Measures Implemented

### 1. DevTools Disabled in Production
- **Main Window**: DevTools completely disabled via `webPreferences.devTools: false`
- **BrowserViews**: DevTools disabled for all AI tool panes
- **All Secondary Windows**: DevTools disabled for pricing, registration, sign-in, admin, comparison, ranking, and synthesis windows

### 2. Keyboard Shortcut Blocking
- Blocks `Cmd+Option+I` (Mac) and `Ctrl+Shift+I` (Windows/Linux) in production
- If DevTools somehow opens, it's immediately closed automatically

### 3. Application Menu
- Empty menu set (`Menu.setApplicationMenu(null)`) in production to remove default DevTools menu items

### 4. Security Event Handlers
All windows have security handlers that immediately close DevTools if detected:
```javascript
if (isProduction) {
    window.webContents.on('devtools-opened', () => {
        window.webContents.closeDevTools();
    });
}
```

## Additional Security Recommendations

### Code Protection (Not Yet Implemented)

#### 1. Code Obfuscation
For additional source code protection, consider:
- **JavaScript Obfuscator**: https://obfuscator.io/ or https://github.com/javascript-obfuscator/javascript-obfuscator
- **Webpack with obfuscation plugin**: Use `webpack-obfuscator` for bundled code
- **Electron Builder**: Configure minification and dead code elimination

**Example webpack-obfuscator config:**
```javascript
const JavaScriptObfuscator = require('webpack-obfuscator');

module.exports = {
    plugins: [
        new JavaScriptObfuscator({
            rotateStringArray: true,
            stringArray: true,
            stringArrayCallsTransform: true,
            stringArrayEncoding: ['base64'],
            stringArrayThreshold: 0.75
        }, ['excluded_bundle_name.js'])
    ]
};
```

#### 2. Source Map Removal
- Remove source maps from production builds
- Configure `electron-builder` to exclude `.map` files
- Set `devtool: false` in production webpack config

#### 3. Binary Protection
- **Code Signing**: Sign macOS and Windows executables (already configured)
- **ASAR Protection**: Electron Builder packages files in ASAR archive by default
- **Anti-Tampering**: Consider additional binary obfuscation tools for critical paths

#### 4. API Key Protection
✅ **Already Implemented**:
- API keys stored in local files, not in repository
- Environment variables used for sensitive data
- `.gitignore` excludes credential files

#### 5. Runtime Protection
- **Process Monitoring**: Detect debugger attachment
- **Integrity Checks**: Verify application files haven't been modified
- **License Validation**: Server-side license checks for premium features

#### 6. Network Security
✅ **Already Implemented**:
- Content Security Policy (CSP) headers
- HTTPS for all external connections
- No nodeIntegration in renderer processes
- Context isolation enabled

## Implementation Status

### ✅ Completed
- [x] DevTools disabled in production
- [x] Keyboard shortcut blocking
- [x] Empty application menu in production
- [x] Security event handlers on all windows
- [x] Production mode detection via `app.isPackaged`
- [x] BrowserView DevTools protection
- [x] Context isolation enabled
- [x] Node integration disabled
- [x] CSP headers configured

### 🔄 Recommended for Future
- [ ] Code obfuscation for JavaScript files
- [ ] Source map removal in production
- [ ] Binary protection/anti-tampering
- [ ] Runtime integrity checks
- [ ] Process monitoring for debugger detection

## Testing Production Security

1. **Build Production Version**:
   ```bash
   npm run build:mac  # or build:win
   ```

2. **Test DevTools Blocking**:
   - Open the packaged application
   - Try `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows/Linux)
   - DevTools should not open
   - Check console for security logs

3. **Verify Menu**:
   - Check application menu bar
   - No "View > Toggle Developer Tools" option should appear

4. **Test All Windows**:
   - Open pricing, registration, sign-in, admin, comparison, ranking, synthesis windows
   - Attempt to open DevTools on each
   - DevTools should be blocked on all

## Notes
- Development mode still allows full DevTools access for debugging
- Security measures are automatically applied based on build type
- No manual configuration needed - handled by `app.isPackaged` check

## References
- Electron Security Best Practices: https://www.electronjs.org/docs/latest/tutorial/security
- OWASP Electron Security Guidelines: https://owasp.org/www-community/vulnerabilities/Electron_Security_Issues

