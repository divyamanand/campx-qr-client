import { ScanImage } from "./ScanImage";
import { PDFToImage } from "./PDFToImage";
import { rotateImage } from "./imageUtils";

/**
 * Default configuration for PDFManager
 */
const DEFAULT_CONFIG = {
  initialScale: 3,
  maxScale: 9,
  minScale: 1,
  enableRotation: true,
  rotationDegrees: 180,
  structure: null, // Structure definition for expected codes per page
};

/**
 * PDFManager - Orchestrates PDF processing with intelligent retry logic
 *
 * Responsibilities:
 * - Process PDF files page by page
 * - Coordinate between PDFToImage and ScanImage
 * - Implement retry logic with scale adjustments
 * - Track results in structured data
 */
export class PDFManager {
  /**
   * @param {Object} config - Configuration options
   * @param {number} config.initialScale - Starting scale for rendering (default: 3)
   * @param {number} config.maxScale - Maximum scale to try (default: 9)
   * @param {number} config.minScale - Minimum scale to try (default: 1)
   * @param {boolean} config.enableRotation - Whether to try rotation on failure (default: true)
   * @param {number} config.rotationDegrees - Degrees to rotate on retry (default: 180)
   * @param {Object} config.structure - Structure definition with expected codes per page
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scanner = new ScanImage();
    this.pdfToImage = new PDFToImage();

    // Results storage: { fileName: { structureId, pages: { pageNumber: { result, scale, rotated } } } }
    this.allPdfFiles = {};
  }

  /**
   * Get expected codes for a specific page from structure
   * @param {number} pageNumber - Page number to get expected codes for
   * @returns {Object|null} - { totalCodeCount, formats } or null if no structure/page defined
   */
  getPageExpectation(pageNumber) {
    if (!this.config.structure || !this.config.structure.format) {
      return null;
    }

    const pageFormat = this.config.structure.format.find(
      (p) => p.pageNumber === pageNumber
    );

    return pageFormat || null;
  }

  /**
   * Check if scan result meets page expectations
   * @param {Array} codes - Array of detected codes
   * @param {Object} expectation - Expected codes { totalCodeCount, formats: [{code, count}] }
   * @returns {Object} - { met, foundCount, expectedCount, missingFormats }
   */
  checkPageExpectation(codes, expectation) {
    if (!expectation) {
      // No expectation - any result is acceptable
      return { met: true, foundCount: codes.length, expectedCount: 0, missingFormats: [] };
    }

    // If totalCodeCount is 0, page expects no codes
    if (expectation.totalCodeCount === 0) {
      return { met: true, foundCount: codes.length, expectedCount: 0, missingFormats: [] };
    }

    // Count codes by format
    const foundCounts = {};
    for (const code of codes) {
      foundCounts[code.format] = (foundCounts[code.format] || 0) + 1;
    }

    // Check each expected format
    const missingFormats = [];
    for (const expected of expectation.formats) {
      const foundCount = foundCounts[expected.code] || 0;
      if (foundCount < expected.count) {
        missingFormats.push(`${expected.code} (found ${foundCount}/${expected.count})`);
      }
    }

    return {
      met: missingFormats.length === 0 && codes.length >= expectation.totalCodeCount,
      foundCount: codes.length,
      expectedCount: expectation.totalCodeCount,
      missingFormats,
    };
  }

  /**
   * Generate the sequence of scales to try in the retry loop
   * Pattern: initial, initial+1, initial-1, initial+2, initial-2, ...
   * @returns {number[]} Array of scales to try
   */
  generateScaleSequence() {
    const { initialScale, maxScale, minScale } = this.config;
    const scales = [initialScale];
    const seen = new Set([initialScale]);

    let offset = 1;
    while (true) {
      const higher = initialScale + offset;
      const lower = initialScale - offset;

      let addedAny = false;

      if (higher <= maxScale && !seen.has(higher)) {
        scales.push(higher);
        seen.add(higher);
        addedAny = true;
      }

      if (lower >= minScale && !seen.has(lower)) {
        scales.push(lower);
        seen.add(lower);
        addedAny = true;
      }

      // Stop if we've exceeded both bounds
      if (higher > maxScale && lower < minScale) break;
      if (!addedAny && higher > maxScale) break;

      offset++;
    }

    return scales;
  }

