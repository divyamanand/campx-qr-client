# Project Structure Guide

## Directory Layout

```
campx-qr-client/
├── src/
│   ├── Components & App
│   │   ├── App.jsx                          ✅ Main React app, file queue, UI
│   │   ├── App.css                          ✅ Application styling
│   │   │
│   │   ├── Logger.jsx                       ✅ Live processing log viewer
│   │   ├── ErrorDisplay.jsx                 ✅ Error visualization component
│   │   └── ErrorDisplay.css                 ✅ Error display styling
│   │
│   ├── Core Scanning Engine
│   │   ├── ScanStrategy.js                  🔴 Main orchestrator (500+ lines)
│   │   │   └─ Detection → ROI → Fallback pipeline
│   │   │
│   │   ├── ROIManager.js                    🔴 Region of interest extraction
│   │   │   └─ Format-specific padding, merging, priority
│   │   │
│   │   ├── RetryController.js               🔴 Retry sequence management
│   │   │   └─ Scale sequences, early exit logic
│   │   │
│   │   ├── ResultAggregator.js              🔴 Code deduplication & tracking
│   │   │   └─ Result aggregation, completion status
│   │   │
│   │   └── ScanTelemetry.js                 🔴 Logging and metrics
│   │       └─ Performance tracking, telemetry export
│   │
│   ├── PDF & Image Processing
│   │   ├── PDFManager.js                    🔴 PDF orchestrator (600+ lines)
│   │   │   └─ Batch processing (5 pages), page orchestration
│   │   │
│   │   ├── PageBatchProcessor.js            🔴 Batch processing utility
│   │   │   └─ Generic batch processor, statistics
│   │   │
│   │   ├── ScanImage.js                     ✅ ZXing-WASM wrapper
│   │   │   └─ Barcode decoder interface
│   │   │
│   │   └── imageUtils.js                    ✅ Image rotation utilities
│   │       └─ 180° rotation with canvas
│   │
│   ├── Utilities & Configuration
│   │   ├── OptimizationManager.js           🔴 Memory management, caching
│   │   │   └─ Concurrency control, GC hints
│   │   │
│   │   ├── ErrorHandler.js                  ✅ Validation logic
│   │   │   └─ Structure-based error detection
│   │   │
│   │   ├── structures.js                    ✅ Expected barcode definitions
│   │   │   └─ Per-page format expectations
│   │   │
│   │   └── index.css                        ✅ Global styles
│   │
│   ├── Entry Point
│   ├── main.jsx                             ✅ React app entry
│   │
│   └── Deprecated (not used)
│       └── PDFToImage.js                    ⚪ No longer needed
│
├── Documentation
│   ├── IMPLEMENTATION_STATUS.md             📄 Complete status report (this session)
│   ├── QUICK_START.md                       📄 Quick start guide
│   ├── PROJECT_STRUCTURE.md                 📄 This file
│   ├── SCANNING_SYSTEM.md                   📄 Architecture guide (600+ lines)
│   ├── BATCH_PROCESSING_GUIDE.md            📄 Batch processing details (500+ lines)
│   └── BATCH_PROCESSING_SUMMARY.md          📄 Performance summary (400+ lines)
│
├── Configuration
│   ├── package.json                         ✅ Dependencies, scripts
│   ├── vite.config.js                       ✅ Build configuration
│   ├── index.html                           ✅ HTML entry
│   │
│   └── node_modules/                        (installed packages)
│       ├── react, react-dom
│       ├── pdfjs-dist                       (PDF rendering)
│       ├── zxing-wasm                       (Barcode decoding)
│       └── ... (other dependencies)
│
├── Build Output
│   └── dist/                                (generated on npm run build)
│       ├── index.html
│       ├── assets/
│       │   ├── index.js
│       │   ├── index.css
│       │   └── pdf.worker.min.js            (1MB+ PDF.js worker)
│       └── ...
│
└── Version Control
    └── .git/                                (git repository)
```

## Color Legend

- 🔴 **Core Scanning** - Critical for barcode detection
- ✅ **Production Ready** - Stable, no changes expected
- 📄 **Documentation** - Guides and references
- ⚪ **Deprecated** - No longer used

---

## Component Relationship Diagram

```
App (React Component)
 ├─→ Logger (display logs)
 ├─→ FileCard (display progress)
 ├─→ ErrorDisplay (show validation errors)
 │    └─→ ErrorHandler (validate results)
 │
 └─→ PDFManager (orchestrator)
      ├─→ PDF.js (load & render)
      │   └─→ renderPageToBlob() → Image Blob
      │
      ├─→ ScanStrategy (scanning pipeline)
      │    ├─→ ScanImage (barcode decode)
      │    │   └─→ ZXing-WASM (detection/decode)
      │    │
      │    ├─→ ROIManager (region extraction)
      │    │   └─→ Canvas API (crop regions)
      │    │
      │    ├─→ RetryController (retry logic)
      │    │
      │    └─→ ResultAggregator (deduplicate)
      │
      ├─→ ScanTelemetry (logging)
      │   └─→ Console/Logger
      │
      └─→ OptimizationManager (memory)
          └─→ Concurrency control
```

## Data Flow Diagram

