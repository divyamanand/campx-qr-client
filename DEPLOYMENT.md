# Deployment Guide - CampX QR Scanner

## Overview

This guide covers how to build, package, and distribute the CampX QR Scanner Electron application.

## Prerequisites

- Node.js 16+ LTS installed
- `npm` or `yarn` package manager
- Git (optional)

## Pre-Deployment Checklist

- [ ] Code tested locally (`npm start`)
- [ ] No console errors
- [ ] Package.json version updated
- [ ] README.md current
- [ ] All dependencies installed (`npm install`)
- [ ] No uncommitted changes (if using git)

## Building for Distribution

### 1. Windows Build

**Create Windows Installer and Portable Executable:**

```bash
npm run build:win
```

**Output files in `dist/`:**
- `CampX QR Scanner Setup 0.0.1.exe` - NSIS Installer (recommended)
- `CampX QR Scanner 0.0.1.exe` - Portable (single file)

**Installation:**
- Users download Setup .exe
- Double-click to run installer
- Shortcut created on Desktop
- App listed in Add/Remove Programs

**Portable version:**
- Single executable file
- No installation needed
- Just run the .exe

### 2. macOS Build

```bash
npm run build:mac
```

**Output files in `dist/`:**
- `CampX QR Scanner 0.0.1.dmg` - Disk Image
- `CampX QR Scanner-0.0.1.zip` - Compressed app

**Installation:**
- Users double-click .dmg
- Drag app to Applications folder
- Run from Applications

### 3. Linux Build

```bash
npm run build:linux
```

**Output files in `dist/`:**
- `CampX QR Scanner 0.0.1.AppImage` - Universal AppImage
- `campx-qr-scanner_0.0.1_amd64.deb` - Debian/Ubuntu
- `CampX QR Scanner-0.0.1.tar.gz` - Compressed

**Installation:**
- AppImage: Make executable, double-click
- Deb: `sudo apt install ./file.deb`
- Tar: Extract and run binary

### 4. All Platforms

Build for all platforms at once:

```bash
npm run build
```

Creates installers for Windows, macOS, and Linux.

## Version Management

### Update Version in package.json

```json
{
  "version": "0.0.2"  // Increment for each release
}
```

Version will automatically appear in:
- Installer filename
- Windows version info
- App about dialog
- Update checks

## Code Signing (Production)

For production releases, you should sign the code:

### Windows Code Signing

Update `package.json`:

```json
"build": {
  "win": {
    "certificateFile": "path/to/certificate.pfx",
    "certificatePassword": "password",
    "signingHashAlgorithms": ["sha256"],
    "sign": "./customSign.js",
    "target": ["nsis", "portable"]
  }
}
```

### macOS Code Signing

```json
"build": {
  "mac": {
    "identity": "Developer ID Application: Name (ID)",
    "type": "distribution"
  }
}
```

## Auto-Update Setup (Advanced)

To add auto-update capability:

1. **Install electron-updater**
   ```bash
   npm install electron-updater
   ```

2. **Update electron-main.js**
   ```javascript
   import { autoUpdater } from "electron-updater";

   app.on("ready", () => {
     autoUpdater.checkForUpdates();
   });
   ```

3. **Host releases**
   - GitHub Releases
   - AWS S3
   - Custom server

## Distribution Channels

### Option 1: GitHub Releases

1. Create GitHub repository
2. Push code to GitHub
3. Create Release
4. Attach .exe/.dmg/.AppImage files
5. Share release link with users

**Advantages:**
- Free hosting
- Built-in download management
- Version tracking
- Automatic notifications

### Option 2: Official Website

1. Create download page
2. Upload installers to web server
3. Provide download links
4. Consider CDN for faster downloads

**File hosting suggestions:**
- AWS S3
- DigitalOcean Spaces
- Cloudflare R2
- Traditional web hosting

### Option 3: Software Distribution Platforms

- **Microsoft Store** - Windows apps
- **Mac App Store** - macOS apps
- **Snap Store** - Linux apps
- **Chocolatey** - Windows package manager
- **Homebrew** - macOS package manager

## Installer Configuration

### Windows NSIS Installer

Current configuration in `package.json`:

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true
}
```

Customization options:

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "CampX QR Scanner"
}
```

