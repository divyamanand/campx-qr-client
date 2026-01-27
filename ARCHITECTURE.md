# System Architecture - Disk-Based Batch Processing

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React App (Renderer)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  App.jsx                                             │  │
│  │  - Directory selection via dialog                    │  │
│  │  - Counter-only state (no logs in memory!)          │  │
│  │  - Stats display: processed/completed/errors/time   │  │
│  │  - Timer updates (live elapsed time)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ▲                                   │
│                           │ IPC Messages                      │
│                           ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ElectronBatchProcessor                              │  │
│  │  - Reads PDFs from primary directory                │  │
│  │  - Batches files (5 at a time)                      │  │
│  │  - Sends progress callbacks (no logs!)              │  │
│  │  - Moves completed files to /completed             │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                   │
│                           │ Writes                            │
│                           ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ElectronFileLogger                                  │  │
│  │  - CSV file on disk (in /logs directory)            │  │
│  │  - Each log written immediately (no buffering)      │  │
│  │  - Never stored in memory                           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ▲          │                      │          │
         │ IPC      │ IPC (fs operations)  │          │ CSV file
         │ calls    │                      │          │ writes
         │          ▼                      ▼          ▼
┌─────────────────────────────────────────────────────────────┐
│               Electron Main Process                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  electron-main.js                                    │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │  IPC Handlers                                 │ │  │
│  │  │  - fs:readFile / fs:writeFile                │ │  │
│  │  │  - fs:readdir / fs:ensureDir                 │ │  │
│  │  │  - fs:moveFile                               │ │  │
│  │  │  - dialog:selectDirectory                    │ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                   │
│                           │ Node.js APIs                      │
│                           ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  File System (Node.js fs module)                     │  │
│  │  - Read PDFs from disk                              │  │
│  │  - Write CSV logs to disk                           │  │
│  │  - Move files between directories                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ▲
         │
         │
┌─────────────────────────────────────────────────────────────┐
│              Operating System / File System                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  /primary-directory/                                 │  │
│  │  ├── file1.pdf (source)                             │  │
│  │  ├── file2.pdf (source)                             │  │
│  │  ├── logs/                                          │  │
│  │  │   └── batch-1704000000000.csv (CSV logs)        │  │
│  │  └── completed/                                     │  │
│  │      ├── file1.pdf (moved here after processing)   │  │
│  │      └── file2.pdf (moved here after processing)   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow - Processing a Batch

```
Start: User selects directory and clicks "Start"
│
├─ Initialize Logger
│   └─ Create: /primary-dir/logs/batch-1704000000000.csv
│      (CSV header written: Timestamp,Type,Message,...)
│
├─ For each batch (5 files):
│   │
│   ├─ Read PDF files from /primary-dir
│   │   └─ Filter: only *.pdf files
│   │   └─ Get: [file1.pdf, file2.pdf, file3.pdf, file4.pdf, file5.pdf]
│   │
│   ├─ For each file in batch:
│   │   │
│   │   ├─ Load PDF into memory (full file)
│   │   │   └─ Memory: ~1-50MB depending on PDF size
│   │   │
│   │   ├─ Get all pages in parallel (Promise.all)
│   │   │   ├─ Page 1
│   │   │   ├─ Page 2 (processing in parallel)
│   │   │   ├─ Page 3 (processing in parallel)
│   │   │   └─ Page N (processing in parallel)
│   │   │
│   │   ├─ Process each page in parallel (Promise.all)
│   │   │   ├─ Convert to image at initial scale
│   │   │   ├─ Scan for barcodes/QR codes
│   │   │   ├─ If not found: retry with rotation
│   │   │   ├─ If still not found: retry with higher scale
│   │   │   └─ Continue until codes found or scales exhausted
│   │   │
│   │   ├─ For each page result:
│   │   │   ├─ Write to CSV: [timestamp, type, message, file, page, scale, rotated, attempts]
│   │   │   └─ Log written immediately to disk
│   │   │
│   │   ├─ Move file to completed folder
│   │   │   └─ /primary-dir/file1.pdf → /primary-dir/completed/file1.pdf
│   │   │
│   │   ├─ Clear from memory
│   │   │   └─ PDFManager.clearFileFromMemory(fileName)
│   │   │
│   │   └─ Update UI (progress callback)
│   │       ├─ setBatchStats({ processedFiles: +1 })
│   │       ├─ setBatchStats({ completedFiles: +1 })
│   │       └─ setBatchStats({ currentFileName: "..." })
│   │
│   ├─ Log batch completion
│   │   └─ Write to CSV: Batch N Complete
│   │
│   └─ Delay 1 second
│       └─ Sleep to prevent resource saturation
│
├─ All batches complete
│   └─ Total files processed: 100 (as example)
│
└─ Close logger
    └─ Final stats written to CSV
```

