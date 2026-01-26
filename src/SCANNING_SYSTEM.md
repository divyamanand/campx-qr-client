# Barcode Scanning System Architecture

## Overview

This is a production-grade PDF barcode scanning engine designed for high-volume document processing. The system processes PDFs page-by-page with intelligent retry logic, ROI-based detection, and comprehensive error handling.

---

## System Components

### 1. **PDFManager** - Orchestrator
- Loads PDF files
- Renders pages to images at various scales
- Coordinates the scanning process
- Manages results aggregation

**Key Methods:**
- `processFile(pdfFile, onPageComplete, onLog)`
- `getTheScanResults()`
- `getSummary()`

---

### 2. **ScanStrategy** - Smart Detector
Implements the detection → ROI → decode → fallback pipeline.

**Pipeline Flow:**

```
1. Detection Phase (Low Scale 1.5x)
   ↓ Detect barcode positions

2. ROI Phase (Multiple Scales 2.5x, 3.5x, 4.5x)
   ↓ Build regions of interest
   ↓ Decode each ROI
   ↓ Early exit if all required formats found

3. Fallback Phase (Full Page, Scales 3x, 4x)
   ↓ Only if ROI phase failed
```

**Key Methods:**
- `processPage(imageBlob, pageNumber, requiredFormats, imageMetadata)`
- `roiDecodePhase(...)`
- `fullPageFallbackPhase(...)`

---

### 3. **ROIManager** - Region Intelligence
Extracts and manages regions of interest.

**Capabilities:**
- Extract ROI with format-specific padding
- Merge overlapping ROIs into union ROI
- Prioritize decode order (union → individual ROIs)
- Handle edge cases (small barcodes, near edges)

**Padding Configuration:**
| Format  | Padding |
| ------- | ------- |
| QRCode  | 25%     |
| Code128 | 15%     |
| Union   | 20%     |

**Key Methods:**
- `buildROIs(detectedCodes, imageWidth, imageHeight)`
- `extractROI(position, format, width, height)`
- `mergeROIs(rois, width, height)`
- `cropCanvasToBlob(canvas, roi)`

---

### 4. **RetryController** - Retry Logic
Manages scale sequences and retry state.

**Scale Sequences:**
- ROI Decode: `[2.5, 3.5, 4.5]`
- Fallback Full-Page: `[3, 4]`

**Features:**
- Track attempted scales
- Detect found formats
- Prevent duplicate attempts
- Early exit when all required codes found

**Key Methods:**
- `getNextROIScale(requiredFormats)`
- `getNextFullPageScale()`
- `shouldRotate()`
- `shouldContinueRetry(requiredFormats)`

---

### 5. **ResultAggregator** - Result Tracking
Collects and deduplicates codes across attempts.

**Deduplication:**
- Same data + same format = duplicate
- Tracks best attempt (most codes)
- Determines completion status

**Key Methods:**
- `addCodes(codes, metadata)`
- `getResult()`
- `shouldStopScanning(retryController)`

---

### 6. **ScanImage** - Barcode Decoder
Thin wrapper around ZXing-WASM.

**Configuration:**
```javascript
{
  tryHarder: true/false,
  formats: ["QRCode", "Code128"],
  maxNumberOfSymbols: 2
}
```

---

### 7. **ErrorHandler** - Validation
Validates results against expected structure.

**Detects:**
- Page count mismatch
- Missing QR codes
- Partial detection
- Tampering (format mismatch)
- Damaged QR codes
- PDF editing

---

### 8. **ScanTelemetry** - Observability
Comprehensive logging and metrics.

**Tracks:**
- Detection metrics
- ROI metrics
- Retry patterns
- Decode attempts
- Performance timings
- Memory usage

**Key Methods:**
- `event(type, message, data)`
- `recordPhase(pageNumber, phaseName, duration)`
- `getSessionSummary()`
- `export()`

---

### 9. **OptimizationManager** - Performance
Parallel processing and resource management.

**Features:**
- Concurrency control (files & pages)
- Memory monitoring
- Garbage collection hints
- Performance metrics
- Backpressure handling