  /**
   * Try scanning with rotation
   * @param {Blob} blob - Image blob to scan
   * @returns {Promise<{result: ScanResult, rotated: boolean}>}
   */
  async tryScanWithRotation(blob) {
    // First try: scan original
    let result = await this.scanner.scan(blob);
    if (result.success) {
      return { result, rotated: false };
    }

    // Second try: rotate and scan
    if (this.config.enableRotation) {
      const rotatedBlob = await rotateImage(blob, this.config.rotationDegrees);
      result = await this.scanner.scan(rotatedBlob);
      if (result.success) {
        return { result, rotated: true };
      }
    }

    return { result, rotated: false };
  }

  /**
   * Process a single page with retry logic based on structure expectations
   * Retries until expected codes are found or scale boundaries exhausted
   * @param {PDFPageProxy} page - PDF page to process
   * @param {number} pageNumber - Page number
   * @param {string} fileName - File name for tracking
   * @param {Function} onLog - Optional callback for logging events
   * @returns {Promise<PageResult>}
   */
  async processPage(page, pageNumber, fileName, onLog = null) {
    const scaleSequence = this.generateScaleSequence();
    const attemptedScales = new Set();

    // Get page expectation from structure
    const expectation = this.getPageExpectation(pageNumber);

    // Track best result so far
    let bestResult = null;
    let bestScale = null;
    let bestRotated = false;

    const log = (type, message, extra = {}) => {
      if (onLog) {
        onLog({
          type,
          message,
          fileName,
          pageNumber,
          attemptCount: attemptedScales.size,
          ...extra,
        });
      }
    };

    // Log expectation info
    if (expectation) {
      if (expectation.totalCodeCount === 0) {
        log("info", "Starting page scan - expecting no codes", { scale: this.config.initialScale });
      } else {
        const expectedFormats = expectation.formats.map((f) => `${f.code}(${f.count})`).join(", ");
        log("info", `Starting page scan - expecting ${expectation.totalCodeCount} code(s): ${expectedFormats}`, { scale: this.config.initialScale });
      }
    } else {
      log("info", "Starting page scan - no structure defined", { scale: this.config.initialScale });
    }

    // Early exit if page expects no codes
    if (expectation && expectation.totalCodeCount === 0) {
      log("success", "Page expects no codes - skipping scan", { scale: this.config.initialScale });
      return {
        success: true,
        result: { success: true, codes: [], error: null },
        scale: this.config.initialScale,
        rotated: false,
        attempts: 0,
        skipped: true,
      };
    }

    for (const scale of scaleSequence) {
      // Skip if already attempted this scale
      if (attemptedScales.has(scale)) continue;
      attemptedScales.add(scale);

      if (attemptedScales.size > 1) {
        log("retry", `Retrying with scale change`, { scale, attemptCount: attemptedScales.size });
      }

      try {
        // Convert page to image at current scale
        log("info", "Converting page to image", { scale });
        const imageResult = await this.pdfToImage.convertPageToImage(page, scale);

        // First try: scan original
        log("info", "Scanning image", { scale });
        let result = await this.scanner.scan(imageResult.blob);
        let rotated = false;

        // If no success on original, try rotated
        if (!result.success && this.config.enableRotation) {
          log("retry", "Trying with rotated image", { scale, rotated: true });
          const rotatedBlob = await rotateImage(imageResult.blob, this.config.rotationDegrees);
          result = await this.scanner.scan(rotatedBlob);
          rotated = true;
        }

        if (result.success) {
          const formatsFound = result.codes.map((c) => c.format).join(", ");

          // Track best result (most codes found)
          if (!bestResult || result.codes.length > bestResult.codes.length) {
            bestResult = result;
            bestScale = scale;
            bestRotated = rotated;
          }

          // Check against expectation
          const check = this.checkPageExpectation(result.codes, expectation);

          if (check.met) {
            // Expectation met - early exit
            log("success", `Found ${result.codes.length} code(s): ${formatsFound}`, { scale, rotated });
            return {
              success: true,
              result,
              scale,
              rotated,
              attempts: attemptedScales.size,
            };
          } else {
            // Some codes found but expectation not met
            log("warning", `Found ${check.foundCount}/${check.expectedCount} code(s) [${formatsFound}], missing: ${check.missingFormats.join(", ")}`, { scale, rotated });
          }
        } else {
          log("warning", "No codes found at this scale", { scale });
        }
      } catch (err) {
        log("error", `Error: ${err.message}`, { scale });
        console.warn(`Error processing page ${pageNumber} at scale ${scale}:`, err);
        // Continue to next scale on error
      }
    }

    // All scales exhausted
    if (bestResult) {
      // Return best result even if expectation not fully met
      const formatsFound = bestResult.codes.map((c) => c.format).join(", ");
      log("warning", `Exhausted all scales. Best result: ${bestResult.codes.length} code(s) [${formatsFound}]`, {
        scale: bestScale,
        rotated: bestRotated,
        attemptCount: attemptedScales.size
      });
      return {
        success: true,
        result: bestResult,
        scale: bestScale,
        rotated: bestRotated,
        attempts: attemptedScales.size,
        partial: true, // Indicates expectation not fully met
      };
    }

    // All attempts failed - no codes found at all
    log("error", "All retry attempts failed - no codes found", { attemptCount: attemptedScales.size });
    return {
      success: false,
      result: {
        success: false,
        codes: [],
        error: "ALL_RETRY_ATTEMPTS_FAILED",
      },
      scale: this.config.initialScale,
      rotated: false,
      attempts: attemptedScales.size,
    };
  }

