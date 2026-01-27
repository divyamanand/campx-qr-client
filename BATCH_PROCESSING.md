# Batch Processing System Documentation

## Overview

The batch processing system has been implemented with 4 key changes:

1. **File-based Logging** - Logs stored to disk instead of memory
2. **Batch Processing** - Process files in batches of 5 from a directory
3. **Memory Management** - Files are freed from memory after processing
4. **File Movement** - Processed files automatically moved to output directory

## New Classes

### FileLogger

Manages logging to disk files with timestamps.

```javascript
import { FileLogger, createFileLogger } from "./FileLogger";

// Create and initialize logger
const logger = createFileLogger();
await logger.initialize();

// Log entries
logger.log({
  type: "info",
  message: "Processing started",
  fileName: "document.pdf",
  pageNumber: 1,
  scale: 3,
  rotated: false,
  attemptCount: 2,
});

// Log batch completion
logger.logBatchComplete(1, 5, "/output/processed");

// Get log file path
const logPath = logger.getLogFilePath();

// Close logger and finalize
await logger.close();
```

**Log Entry Parameters:**
- `type`: "info", "success", "warning", "error", "retry", "start", "complete"
- `message`: String message
- `fileName`: Optional file name
- `pageNumber`: Optional page number
- `scale`: Optional scale value
- `rotated`: Optional boolean
- `attemptCount`: Optional attempt count
- `timestamp`: Optional timestamp (defaults to Date.now())

**Default Log Location:** `~/.config/[app-name]/logs/batch-process-[timestamp].log`

**Log File Format:**
```
================================================================================
Session Started: 2024-01-27T10:30:45.123Z
================================================================================
10:30:45.234 [START] [document.pdf] Processing file (1/5)
10:30:46.567 [INFO] [document.pdf:1] Converting page to image (@3x)
10:30:48.891 [SUCCESS] [document.pdf:1] Found 3 code(s): QR_CODE, CODE_128 (@3x)
================================================================================
Batch 1 Complete
Files Processed: 5
Moved To: /output/processed
================================================================================
```

### BatchProcessor

Processes PDF files from a directory in batches of 5.

```javascript
import { BatchProcessor, createBatchProcessor } from "./BatchProcessor";

// Create processor
const processor = createBatchProcessor(
  "/input/pdfs",
  "/output/processed",
  {
    initialScale: 3,
    maxScale: 9,
    minScale: 1,
    enableRotation: true,
    structure: null, // Optional structure definition
  }
);

// Attach logger
const logger = createFileLogger();
await logger.initialize();
processor.setFileLogger(logger);

// Process all files in batches of 5
const results = await processor.processBatches((logEntry) => {
  logger.log(logEntry);
});

// Results array
// [
//   { fileName: "file1.pdf", result: {...}, success: true },
//   { fileName: "file2.pdf", result: {...}, success: true },
//   { fileName: "file3.pdf", error: "...", success: false },
//   ...
// ]

await logger.close();
```

**Methods:**
- `setFileLogger(logger)` - Attach FileLogger instance
- `getSourceFiles()` - Get list of PDF files from source directory
- `processBatch(batchNumber, files, onLog)` - Process single batch
- `processBatches(onLog)` - Process all files in batches of 5

**Processing Flow:**
1. Read all PDF files from source directory
2. Process files in batches of 5
3. After each batch completes:
   - Log batch completion
   - Delay 1 second before next batch
4. Move successful files to output directory
5. Keep failed files in source for manual inspection

## PDFManager Updates

### New Parameter: `storeInMemory`

The `processFile()` method now accepts a 4th parameter:

```javascript
// Store in memory (backward compatible - default behavior)
const result = await manager.processFile(pdfFile, onPageComplete, onLog);

// Don't store in memory (for batch processing)
const result = await manager.processFile(pdfFile, onPageComplete, onLog, false);
```

When `storeInMemory = false`:
- Results are returned but NOT stored in `this.allPdfFiles`
- Memory is freed immediately after processing
- Reduces memory footprint for large batches

### New Method: `clearFileFromMemory(fileName)`

Manually clear a file from memory:

```javascript
manager.processFile(pdfFile, onPageComplete, onLog);
// ... later ...
manager.clearFileFromMemory(pdfFile.name);
```

### Updated Method: `processFiles()`

Now supports memory cleanup:

```javascript
// Process multiple files and clear memory after each
await manager.processFiles(
  pdfFiles,
  onFileComplete,
  onPageComplete,
  true // Clear memory after each file
);
```

## Integration Examples

### Example 1: Web App Batch Processing

```javascript
// In App.jsx
const processBatch = async (batchDirectory) => {
  const processor = createBatchProcessor(
    batchDirectory,
    path.join(batchDirectory, "processed"),
    { initialScale: 3, maxScale: 9 }
  );

  const logger = createFileLogger();
  await logger.initialize();
  processor.setFileLogger(logger);

  try {
    const results = await processor.processBatches((logEntry) => {
      addLog(logEntry);
    });
    return results;
  } finally {
    const logPath = await logger.close();
    console.log(`Logs saved to: ${logPath}`);
  }
};
```

### Example 2: Electron Main Process

```javascript
// In main.js
ipcMain.handle("process-batch", async (event, sourceDir) => {
  const processor = createBatchProcessor(
    sourceDir,
    path.join(sourceDir, "processed"),
    config
  );

  const logger = createFileLogger(path.join(sourceDir, "logs"));
  await logger.initialize();
  processor.setFileLogger(logger);

  try {
    const results = await processor.processBatches((logEntry) => {
      event.sender.send("batch-log", logEntry);
    });
    return { success: true, results };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await logger.close();
  }
});
```