**Key Methods:**
- `processFilesSequentially(files, processorFn)`
- `processPagesSequentially(pages, processorFn)`
- `adjustConcurrency()`
- `getMetrics()`

---

## Processing Flow (Detailed)

### Page Processing (Sequential)

```javascript
For each page:
  1. Render at initial scale (1.0x or configured)
  2. Use ScanStrategy.processPage():

     a) DETECTION PHASE:
        - Scan full page at low scale (1.5x)
        - If no codes: skip to FALLBACK
        - If codes found: extract ROIs

     b) ROI PHASE:
        For scale in [2.5, 3.5, 4.5]:
          For each ROI (union first):
            - Decode at scale
            - If success: aggregate codes
            - If all required formats found: EXIT PAGE
            - If fail: try rotated version

     c) FALLBACK PHASE:
        If ROI phase didn't complete:
          For scale in [3, 4]:
            - Decode full page at scale
            - If success: aggregate codes
            - If complete: EXIT PAGE

  3. Return aggregated result
```

### File Processing (Parallel)

```javascript
For each file:
  1. Load PDF
  2. For each page (sequential or parallel with limits):
     - Process page (see above)
     - Store result
     - Call onPageComplete callback
  3. Return file results

Multiple files processed in parallel:
  - Max 3 concurrent files (configurable)
  - Max 5 concurrent pages per file (configurable)
  - Memory-aware: reduce concurrency if memory > 85%
```

---

## Key Design Decisions

### 1. **Detection-First Approach**
- Low-scale detection finds positions quickly
- ROI decoding is more efficient than full-page retry
- Early termination saves 70–90% compute

### 2. **Scale Strategies**
- **Detection Scale (1.5x):** Fast position finding
- **ROI Scales [2.5, 3.5, 4.5]:** Graduated quality
- **Fallback Scales [3, 4]:** Limited full-page retry

### 3. **ROI Priority Order**
1. Union ROI (contains all symbols)
2. Individual ROIs (largest first)

Prevents redundant decoding of overlapping regions.

### 4. **Rotation as Last Resort**
- Only attempted after non-rotated fails
- Only for ROIs, never full page
- Cheap operation (canvas transform)

### 5. **Early Exit Conditions**
Stop scanning when:
- All required formats found
- All required code count reached
- No more scales/retries available
- Detection or decode error occurs

---

## Configuration

### PDFManager Config

```javascript
new PDFManager({
  initialScale: 3,           // Render scale
  maxScale: 9,               // Max retry scale
  minScale: 1,               // Min retry scale
  enableRotation: true,      // Allow 180° rotation
  rotationDegrees: 180,      // Rotation angle
  structure: structureObj,   // Expected codes per page
  detectionScale: 1.5,       // Low-scale detection
  onStrategyLog: logFn       // Strategy logging
})
```

### OptimizationManager Config

```javascript
new OptimizationManager({
  maxConcurrentFiles: 3,     // Parallel files
  maxConcurrentPages: 5,     // Parallel pages per file
  enableMemoryMonitoring: true,
  gcInterval: 10             // GC every N pages
})
```

---

## Logging & Telemetry

### Log Types

| Type      | Purpose                      |
| --------- | ---------------------------- |
| `start`   | Processing started           |
| `phase`   | Phase transition             |
| `scale`   | Scale change                 |
| `info`    | Information                  |
| `success` | Code detected                |
| `warning` | Issue (retry needed)         |
| `error`   | Failure                      |
| `complete`| Processing finished          |

### Telemetry Events

```javascript
telemetry.event('phase', 'Starting ROI decode', {
  pageNumber: 1,
  scale: 2.5,
  roiLabel: 'UNION'
})
```

---

## Performance Characteristics

### Typical Page Processing

| Phase     | Time (ms) | Notes                    |
| --------- | --------- | ------------------------ |
| Render    | 10–30     | Canvas rendering         |
| Detect    | 20–50     | Low-scale scan           |
| ROI Build | 5–10      | Math operations          |
| ROI Decode| 50–150    | 1–3 scales × ROIs        |
| Fallback  | 20–100    | Full-page, 1–2 scales    |
| **Total** | **100–350**| Depends on complexity    |

