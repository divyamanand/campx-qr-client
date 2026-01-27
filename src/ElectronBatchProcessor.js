/**
 * ElectronBatchProcessor - Batch processor for Electron with disk-based logging
 * Reads files from directory, processes in batches of 5
 * Stores logs as CSV, moves completed files to /completed folder
 * No logs stored in memory
 */
export class ElectronBatchProcessor {
  constructor(primaryDir, config = {}) {
    this.primaryDir = primaryDir;
    this.logsDir = `${primaryDir}/logs`;
    this.completedDir = `${primaryDir}/completed`;
    this.config = config;
    this.fileLogger = null;
    this.batchSize = 5;
  }

  /**
   * Set the file logger
   */
  setFileLogger(logger) {
    this.fileLogger = logger;
  }

  /**
   * Log a message (writes directly to disk)
   */
  async log(logEntry) {
    if (this.fileLogger) {
      await this.fileLogger.log(logEntry);
    }
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      const fs = window.electronAPI?.fs;
      if (!fs) {
        throw new Error("Electron File System API not available");
      }

      await fs.ensureDir(this.logsDir);
      await fs.ensureDir(this.completedDir);
    } catch (err) {
      await this.log({
        type: "error",
        message: `Failed to create directories: ${err.message}`,
      });
      throw err;
    }
  }

  /**
   * Get PDF files from primary directory
   */
  async getSourceFiles() {
    try {
      const fs = window.electronAPI?.fs;
      if (!fs) {
        throw new Error("Electron File System API not available");
      }

      const files = await fs.readdir(this.primaryDir);
      const pdfFiles = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

      return pdfFiles.map((f) => ({
        name: f,
        path: `${this.primaryDir}/${f}`,
      }));
    } catch (err) {
      await this.log({
        type: "error",
        message: `Failed to read source directory: ${err.message}`,
      });
      throw err;
    }
  }

  /**
   * Move file to completed directory
   */
  async moveFileToCompleted(fileName) {
    try {
      const fs = window.electronAPI?.fs;
      if (!fs) {
        throw new Error("Electron File System API not available");
      }

      const sourcePath = `${this.primaryDir}/${fileName}`;
      const destPath = `${this.completedDir}/${fileName}`;

      await fs.moveFile(sourcePath, destPath);

      await this.log({
        type: "info",
        message: `Moved to completed folder`,
        fileName,
      });

      return destPath;
    } catch (err) {
      await this.log({
        type: "error",
        message: `Failed to move file: ${err.message}`,
        fileName,
      });
      throw err;
    }
  }

  /**
   * Process a single file and return result
   */
  async processFile(filePath, fileName, onLog = null, { PDFManager, structures }) {
    try {
      const fs = window.electronAPI?.fs;
      if (!fs) {
        throw new Error("Electron File System API not available");
      }

      // Read file as buffer
      const buffer = await fs.readFile(filePath);

      // Create File object
      const file = new File([buffer], fileName, { type: "application/pdf" });

      // Create PDFManager
      const manager = new PDFManager({
        ...this.config,
        structure: this.config.structure || structures?.[0] || null,
      });

      // Process file WITHOUT storing in memory (crucial for constant memory usage)
      const result = await manager.processFile(
        file,
        null,
        async (logEntry) => {
          await this.log(logEntry);
          if (onLog) onLog(logEntry);
        },
        false // storeInMemory = false
      );

      // Immediately clear from memory
      manager.clearFileFromMemory(fileName);

      return result;
    } catch (err) {
      await this.log({
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
  async processBatch(batchNumber, files, onProgress = null, helpers = {}) {
    const batchResults = [];

    for (let i = 0; i < files.length; i++) {
      const fileInfo = files[i];

      try {
        await this.log({
          type: "start",
          message: `Processing file (${i + 1}/${files.length})`,
          fileName: fileInfo.name,
        });

        const result = await this.processFile(fileInfo.path, fileInfo.name, null, helpers);

        batchResults.push({
          fileName: fileInfo.name,
          result,
          success: true,
        });

        // Move to completed
        await this.moveFileToCompleted(fileInfo.name);

        // Progress callback
        if (onProgress) {
          onProgress({
            batchNumber,
            currentFile: i + 1,
            totalInBatch: files.length,
            fileName: fileInfo.name,
            success: true,
          });
        }
      } catch (err) {
        batchResults.push({
          fileName: fileInfo.name,
          result: null,
          success: false,
          error: err.message,
        });

        if (onProgress) {
          onProgress({
            batchNumber,
            currentFile: i + 1,
            totalInBatch: files.length,
            fileName: fileInfo.name,
            success: false,
            error: err.message,
          });
        }
      }
    }

    // Log batch completion
    const successCount = batchResults.filter((r) => r.success).length;
    await this.logBatchComplete(batchNumber, successCount, this.completedDir);

    return batchResults;
  }

  /**
   * Process all files in batches
   */
  async processBatches(onProgress = null, helpers = {}) {
    try {
      // Create required directories
      await this.ensureDirectories();

      // Get source files
      const sourceFiles = await this.getSourceFiles();

      if (sourceFiles.length === 0) {
        await this.log({
          type: "info",
          message: "No PDF files found in source directory",
        });
        return [];
      }

      await this.log({
        type: "info",
        message: `Found ${sourceFiles.length} PDF file(s) to process`,
      });

      const allResults = [];
      let batchNumber = 1;
      let totalProcessed = 0;

      // Process in batches
      for (let i = 0; i < sourceFiles.length; i += this.batchSize) {
        const batch = sourceFiles.slice(i, i + this.batchSize);

        await this.log({
          type: "info",
          message: `Starting batch ${batchNumber} (${batch.length} files)`,
        });

        const batchResults = await this.processBatch(batchNumber, batch, onProgress, helpers);
        allResults.push(...batchResults);

        totalProcessed += batchResults.filter((r) => r.success).length;

        batchNumber++;

        // Delay between batches
        if (i + this.batchSize < sourceFiles.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      await this.log({
        type: "complete",
        message: `All batches processed. Total files: ${allResults.length}, Successful: ${totalProcessed}`,
      });

      return allResults;
    } catch (err) {
      await this.log({
        type: "error",
        message: `Batch processing failed: ${err.message}`,
      });
      throw err;
    }
  }
}

export function createElectronBatchProcessor(primaryDir, config = {}) {
  return new ElectronBatchProcessor(primaryDir, config);
}