### Installer Icons

1. Create 512x512 PNG icon
2. Save as `assets/icon.png`
3. electron-builder auto-converts for Windows

## Performance Optimization

### Reduce Bundle Size

1. Remove unused dependencies from `package.json`
2. Use tree-shaking in Webpack (if added)
3. Minify React code

Current size (approx):
- Windows installer: ~100MB
- Installed size: ~50MB
- Portable exe: ~100MB

### Optimize Installation

- Use NSIS (faster than other installers)
- Compress assets
- Remove development files

## Testing Builds

### Test Before Distribution

```bash
# Build for your platform
npm run build:win

# Install from dist/ folder
# Test all features:
# - Directory selection
# - File processing
# - CSV log creation
# - File movement
# - Performance monitoring
```

### Common Issues

| Issue | Solution |
|-------|----------|
| App won't start | Check Node.js version |
| Missing modules | Run `npm install` |
| File access denied | Check permissions |
| Slow processing | Close other apps |

## Release Checklist

- [ ] Version number updated
- [ ] README.md current
- [ ] Code tested locally
- [ ] Dependencies updated (`npm audit fix`)
- [ ] Build succeeds (`npm run build`)
- [ ] Installer tested on target OS
- [ ] All features verified
- [ ] Performance acceptable
- [ ] Release notes prepared
- [ ] Upload to distribution channel

## Release Notes Template

```markdown
# CampX QR Scanner v0.0.2

## New Features
- Feature 1
- Feature 2

## Bug Fixes
- Fixed issue 1
- Fixed issue 2

## Performance
- Improved processing speed by X%
- Reduced memory usage

## Known Issues
- Issue 1
- Issue 2

## Installation
- Download and run installer
- Follow on-screen instructions
```

## User Installation Instructions

### For End Users

**Windows:**
1. Download `CampX QR Scanner Setup.exe`
2. Run the installer
3. Follow the wizard
4. Click "Finish"
5. App opens automatically

**macOS:**
1. Download `CampX QR Scanner.dmg`
2. Open the .dmg file
3. Drag app to Applications folder
4. Launch from Applications

**Linux:**
1. Download `.AppImage` or `.deb`
2. For AppImage: Mark as executable, double-click
3. For Deb: `sudo apt install ./file.deb`

## Post-Deployment

### Monitor Usage

- Track downloads
- Monitor crash reports
- Gather user feedback
- Log common issues

### Update Users

- Announce new versions
- Provide release notes
- Link to download
- Explain improvements

## Continuous Deployment (Optional)

### GitHub Actions

Create `.github/workflows/build.yml`:

```yaml
name: Build & Release
on:
  push:
    tags:
      - 'v*'
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: 16
      - run: npm install
      - run: npm run build:win
      - uses: softprops/action-gh-release@v1
        with:
          files: dist/*
```

Now releases are automatic on tag push!

## Troubleshooting Builds

### Build fails with "missing module"

```bash
npm install
npm cache clean --force
npm install again
npm run build:win
```

### Installer too large

- Compress assets
- Remove dev dependencies
- Use portable version instead

### App won't launch after install

- Check for Windows Defender blocks
- Try portable version
- Reinstall with admin rights

## Security Considerations

- [ ] Code is signed (production)
- [ ] No sensitive data in code
- [ ] IPC validates all input
- [ ] Sandbox enabled
- [ ] No telemetry without consent
- [ ] Privacy policy provided (if needed)

## Support and Feedback

For user support:
1. Create GitHub Issues page
2. Provide email contact
3. Document common problems
4. Provide FAQ

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.0.1 | 2024-01 | Initial Electron release |
| 0.0.2 | TBD | Next version |

## Resources

- [Electron Builder Docs](https://www.electron.build/)
- [Electron Security](https://www.electronjs.org/docs/tutorial/security)
- [Windows NSIS](https://nsis.sourceforge.io/)
- [macOS App Distribution](https://developer.apple.com/macos/)
- [AppImage Specification](https://appimage.org/)

## Next Release

For the next release:

1. Update version in package.json
2. Update CHANGELOG
3. Test thoroughly
4. Build for all platforms
5. Upload to distribution channel
6. Announce to users
7. Monitor feedback

Good luck with your release! 🚀
