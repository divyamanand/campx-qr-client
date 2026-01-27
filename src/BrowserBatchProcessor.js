/**
 * BrowserBatchProcessor - Browser-compatible batch processor
 * Works with files selected by user or provided via drag-and-drop
 */
export class BrowserBatchProcessor {
  constructor(config = {}) {
    this.config = config;
    this.fileLogger = null;
    this.batchSize = 5;
    this.currentBatch = [];
  }

  /**
   * Set the file logger
   */
  setFileLogger(logger) {
    this.fileLogger = logger;
  }

  /**
   * Log a message
   */
  log(logEntry) {
    if (this.fileLogger) {
      this.fileLogger.log(logEntry);
    }
    console.log(logEntry);
  }

  /**
   * Process a single file
   */
  async processFile(file, onLog = null, { PDFManager, structures }) {
    try {
      // Create PDFManager for this file
      const manager = new PDFManager({
        ...this.config,
        structure: this.config.structure || structures?.[0] || null,
      });

      // Process the file without storing in memory
      const result = await manager.processFile(file, null, onLog, false);

      this.log({
        type: "success",
        message: `Completed processing`,
        fileName: file.name,
      });

      return result;
    } catch (err) {
      this.log({
        type: "error",
        message: `Failed to process file: ${err.message}`,
        fileName: file.name,
      });
      throw err;
    }
  }

  /**
   * Process a batch of files
   */
  async processBatch(batchNumber, files, onLog = null, helpers = {}) {
    const batchResults = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        this.log({
          type: "start",
          message: `Processing file (${i + 1}/${files.length})`,
          fileName: file.name,
        });

        const result = await this.processFile(file, onLog, helpers);
        batchResults.push({ fileName: file.name, result, success: true });
      } catch (err) {
        batchResults.push({
          fileName: file.name,
          result: null,
          success: false,
          error: err.message,
        });
      }
    }

    // Log batch completion
    const processedCount = batchResults.filter((r) => r.success).length;
    if (this.fileLogger) {
      this.fileLogger.logBatchComplete(batchNumber, processedCount, "Processed");
    }

    return batchResults;
  }

  /**
   * Process files in batches
   */
  async processBatches(files, onLog = null, helpers = {}) {
    try {
      if (files.length === 0) {
        this.log({
          type: "info",
          message: `No files to process`,
        });
        return [];
      }

      // Filter for PDF files
      const pdfFiles = files.filter((f) => f.type === "application/pdf" || f.name.endsWith(".pdf"));

      if (pdfFiles.length === 0) {
        this.log({
          type: "error",
          message: `No PDF files found in selection (${files.length} files selected)`,
        });
        return [];
      }

      this.log({
        type: "info",
        message: `Found ${pdfFiles.length} PDF file(s) to process`,
      });

      const allResults = [];
      let batchNumber = 1;

      // Process in batches
      for (let i = 0; i < pdfFiles.length; i += this.batchSize) {
        const batch = pdfFiles.slice(i, i + this.batchSize);

        this.log({
          type: "info",
          message: `Starting batch ${batchNumber} (${batch.length} files)`,
        });

        const batchResults = await this.processBatch(batchNumber, batch, onLog, helpers);
        allResults.push(...batchResults);

        batchNumber++;

        // Optional: Add delay between batches
        if (i + this.batchSize < pdfFiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      this.log({
        type: "complete",
        message: `All batches processed. Total files: ${allResults.length}`,
      });

      return allResults;
    } catch (err) {
      this.log({
        type: "error",
        message: `Batch processing failed: ${err.message}`,
      });
      throw err;
    }
  }
}

/**
 * Factory function
 */
export function createBrowserBatchProcessor(config = {}) {
  return new BrowserBatchProcessor(config);
}