  /**
   * Process an entire PDF file
   * @param {File} pdfFile - The PDF file to process
   * @param {Function} onPageComplete - Optional callback for progress updates
   * @param {Function} onLog - Optional callback for logging events
   * @param {boolean} storeInMemory - Store results in memory (default: true)
   * @returns {Promise<FileResult>}
   */
  async processFile(pdfFile, onPageComplete = null, onLog = null, storeInMemory = true) {
    const fileName = pdfFile.name;
    const structureId = this.config.structure?.structureID || null;

    // Initialize file entry with structureId only if storing in memory
    let fileResults = {};
    if (storeInMemory) {
      this.allPdfFiles[fileName] = {
        structureId,
        pages: {},
      };
    }

    const log = (type, message, extra = {}) => {
      if (onLog) {
        onLog({
          type,
          message,
          fileName,
          ...extra,
        });
      }
    };

    try {
      log("start", `Loading PDF document${structureId ? ` (Structure ID: ${structureId})` : ""}`);
      const pdf = await this.pdfToImage.loadDocument(pdfFile);
      const totalPages = pdf.numPages;
      log("info", `PDF loaded with ${totalPages} page(s)`);

      // Get all pages first
      const pagePromises = [];
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        pagePromises.push(
          pdf.getPage(pageNum).then((page) => ({
            pageNum,
            page,
          }))
        );
      }

      const pages = await Promise.all(pagePromises);

      // Process all pages in parallel
      const pageResultPromises = pages.map(({ pageNum, page }) =>
        this.processPage(page, pageNum, fileName, onLog).then((pageResult) => ({
          pageNum,
          pageResult,
        }))
      );

      const pageResults = await Promise.all(pageResultPromises);

      // Store results in order
      pageResults.forEach(({ pageNum, pageResult }) => {
        const pageData = {
          result: pageResult.result,
          scale: pageResult.scale,
          rotated: pageResult.rotated,
          success: pageResult.success,
          skipped: pageResult.skipped || false,
          partial: pageResult.partial || false,
        };

        // Store result in memory or in temp storage
        if (storeInMemory) {
          this.allPdfFiles[fileName].pages[pageNum] = pageData;
        } else {
          fileResults[pageNum] = pageData;
        }

        // Progress callback
        if (onPageComplete) {
          onPageComplete({
            fileName,
            pageNumber: pageNum,
            totalPages,
            pageResult,
          });
        }
      });

      log("complete", `Processing complete. ${totalPages} page(s) processed.`);

      const resultsToReturn = storeInMemory
        ? this.allPdfFiles[fileName].pages
        : fileResults;

      return {
        fileName,
        structureId,
        totalPages,
        results: resultsToReturn,
        success: true,
      };
    } catch (err) {
      log("error", `Failed to process: ${err.message}`);

      const resultsToReturn = storeInMemory
        ? this.allPdfFiles[fileName].pages
        : fileResults;

      return {
        fileName,
        structureId,
        totalPages: 0,
        results: resultsToReturn,
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Process multiple PDF files
   * @param {File[]} pdfFiles - Array of PDF files to process
   * @param {Function} onFileComplete - Optional callback when a file completes
   * @param {Function} onPageComplete - Optional callback for page progress
   * @param {boolean} clearMemoryAfterFile - Clear memory after each file (default: false)
   * @returns {Promise<Object>} - All results
   */
  async processFiles(pdfFiles, onFileComplete = null, onPageComplete = null, clearMemoryAfterFile = false) {
    for (const pdfFile of pdfFiles) {
      const fileResult = await this.processFile(pdfFile, onPageComplete);

      if (onFileComplete) {
        onFileComplete(fileResult);
      }

      // Clear memory after processing if requested
      if (clearMemoryAfterFile) {
        this.clearFileFromMemory(pdfFile.name);
      }
    }

    return this.getTheScanResults();
  }

  /**
   * Get all scan results
   * @returns {Object} - The allPdfFiles map with all results
   */
  getTheScanResults() {
    return this.allPdfFiles;
  }

  /**
   * Get results formatted for the existing App UI
   * @returns {Array} - Results in the format expected by FileCard component
   */
  getResultsForUI() {
    const uiResults = [];

    for (const [fileName, fileData] of Object.entries(this.allPdfFiles)) {
      const pages = fileData.pages || fileData; // Support both old and new format
      const fileResult = {
        name: fileName,
        structureId: fileData.structureId || null,
        results: [],
      };

      for (const [pageNum, pageData] of Object.entries(pages)) {
        // Skip if this is the structureId field (for backward compat)
        if (pageNum === "structureId" || pageNum === "pages") continue;

        const qrs = pageData.result?.success
          ? pageData.result.codes.map((code) => ({
              success: true,
              data: code.data,
              format: code.format,
              position: code.position,
              ct: 1,
            }))
          : [
              {
                success: false,
                data: null,
                format: null,
                ct: 0,
                error: pageData.result?.error || "UNKNOWN_ERROR",
              },
            ];

        fileResult.results.push({
          page: parseInt(pageNum),
          qrs,
          scale: pageData.scale,
          rotated: pageData.rotated,
          skipped: pageData.skipped || false,
          partial: pageData.partial || false,
        });
      }

      // Sort by page number
      fileResult.results.sort((a, b) => a.page - b.page);
      uiResults.push(fileResult);
    }

    return uiResults;
  }

  /**
   * Clear all stored results
   */
  clearResults() {
    this.allPdfFiles = {};
  }

  /**
   * Clear a specific file from memory to free up space
   * @param {string} fileName - Name of the file to clear
   */
  clearFileFromMemory(fileName) {
    if (this.allPdfFiles[fileName]) {
      delete this.allPdfFiles[fileName];
    }
  }

  /**
   * Get summary statistics
   * @returns {Object} - Summary of processing results
   */
  getSummary() {
    let totalFiles = 0;
    let totalPages = 0;
    let successfulPages = 0;
    let failedPages = 0;
    let skippedPages = 0;
    let partialPages = 0;
    let totalCodes = 0;

    for (const fileData of Object.values(this.allPdfFiles)) {
      totalFiles++;
      const pages = fileData.pages || fileData;
      for (const [key, pageData] of Object.entries(pages)) {
        if (key === "structureId" || key === "pages") continue;
        totalPages++;
        if (pageData.skipped) {
          skippedPages++;
          successfulPages++;
        } else if (pageData.success) {
          successfulPages++;
          if (pageData.partial) partialPages++;
          totalCodes += pageData.result?.codes?.length || 0;
        } else {
          failedPages++;
        }
      }
    }

    return {
      totalFiles,
      totalPages,
      successfulPages,
      failedPages,
      skippedPages,
      partialPages,
      totalCodes,
      successRate: totalPages > 0 ? (successfulPages / totalPages) * 100 : 0,
    };
  }
}

// Export a factory function for convenience
export function createPDFManager(config = {}) {
  return new PDFManager(config);
}