### Example 3: Manual Batch Processing

```javascript
const processFilesManually = async () => {
  const logger = createFileLogger();
  await logger.initialize();

  try {
    const sourceDir = "/input/pdfs";
    const files = await fs.readdir(sourceDir);
    const pdfFiles = files.filter(f => f.endsWith(".pdf"));

    // Process in batches of 5
    for (let i = 0; i < pdfFiles.length; i += 5) {
      const batch = pdfFiles.slice(i, i + 5);
      const batchNum = Math.floor(i / 5) + 1;

      logger.log({
        type: "info",
        message: `Starting batch ${batchNum}`,
      });

      // Create fresh manager for batch
      const manager = new PDFManager(config);

      for (const fileName of batch) {
        const result = await manager.processFile(
          file,
          null,
          (log) => logger.log(log),
          false // Don't store in memory
        );

        // Move file
        await fs.rename(
          path.join(sourceDir, fileName),
          path.join(sourceDir, "processed", fileName)
        );
      }

      logger.logBatchComplete(batchNum, batch.length, sourceDir + "/processed");
    }
  } finally {
    await logger.close();
  }
};
```

## Memory Usage Comparison

### Before (In-Memory Logging):
```
5 PDFs processed:
- App state stores all logs in memory: ~100KB
- PDFManager stores all results: ~500KB
- Total: ~600KB
- Scales poorly with 100+ files
```

### After (File-Based with Batch Processing):
```
5 PDFs per batch processed:
- App state: Logs written to disk (~50KB disk file)
- PDFManager: Results freed after each file: ~0KB (after processing)
- Total memory: ~100KB
- Constant memory usage regardless of file count
```

## File Organization

```
/input
  ├── pdf1.pdf
  ├── pdf2.pdf
  └── ...

/output
  ├── logs/
  │   ├── batch-process-2024-01-27T10-30-45-123Z.log
  │   └── batch-process-2024-01-27T11-45-30-456Z.log
  └── processed/
      ├── pdf1.pdf (moved after successful processing)
      └── pdf2.pdf
```

## Configuration

Default PDFManager config:
```javascript
{
  initialScale: 3,        // Starting scale
  maxScale: 9,           // Maximum scale to try
  minScale: 1,           // Minimum scale to try
  enableRotation: true,  // Try rotating images
  rotationDegrees: 180,  // Rotation angle
  structure: null        // Optional structure definition
}
```

## Error Handling

Files that fail processing:
1. Remain in source directory
2. Are logged with error details
3. Are NOT moved to processed directory
4. Can be retried manually

Check logs for detailed error information:
```javascript
const logger = createFileLogger();
await logger.initialize();
// ... processing ...
const logPath = logger.getLogFilePath();
// Read logPath to see detailed errors
```

## Performance Notes

- **Batch Size**: 5 files per batch (configurable in BatchProcessor)
- **Inter-batch Delay**: 1 second between batches
- **Memory Peak**: Single file processing memory (allows for large PDFs)
- **Disk I/O**: All logs written incrementally (efficient)
- **File Movement**: Atomic rename operations (fast)

## Troubleshooting

### Log Files Not Created
- Ensure logs directory exists or app has create permissions
- Check `app.getPath("userData")` is accessible

### Files Not Moving
- Verify destination directory has write permissions
- Check source and destination are on same filesystem (for atomic rename)

### Memory Still High
- Ensure `storeInMemory = false` when creating processor
- Call `clearFileFromMemory()` between batches if manually processing
- Create new PDFManager instance for each batch

### Processing Slow
- Reduce `initialScale` if OCR-heavy PDFs
- Increase batch delay with `setTimeout` between batches
- Check disk I/O is not saturated

## API Reference

### FileLogger
- `constructor(logsDir)` - Create logger
- `initialize()` - Setup and create log file
- `log(logEntry)` - Write log entry
- `logBatchComplete(batchNumber, filesProcessed, movedTo)` - Batch completion marker
- `close()` - Finalize and close log file
- `getLogFilePath()` - Get current log file path

### BatchProcessor
- `constructor(sourceDir, processedDir, config)` - Create processor
- `setFileLogger(logger)` - Attach logger
- `getSourceFiles()` - Get PDF files from source
- `processBatch(batchNumber, files, onLog)` - Process single batch
- `processBatches(onLog)` - Process all files
- `ensureProcessedDir()` - Create processed directory
- `moveFile(filePath, fileName)` - Move file

### PDFManager (Updated)
- `processFile(pdfFile, onPageComplete, onLog, storeInMemory)` - Process file
- `processFiles(pdfFiles, onFileComplete, onPageComplete, clearMemoryAfterFile)` - Process multiple
- `clearFileFromMemory(fileName)` - Clear specific file
- `clearResults()` - Clear all results

## Migration Guide

### Old Code (In-Memory):
```javascript
const manager = new PDFManager(config);
const result = await manager.processFile(file, onProgress, onLog);
// Results stored in manager.allPdfFiles
```

### New Code (Batch Processing):
```javascript
const processor = createBatchProcessor(sourceDir, processedDir, config);
const logger = createFileLogger();
await logger.initialize();
processor.setFileLogger(logger);
const results = await processor.processBatches(onLog);
await logger.close();
// Files moved, logs on disk, memory freed
```

## Backward Compatibility

All changes are **backward compatible**:
- `storeInMemory` defaults to `true` (old behavior)
- Existing code works unchanged
- New batch processing is opt-in
- Old FileLogger and BatchProcessor are new additions
