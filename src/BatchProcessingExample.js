/**
 * BatchProcessingExample - Shows how to use the new batch processing system
 *
 * Features implemented:
 * 1. FileLogger - Stores logs to disk instead of memory
 * 2. BatchProcessor - Processes files from directory in batches of 5
 * 3. Memory management - Clears files from memory after processing
 * 4. File movement - Processed files moved to a separate folder
 */

import { FileLogger, createFileLogger } from "./FileLogger";
import { BatchProcessor, createBatchProcessor } from "./BatchProcessor";
import { PDFManager } from "./PDFManager";
import path from "path";

/**
 * Example 1: Using FileLogger standalone
 */
export async function exampleFileLogger() {
  const logger = createFileLogger();
  await logger.initialize();

  logger.log({
    type: "info",
    message: "Starting batch processing",
    fileName: "document.pdf",
  });

  logger.log({
    type: "success",
    message: "Found 3 QR codes",
    fileName: "document.pdf",
    pageNumber: 1,
    scale: 3,
  });

  logger.logBatchComplete(1, 5, "/path/to/processed");

  const logFilePath = await logger.close();
  console.log(`Logs saved to: ${logFilePath}`);
}

/**
 * Example 2: Using BatchProcessor for directory-based batch processing
 */
export async function exampleBatchProcessor() {
  // Set up directories
  const sourceDir = "/input/pdfs";
  const processedDir = "/output/processed";

  // Create batch processor
  const processor = createBatchProcessor(sourceDir, processedDir, {
    initialScale: 3,
    maxScale: 9,
    minScale: 1,
    enableRotation: true,
    // Add your structure if available
  });

  // Set up file logger
  const logger = createFileLogger();
  await logger.initialize();
  processor.setFileLogger(logger);

  // Process all files in batches of 5
  const results = await processor.processBatches((logEntry) => {
    logger.log(logEntry);
  });

  // Results contain success/failure status for each file
  console.log(`Processed ${results.length} files`);

  await logger.close();
}

/**
 * Example 3: Manual batch processing with memory management
 */
export async function exampleManualBatching() {
  const sourceDir = "/input/pdfs";
  const processedDir = "/output/processed";

  const logger = createFileLogger();
  await logger.initialize();

  try {
    // Get files from source
    const fs = await import("fs/promises");
    const files = await fs.readdir(sourceDir);
    const pdfFiles = files.filter((f) => f.toLowerCase().endsWith(".pdf"));

    // Process in batches of 5
    for (let i = 0; i < pdfFiles.length; i += 5) {
      const batch = pdfFiles.slice(i, i + 5);
      const batchNumber = Math.floor(i / 5) + 1;

      logger.log({
        type: "info",
        message: `Processing batch ${batchNumber}`,
      });

      // Create a new PDFManager instance for better memory isolation
      const manager = new PDFManager({
        initialScale: 3,
        maxScale: 9,
        minScale: 1,
      });

      for (const fileName of batch) {
        try {
          const filePath = path.join(sourceDir, fileName);

          // Read file as buffer
          const buffer = await fs.readFile(filePath);
          const file = new File([buffer], fileName, {
            type: "application/pdf",
          });

          // Process WITHOUT storing in memory (storeInMemory = false)
          const result = await manager.processFile(
            file,
            null,
            (logEntry) => logger.log(logEntry),
            false // Don't store in memory
          );

          logger.log({
            type: "success",
            message: `Completed: ${result.totalPages} pages, ${result.results ? Object.keys(result.results).length : 0} results`,
            fileName,
          });

          // Move file to processed directory
          const destPath = path.join(processedDir, fileName);
          await fs.rename(filePath, destPath);

          logger.log({
            type: "info",
            message: `Moved to processed folder`,
            fileName,
          });
        } catch (err) {
          logger.log({
            type: "error",
            message: `Failed to process: ${err.message}`,
            fileName,
          });
        }
      }

      // Memory is automatically freed when we exit this block
      logger.logBatchComplete(batchNumber, batch.length, processedDir);
    }
  } finally {
    await logger.close();
  }
}

/**
 * Example 4: Integration with Electron main process
 * (For use in main process, not renderer)
 */
export async function exampleElectronIntegration(sourceDir, outputDir) {
  const logger = createFileLogger(path.join(outputDir, "logs"));
  const processor = createBatchProcessor(sourceDir, outputDir, {
    initialScale: 3,
    maxScale: 9,
    minScale: 1,
    enableRotation: true,
  });

  processor.setFileLogger(logger);

  try {
    await logger.initialize();

    // Send status to renderer
    const results = await processor.processBatches((logEntry) => {
      // Could send to renderer process via ipc
      console.log(logEntry);
    });

    console.log(`Successfully processed ${results.length} files`);
    return results;
  } catch (err) {
    console.error("Batch processing failed:", err);
    throw err;
  } finally {
    await logger.close();
  }
}

/**
 * Key Features Summary:
 *
 * 1. FileLogger
 *    - Writes all logs to disk files with timestamps
 *    - Logs are organized in a logs directory
 *    - Includes session headers and batch completion markers
 *    - Memory efficient - no logs stored in RAM
 *
 * 2. BatchProcessor
 *    - Reads files directly from disk (no in-memory queue)
 *    - Processes exactly 5 files per batch
 *    - Automatically moves processed files to output directory
 *    - Includes batch completion logging
 *
 * 3. Memory Management (PDFManager updates)
 *    - New parameter: storeInMemory (default: true for backward compatibility)
 *    - Set to false for batch processing to avoid memory buildup
 *    - clearFileFromMemory(fileName) - Manually free file from memory
 *    - clearResults() - Clear all results
 *
 * 4. File Movement
 *    - Files automatically moved after successful processing
 *    - Supports custom output directory
 *    - Failed files remain in source directory
 *
 * Usage Pattern:
 * 1. Create FileLogger and initialize
 * 2. Create BatchProcessor with source and output directories
 * 3. Set logger on processor
 * 4. Call processBatches() to process all files
 * 5. Close logger when done
 */