```
PDF File
  ↓
PDFManager.loadDocument()
  ↓
[FOR EACH PAGE]
  ├─ Get PDF Page
  ├─ Render to Blob
  ├─ Get Dimensions
  │
  ├─→ ScanStrategy.processPage()
  │    │
  │    ├─ Detection Phase (1.5x)
  │    │   ↓ Finds positions
  │    │
  │    ├─ ROI Build
  │    │   ↓ Extracts regions
  │    │
  │    ├─ ROI Decode Phase
  │    │   ├─ Scale 2.5x
  │    │   ├─ Scale 3.5x
  │    │   └─ Scale 4.5x
  │    │
  │    ├─ Fallback Phase
  │    │   ├─ Scale 3x
  │    │   └─ Scale 4x
  │    │
  │    └─ ResultAggregator
  │        └─ Returns final result
  │
  └─ Store in results[pageNumber]

[BATCH COMPLETE - Wait for all 5 pages]
  │
  ├─ Log batch stats
  └─ Continue to next batch

[ALL PAGES COMPLETE]
  ↓
ErrorHandler.validate()
  ↓
Display results + errors
```

---

## File Dependencies

### Core Scanning Pipeline
```
ScanStrategy
  ├─→ imports: ROIManager
  ├─→ imports: RetryController
  ├─→ imports: ResultAggregator
  ├─→ imports: rotateImage (imageUtils)
  └─→ depends on: ScanImage (interface)
```

### PDF Manager
```
PDFManager
  ├─→ imports: ScanImage
  ├─→ imports: ScanStrategy
  ├─→ imports: rotateImage (imageUtils)
  └─→ depends on: PDF.js (external)
```

### App Component
```
App.jsx
  ├─→ imports: PDFManager
  ├─→ imports: Logger
  ├─→ imports: ErrorDisplay
  ├─→ imports: ErrorHandler
  ├─→ imports: structures
  └─→ depends on: React
```

---

## Key Directories Explained

### `/src` - Source Code
Contains all source code for the scanning system.

**Subdirectories (logical grouping):**
- **Top-level:** Components, utilities, configuration
- **No separate folders** - Flat structure for easy navigation

### `/dist` - Build Output
Generated by `npm run build`, ready for deployment.

### `/node_modules` - Dependencies
Third-party packages installed by `npm install`.

**Key packages:**
- `pdfjs-dist` - PDF rendering
- `zxing-wasm` - Barcode decoding
- `react`, `react-dom` - UI framework
- `vite` - Build tool

---

## Modification Guidelines

### When to modify what:

| File | When to modify | Example change |
|------|----------------|-----------------|
| `ScanStrategy.js` | Changing scanning pipeline | Add new detection phase |
| `ROIManager.js` | Changing region extraction | Adjust padding percentages |
| `RetryController.js` | Changing retry logic | Modify scale sequences |
| `PDFManager.js` | Changing batch size | From 5 to 3 pages |
| `ErrorHandler.js` | Adding new error types | New validation rule |
| `structures.js` | Updating expected codes | New course/student data |
| `App.jsx` | Changing UI | New status display |
| `OptimizationManager.js` | Memory tuning | Adjust concurrency limits |

---

## Import Path Convention

All imports use relative paths from `src/`:

```javascript
// ✅ Correct
import { ScanStrategy } from "./ScanStrategy";
import { ROIManager } from "./ROIManager";
import { PDFManager } from "./PDFManager";

// ❌ Avoid
import { ScanStrategy } from "src/ScanStrategy";
import { ScanStrategy } from "@/ScanStrategy";
```

---

## File Size Summary

| File | Size | Type |
|------|------|------|
| PDFManager.js | 600+ | Core |
| ScanStrategy.js | 500+ | Core |
| ScanTelemetry.js | 300+ | Supporting |
| OptimizationManager.js | 400+ | Supporting |
| ErrorHandler.js | 280+ | UI Support |
| App.jsx | 350+ | React |
| SCANNING_SYSTEM.md | 600+ | Documentation |
| BATCH_PROCESSING_GUIDE.md | 500+ | Documentation |
| BATCH_PROCESSING_SUMMARY.md | 400+ | Documentation |

**Total Project Size (source):** ~4,000+ lines of code
**Total Documentation:** ~1,500+ lines of guides

---

## Build Artifacts

```
npm run build generates:

dist/
├── index.html                   0.48 kB
├── assets/
│   ├── pdf.worker.min.js       1,072 kB    (PDF.js worker - large!)
│   ├── index.js                  662 kB    (App + dependencies)
│   └── index.css                 11.6 kB   (All styles)
```

**Total:** ~1.75 MB (uncompressed), ~200 KB (gzipped)

---

## Quick File Lookup

**Need to...?**

- **Add new error type** → `ErrorHandler.js` line 4
- **Change batch size** → `PDFManager.js` line 344
- **Adjust scale sequences** → `RetryController.js` line ~50
- **Change detection scale** → `PDFManager.js` line 48
- **Modify padding** → `ROIManager.js` line ~20
- **Add expected barcodes** → `structures.js` line ~9
- **Change UI layout** → `App.jsx` line 157+
- **View logs** → Click "Processing Log" in app
- **See errors** → Click "Issues" button on file card
- **Monitor performance** → Check Logger and batch stats

---

## Summary

```
✅ Flat structure - easy to navigate
✅ Clear naming - self-documenting
✅ Modular design - change one thing at a time
✅ Well documented - guides for everything
✅ Production ready - build verified
```

For more details on any component, see:
- **IMPLEMENTATION_STATUS.md** - What was implemented
- **SCANNING_SYSTEM.md** - How it works
- **QUICK_START.md** - How to use it

---

**Project Layout:** ✅ Clean & Organized
**Last Updated:** January 26, 2026