## Memory Usage Timeline

```
Memory (MB)
│
100├────────────────────────────────────────────────────────
   │                ┌─────┐        ┌─────┐
 80├────────────────┤     └────────┤     └────────────────
   │                ▲ File 1       │ File 2
 60├────────────────┼────────────────────────────────────
   │                │              │
 40├────────────────┼────────────────────────────────────
   │  Libraries     │ Processing   │ Processing
 20├────────────────┼────────────────────────────────────
   │                │              │
  0└────────────────┴────────────────────────────────────
    Start  0:10  0:20  0:30  0:40  0:50  1:00

Key:
- Base (20MB): PDF.js, zxing, canvas libraries
- Peak (100MB): When processing a file (1 file at a time)
- Between files: Drops back to base (file cleared)
- Pattern: Sawtooth (same height for each file)
- Total 100 files: Always looks like this (constant pattern)
```

## Parallel vs Sequential Execution

### Page Processing (Parallel)
```
PDF File with 5 Pages:
┌─────────────────────────────────────────────┐
│ Load PDF                                     │
└──────────────┬──────────────────────────────┘
               │
               ├─ Get Page 1
               ├─ Get Page 2
               ├─ Get Page 3
               ├─ Get Page 4
               └─ Get Page 5
               │
               ├──────────────────────────────┐
               │  Promise.all (parallel)      │
               │                              │
               ├─ Process Page 1 ──────────┐  │
               ├─ Process Page 2 ──────────┤  │
               ├─ Process Page 3 ──────────┼──┤ Wait
               ├─ Process Page 4 ──────────┤  │
               └─ Process Page 5 ──────────┘  │
               │                              │
               └──────────────────────────────┘
               │
               └─ All pages complete (parallel saved time!)

Time: 1 page (5-10s) × 5 pages = 5-10s total (not 25-50s)
```

### File Processing (Sequential)
```
5 Files in Batch:
┌─────────────────────────────────────────┐
│ File 1 ────────────────────┐            │
│                            └─ 30s       │
│                                         │
│ File 2 ────────────────────┐            │
│                            └─ 30s       │
│                                         │
│ File 3 ────────────────────┐            │
│                            └─ 30s       │
│                                         │
│ File 4 ────────────────────┐            │
│                            └─ 30s       │
│                                         │
│ File 5 ────────────────────┐            │
│                            └─ 30s       │
│                                         │
└─────────────────────────────────────────┘
Total: 5 × 30s = 150s (2.5 minutes)

Each file gets 100% of processing power
Memory never exceeds: 1 file at a time
```

## Component Interaction

### App.jsx ↔ ElectronBatchProcessor

```
React State:
{
  primaryDir: "/Users/.../batch-processing",
  isProcessing: true,
  batchStats: {
    totalFiles: 100,
    processedFiles: 45,
    completedFiles: 42,
    errorFiles: 3,
    currentBatch: 9,
    currentFileInBatch: 5,
    currentFileName: "document45.pdf"
  }
}

Progress Callback (from processor):
{
  batchNumber: 9,
  currentFile: 5,
  totalInBatch: 5,
  fileName: "document45.pdf",
  success: true
}

State Update:
setBatchStats(prev => ({
  ...prev,
  processedFiles: prev.processedFiles + 1,  // 45 → 46
  completedFiles: prev.completedFiles + 1,  // 42 → 43
  currentFileName: "document46.pdf"
}))
```

