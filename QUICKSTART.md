# Quick Start - CampX QR Scanner Electron App

## What Changed

Your React + Vite app has been converted to a standalone **Electron application**. No more web server, no more build tools. Pure native desktop app.

### Before (React + Vite)
```
npm run dev          # Start dev server
npm run build        # Build with Vite
http://localhost:5173
Browser-based
```

### After (Electron)
```
npm start            # Run native app
npm run build        # Package as .exe/.dmg/.AppImage
Native desktop window
File system access
```

## Installation (One-Time)

```bash
# 1. Navigate to project
cd campx-qr-scanner

# 2. Install dependencies
npm install

# This installs:
# - electron (native framework)
# - All React and processing libraries
```

## Running the App

### Development
```bash
npm start
```
Opens the Electron app immediately. Change code → reload to see changes.

### With DevTools (Debug)
```bash
npm run dev
```
Opens with Developer Tools for debugging.

## Building for Distribution

### Windows (Installer + Portable)
```bash
npm run build:win
```
Creates installers in `dist/` folder:
- `CampX QR Scanner Setup 0.0.1.exe` - NSIS Installer
- `CampX QR Scanner 0.0.1.exe` - Portable version

### macOS
```bash
npm run build:mac
```

### Linux
```bash
npm run build:linux
```

## New Directory Structure

```
campx-qr-scanner/
├── main/                 # ← Electron main process
│   ├── electron-main.js
│   └── electron-preload.js
├── renderer/            # ← React app (was src/)
│   ├── index.html
│   ├── main.jsx
│   ├── App.jsx
│   └── ... other files
├── package.json         # Updated for Electron
└── README.md
```

## Key Differences

### Old Structure (React + Vite)
```
src/
  ├── App.jsx
  ├── main.jsx
  └── ... files
public/
  └── index.html
vite.config.js
index.html (in root)
```

### New Structure (Electron)
```
main/              # Main process code
  ├── electron-main.js
  └── electron-preload.js
renderer/          # Renderer (React) code
  ├── index.html
  ├── main.jsx
  └── App.jsx
package.json       # Simplified, no Vite
```

## What Was Removed

❌ **Removed:**
- `vite.config.js` - Vite build config
- `vitest.config.js` - Vite test config
- `index.html` (root) - Old Vite entry
- `/src` directory (moved to `/renderer`)
- `@vitejs/plugin-react` dependency
- `vite` dependency
- Browser-based batch processors
- Browser-based file logger
- React development components

✅ **Added:**
- `main/electron-main.js` - Electron entry
- `main/electron-preload.js` - IPC bridge
- `renderer/` directory - React app
- `electron` dependency
- `electron-builder` dependency
- Proper Electron build config

## File Changes Checklist

- [x] Electron main process created
- [x] Preload script for IPC
- [x] Renderer structure set up
- [x] All React files moved
- [x] Build tools removed
- [x] Package.json updated
- [x] Documentation updated

## Usage Example

### Select Directory and Process

1. **Run the app**
   ```bash
   npm start
   ```

2. **App window opens**
   - Shows "Batch Processing" panel
   - "Browse" button to select directory
   - "Start Processing" button

3. **Select a directory**
   - Click Browse
   - Choose folder with PDFs
   - System creates `/logs` and `/completed`

4. **Start processing**
   - Click "Start Batch Processing"
   - Real-time stats update
   - CSV logs created in `/logs`
   - Completed files moved to `/completed`

## Common Commands

```bash
# Start in development
npm start

# Start with debug tools
npm run dev

# Build for Windows
npm run build:win

# Build for all platforms
npm run build

# View package info
cat package.json
```

## Project Dependencies

### Required
- **electron** - Native app framework
- **react** - UI library
- **react-dom** - React renderer
- **pdfjs-dist** - PDF processing
- **@zxing/browser** - Barcode scanning
- **zxing-wasm** - WASM barcode library

### Build
- **electron-builder** - Package as .exe/.dmg/.AppImage

No Vite, no webpack, no babel config needed!

## Environment

The app expects:
- Windows 10+ / macOS 10.13+ / Linux
- 100MB disk space for installation
- 150MB RAM during processing

## Troubleshooting

### "electron command not found"
```bash
npm install
# Reinstall dependencies
```

### "Port 5173 already in use"
```bash
# Electron doesn't use ports, direct app access
npm start
```

### "Can't select directory"
```bash
# Make sure you're on Windows/macOS/Linux, not WSL
# Run native app, not in terminal
npm start
```

### "App won't start"
```bash
# Check Node version
node --version  # Should be 16+

# Clear node_modules and reinstall
rm -rf node_modules
npm install
npm start
```

## Next Steps

1. **Get Familiar**
   - Run `npm start`
   - Select a folder with PDFs
   - Watch it process

2. **Customize**
   - Edit `renderer/App.jsx` for UI changes
   - Edit `main/electron-main.js` for new features
   - Edit `package.json` for app metadata

3. **Build for Users**
   ```bash
   npm run build:win
   ```
   Creates installer ready to distribute

4. **Package Distribution**
   - Share .exe file (portable)
   - Or use NSIS installer
   - No additional runtime needed!

## Performance Tips

- **Fast Processing**: Uses parallel page processing
- **Low Memory**: Constant ~100-150MB
- **Disk Based**: All logs on disk, not memory
- **Batch Mode**: 5 files at a time

## Documentation

- **[README.md](README.md)** - Full project docs
- **[DISK_BATCH_PROCESSING.md](DISK_BATCH_PROCESSING.md)** - Technical details
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design
- **[SETUP_DISK_BATCH.md](SETUP_DISK_BATCH.md)** - Configuration guide

## That's It!

You now have a professional Electron desktop app. No web server, no build tools, just native performance.

```bash
npm install
npm start
```

Enjoy! 🚀