### Memory Usage

- Per-page baseline: ~5–10 MB
- Canvas cache: ~2–5 MB per concurrent page
- With memory monitoring: auto-reduces concurrency

---

## Error Handling Strategy

### Detection Failures
→ Fallback to full-page decode

### ROI Decode Failures
→ Try rotation
→ Try next scale
→ Fallback to full-page

### Full-Page Failures
→ Return best result from attempts
→ Mark as partial if missing codes
→ Return failure if no codes at all

---

## Testing Scenarios

### Happy Path
1. Well-printed PDF
2. Single pass detection
3. ROI decode succeeds
4. Return complete result

### Degradation Case
1. Low-quality printing
2. Detection succeeds partially
3. ROI decode needs retries
4. Fallback full-page succeeds
5. Return complete result (with attempt metadata)

### Failure Case
1. Missing QR code
2. Detection finds nothing
3. All ROI/fallback attempts fail
4. Return no-codes result
5. Validation catches missing format

---

## SOLID Principles Applied

### Single Responsibility
- `ScanImage`: Only decode
- `PDFToImage`: Only render
- `ROIManager`: Only region logic
- `RetryController`: Only retry state
- `ResultAggregator`: Only result tracking

### Open/Closed
- Extend retry sequences via `RetryController.CONFIG`
- Add new decode strategies without modifying existing

### Liskov Substitution
- Any `ScanImage` implementation works with `ScanStrategy`
- Strategy is swappable

### Interface Segregation
- Each class has focused, minimal interface
- Consumers don't depend on unused methods

### Dependency Inversion
- `ScanStrategy` depends on `ScanImage` interface
- `PDFManager` depends on `ScanStrategy` interface
- Easy to mock for testing

---

## Best Practices

✅ **Do:**
- Use `ScanStrategy` for page processing
- Let `RetryController` manage retries
- Let `ResultAggregator` deduplicate
- Monitor telemetry for insights
- Use `OptimizationManager` for batches

❌ **Don't:**
- Directly retry without `RetryController`
- Manually manage scale sequences
- Call `ScanImage.scan()` multiple times without strategy
- Ignore `shouldStopScanning()` signal
- Process unlimited concurrent files/pages

---

## Migration Guide

### From Old PDFManager to ScanStrategy

**Before:**
```javascript
await manager.processPage(page, pageNum, fileName, onLog)
// Internally: loop through scales, try rotation, aggregate
```

**After:**
```javascript
// ScanStrategy handles all complexity
const result = await scanStrategy.processPage(
  imageBlob,
  pageNumber,
  requiredFormats,
  imageMetadata
)
```

---

## Future Enhancements

### Phase 1: Worker Threads
- Move ScanImage to Web Worker
- Move ROI cropping to Worker
- Reduce main-thread blocking

### Phase 2: Adaptive Heuristics
- Learn page difficulty from first page
- Dynamically adjust scale sequence
- Skip detection on high-confidence pages

### Phase 3: ML-Based Positioning
- Replace ZXing detection with ML model
- Faster, more accurate positions
- Smaller ROIs

### Phase 4: GPU Rendering
- Use OffscreenCanvas for rendering
- Parallel page rendering
- Faster canvas-to-blob conversion

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| Slow processing | High memory usage | Reduce `maxConcurrentPages` |
| Missing codes | Poor PDF quality | Increase `maxScale` |
| High memory | Too many concurrent pages | Enable memory monitoring |
| Timeouts | Scale sequence too long | Reduce `maxScale` or add time limit |
| Rotation issues | Bad padding | Adjust `PADDING_CONFIG` |

---

## References

- [ROIManager](./ROIManager.js)
- [RetryController](./RetryController.js)
- [ResultAggregator](./ResultAggregator.js)
- [ScanStrategy](./ScanStrategy.js)
- [ScanTelemetry](./ScanTelemetry.js)
- [OptimizationManager](./OptimizationManager.js)