## Logging Flow

```
Page Processing → Event Logged
       │                │
       ├─ Scale change  │
       ├─ Rotation used │
       ├─ Codes found   │
       ├─ Error         │
       └─ Complete      │
                        │
                        ▼
                    Log Object
                {
                  type: "success",
                  message: "Found 3 QR codes",
                  fileName: "doc.pdf",
                  pageNumber: 1,
                  scale: 3,
                  rotated: false,
                  attemptCount: 1,
                  timestamp: 1704000000000
                }
                        │
                        ▼
            ElectronFileLogger.log()
                        │
                        ▼
            CSV Escape & Format
            "2024-01-27T10:30:45Z,success,Found 3 QR codes,doc.pdf,1,3,false,1"
                        │
                        ▼
        Append to CSV File (on disk)
        /primary-dir/logs/batch-*.csv
```

## Key Design Decisions

### 1. Counter-Only State (No Logs in Memory)
```
❌ Old Way:
const [logs, setLogs] = useState([]);  // Could be 1000s of entries!
logs.push({...})                       // Growing every page!

✓ New Way:
const [batchStats, setBatchStats] = useState({
  processedFiles: 0,  // Just counters
  completedFiles: 0,  // Small numbers
  errorFiles: 0       // Always < 10
});
// Memory: 200 bytes (not MB!)
```

### 2. CSV on Disk (Not In-App Logging)
```
❌ Old Way:
Logger component renders 1000+ entries
React re-renders on every log
Performance degrades with more logs

✓ New Way:
Logs written directly to CSV file
Zero React overhead
Can process 1000s of files
Open CSV in Excel/terminal to view
```

### 3. Parallel Pages, Sequential Files
```
✓ Parallel pages:
- Process all pages at once
- Faster per file (2-3x speed)
- Safe: pages are independent

✓ Sequential files:
- Process one file at a time
- Predictable memory usage
- More reliable

❌ Parallel files:
- Would use too much memory
- Too many PDFs in RAM at once
- Unpredictable performance
```

### 4. Single Batch Processor Instance
```
One processor per batch session
Reused across all 20+ batches
Clears file from memory after each one
Creates new batch log marker in CSV

Benefits:
- Consistent state
- Single logger
- Ordered results
```

## Error Handling Flow

```
Processing → Error Occurs
     │            │
     │            ├─ File read error
     │            ├─ PDF parsing error
     │            ├─ Image processing error
     │            └─ Code scan error
     │            │
     │            ▼
     │        Logger.log({
     │          type: "error",
     │          message: "..."
     │        })
     │            │
     │            ▼
     │        CSV line written
     │            │
     │            ▼
     │        batchResults.push({
     │          fileName: "doc.pdf",
     │          success: false,
     │          error: "message"
     │        })
     │            │
     │            ▼
     │        setBatchStats({
     │          errorFiles: +1
     │        })
     │            │
     │            ▼
     │        File stays in source directory
     │        (NOT moved to /completed)
     │            │
     │            ▼
     └────── Batch continues with next file
```

## Summary

**Core Architecture:**
- React UI (counters only, no logs)
- Electron main process (IPC handlers)
- ElectronBatchProcessor (orchestration)
- ElectronFileLogger (CSV disk logging)
- PDFManager (page processing)

**Data Flow:**
- User selects directory
- Processor reads PDFs
- Each file processed (pages in parallel)
- Results logged to CSV
- Files moved to /completed
- Progress reported via callbacks
- UI updates counters only

**Memory Pattern:**
- Constant peak: 100-150MB
- Pattern: Sawtooth (same for each file)
- Scales: Doesn't increase with more files
- Logs: On disk, not in memory

**Performance:**
- Parallel pages: 2-3x faster per file
- Sequential files: Predictable, safe
- CSV logging: Fast, minimal overhead
- Directory I/O: Atomic move operations
