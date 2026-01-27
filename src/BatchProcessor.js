import path from "path";
import fs from "fs/promises";
import { PDFManager } from "./PDFManager";

/**
 * BatchProcessor - Processes PDF files in batches from a directory
 * Reads files directly from disk, processes 5 at a time, then moves them
 */
export class BatchProcessor {
  constructor(sourceDir, processedDir, config = {}) {
    this.sourceDir = sourceDir;
    this.processedDir = processedDir;
    this.config = config;
    this.fileLogger = null;
    this.currentBatch = [];
    this.batchSize = 5;
  }

  /**
   * Set the file logger for batch operations
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
   * Get PDF files from source directory
   */
  async getSourceFiles() {
    try {
      const files = await fs.readdir(this.sourceDir);
      const pdfFiles = files.filter((file) =>
        file.toLowerCase().endsWith(".pdf")
      );
      return pdfFiles.map((file) => ({
        name: file,
        path: path.join(this.sourceDir, file),
      }));
    } catch (err) {
      this.log({
        type: "error",
        message: `Failed to read source directory: ${err.message}`,
      });
      throw err;
    }
  }

  /**
   * Create processed directory if it doesn't exist
   */
  async ensureProcessedDir() {
    try {
      await fs.mkdir(this.processedDir, { recursive: true });
    } catch (err) {
      this.log({
        type: "error",
        message: `Failed to create processed directory: ${err.message}`,
      });
      throw err;
    }
  }

  /**
   * Move a file to the processed directory
   */
  async moveFile(filePath, fileName) {
    try {
      const destPath = path.join(this.processedDir, fileName);
      await fs.rename(filePath, destPath);
      return destPath;
    } catch (err) {
      this.log({
        type: "error",
        message: `Failed to move file ${fileName}: ${err.message}`,
      });
      throw err;
    }
  }

  /**
   * Process a single file and return File object for PDFManager
   */
  async processFile(filePath, fileName, onLog = null) {
    try {
      // Read file as buffer
      const buffer = await fs.readFile(filePath);

      // Create a File-like object
      const file = new File([buffer], fileName, { type: "application/pdf" });

      // Create PDFManager for this file
      const manager = new PDFManager(this.config);

      // Process the file
      const result = await manager.processFile(file, null, onLog);

      // Log completion
      this.log({
        type: "complete",
        message: `Completed processing`,
        fileName,
      });

      return result;
    } catch (err) {
      this.log({
        type: "error",
        message: `Failed to process file: ${err.message}`,
        fileName,
      });
      throw err;
    }
  }

  /**
   * Process a batch of files
   */
  async processBatch(batchNumber, files, onLog = null) {
    const batchResults = [];

    for (const fileInfo of files) {
      try {
        this.log({
          type: "start",
          message: `Processing file (${files.indexOf(fileInfo) + 1}/${files.length})`,
          fileName: fileInfo.name,
        });

        const result = await this.processFile(fileInfo.path, fileInfo.name, onLog);
        batchResults.push({ fileName: fileInfo.name, result, success: true });

        // Move file to processed directory after successful processing
        const movedPath = await this.moveFile(fileInfo.path, fileInfo.name);
        this.log({
          type: "info",
          message: `Moved to processed folder`,
          fileName: fileInfo.name,
        });
      } catch (err) {
        batchResults.push({
          fileName: fileInfo.name,
          result: null,
          success: false,
          error: err.message,
        });
      }
    }

    // Log batch completion
    const processedDirDisplay = this.processedDir;
    if (this.fileLogger) {
      this.fileLogger.logBatchComplete(
        batchNumber,
        batchResults.length,
        processedDirDisplay
      );
    }

    return batchResults;
  }

  /**
   * Process all files in batches of 5
   */
  async processBatches(onLog = null) {
    try {
      // Ensure processed directory exists
      await this.ensureProcessedDir();

      // Get all source files
      const sourceFiles = await this.getSourceFiles();

      if (sourceFiles.length === 0) {
        this.log({
          type: "info",
          message: `No PDF files found in source directory`,
        });
        return [];
      }

      this.log({
        type: "info",
        message: `Found ${sourceFiles.length} PDF files to process`,
      });

      const allResults = [];
      let batchNumber = 1;

      // Process in batches
      for (let i = 0; i < sourceFiles.length; i += this.batchSize) {
        const batch = sourceFiles.slice(i, i + this.batchSize);

        this.log({
          type: "info",
          message: `Starting batch ${batchNumber} (${batch.length} files)`,
        });

        const batchResults = await this.processBatch(
          batchNumber,
          batch,
          onLog
        );
        allResults.push(...batchResults);

        batchNumber++;

        // Optional: Add delay between batches to prevent system overload
        if (i + this.batchSize < sourceFiles.length) {
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
export function createBatchProcessor(sourceDir, processedDir, config = {}) {
  return new BatchProcessor(sourceDir, processedDir, config);
}
