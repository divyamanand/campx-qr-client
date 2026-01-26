import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";
import { ScanImage } from "./ScanImage";
import { ScanStrategy } from "./ScanStrategy";
import { rotateImage } from "./imageUtils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

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
 * - Load and render PDF pages at various scales
 * - Scan images for barcodes using ScanImage
 * - Implement retry logic with scale adjustments and rotation
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
    this.imageType = config.imageType ?? "image/png";
    this.imageQuality = config.imageQuality ?? 1;

    // Initialize scan strategy with logging
    this.scanStrategy = new ScanStrategy(this.scanner, {
      onLog: config.onStrategyLog || null,
      detectionScale: config.detectionScale || 1.5,
    });

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
   * Load a PDF document from a File
   * @param {File} pdfFile - The PDF file to load
   * @returns {Promise<PDFDocumentProxy>} - The loaded PDF document
   */
  async loadDocument(pdfFile) {
    const arrayBuffer = await pdfFile.arrayBuffer();
    return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  }

  /**
   * Render a PDF page to an image blob at a given scale
   * @param {PDFPageProxy} page - The PDF page to render
   * @param {number} scale - The scale factor for rendering
   * @returns {Promise<Blob>} - The rendered image blob
   */
  async renderPageToBlob(page, scale) {
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, this.imageType, this.imageQuality)
    );

    // Cleanup canvas
    canvas.width = canvas.height = 0;

    return blob;
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
   * Process a single page using optimized ROI-based strategy
   * Delegates to ScanStrategy for intelligent detection and retry logic
   * @param {PDFPageProxy} page - PDF page to process
   * @param {number} pageNumber - Page number
   * @param {string} fileName - File name for tracking
   * @param {Function} onLog - Optional callback for logging events
   * @returns {Promise<PageResult>}
   */
  async processPage(page, pageNumber, fileName, onLog = null) {
    // Get page expectation from structure
    const expectation = this.getPageExpectation(pageNumber);
    const requiredFormats = expectation?.formats?.map((f) => f.code) || [];

    const log = (type, message, extra = {}) => {
      if (onLog) {
        onLog({
          type,
          message,
          fileName,
          pageNumber,
          ...extra,
        });
      }
    };

    // Log expectation
    if (expectation?.totalCodeCount === 0) {
      log("info", `Page ${pageNumber} expects no codes - skipping`);
      return {
        success: true,
        result: { success: true, codes: [], error: null },
        scale: this.config.initialScale,
        rotated: false,
        attempts: 0,
        skipped: true,
      };
    }

    // Render page to initial scale
    log("info", `Rendering page ${pageNumber} at initial scale`);
    const imageBlob = await this.renderPageToBlob(page, this.config.initialScale);

    // Get image dimensions for ROI computation
    const imageMeta = {
      width: (await this.getBlobDimensions(imageBlob)).width,
      height: (await this.getBlobDimensions(imageBlob)).height,
      scale: this.config.initialScale,
    };

    // Use ScanStrategy for optimized processing
    const strategyResult = await this.scanStrategy.processPage(
      imageBlob,
      pageNumber,
      requiredFormats,
      imageMeta
    );

    // Transform strategy result to PDFManager format
    return {
      success: strategyResult.success,
      result: {
        success: strategyResult.success,
        codes: strategyResult.codes || [],
        error: strategyResult.error,
      },
      scale: this.config.initialScale,
      rotated: false,
      attempts: strategyResult.totalAttempts || 0,
      partial: !strategyResult.isComplete && strategyResult.success,
    };
  }

  /**
   * Get blob dimensions (width, height)
   */
  async getBlobDimensions(blob) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };

      img.src = url;
    });
  }

  /**
   * Process an entire PDF file
   * @param {File} pdfFile - The PDF file to process
   * @param {Function} onPageComplete - Optional callback for progress updates
   * @param {Function} onLog - Optional callback for logging events
   * @returns {Promise<FileResult>}
   */
  async processFile(pdfFile, onPageComplete = null, onLog = null) {
    const fileName = pdfFile.name;
    const structureId = this.config.structure?.structureID || null;

    // Initialize file entry with structureId
    this.allPdfFiles[fileName] = {
      structureId,
      pages: {},
    };

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
      const pdf = await this.loadDocument(pdfFile);
      const totalPages = pdf.numPages;
      log("info", `PDF loaded with ${totalPages} page(s)`);

      // Process pages in parallel batches of 5
      const BATCH_SIZE = 5;
      const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

      for (let batchStart = 0; batchStart < pageNumbers.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, pageNumbers.length);
        const batchPageNumbers = pageNumbers.slice(batchStart, batchEnd);

        log("info", `Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}: pages ${batchPageNumbers[0]}-${batchPageNumbers[batchPageNumbers.length - 1]}`);

        // Process all pages in batch in parallel
        const batchPromises = batchPageNumbers.map(async (pageNum) => {
          try {
            const page = await pdf.getPage(pageNum);
            const pageResult = await this.processPage(page, pageNum, fileName, onLog);

            // Store result in pages object
            this.allPdfFiles[fileName].pages[pageNum] = {
              result: pageResult.result,
              scale: pageResult.scale,
              rotated: pageResult.rotated,
              success: pageResult.success,
              skipped: pageResult.skipped || false,
              partial: pageResult.partial || false,
            };

            // Progress callback
            if (onPageComplete) {
              onPageComplete({
                fileName,
                pageNumber: pageNum,
                totalPages,
                pageResult,
              });
            }

            return {
              pageNum,
              success: true,
              pageResult,
            };
          } catch (err) {
            log("error", `Failed to process page ${pageNum}: ${err.message}`);

            // Store error result
            this.allPdfFiles[fileName].pages[pageNum] = {
              result: {
                success: false,
                codes: [],
                error: err.message,
              },
              scale: this.config.initialScale,
              rotated: false,
              success: false,
              skipped: false,
              partial: false,
            };

            if (onPageComplete) {
              onPageComplete({
                fileName,
                pageNumber: pageNum,
                totalPages,
                pageResult: {
                  success: false,
                  error: err.message,
                },
              });
            }

            return {
              pageNum,
              success: false,
              error: err.message,
            };
          }
        });

        // Wait for entire batch to complete before moving to next batch
        const batchResults = await Promise.all(batchPromises);
        const successCount = batchResults.filter((r) => r.success).length;
        log("info", `Batch complete: ${successCount}/${batchResults.length} pages succeeded`);
      }

      log("complete", `Processing complete. ${totalPages} page(s) processed.`);
      return {
        fileName,
        structureId,
        totalPages,
        results: this.allPdfFiles[fileName].pages,
        success: true,
      };
    } catch (err) {
      log("error", `Failed to process: ${err.message}`);
      return {
        fileName,
        structureId,
        totalPages: 0,
        results: this.allPdfFiles[fileName].pages,
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Process multiple PDF files in parallel
   * @param {File[]} pdfFiles - Array of PDF files to process
   * @param {Function} onFileComplete - Optional callback when a file completes
   * @param {Function} onPageComplete - Optional callback for page progress
   * @returns {Promise<Object>} - All results
   */
  async processFiles(pdfFiles, onFileComplete = null, onPageComplete = null) {
    // Process all files in parallel using Promise.all
    const processingPromises = pdfFiles.map(async (pdfFile) => {
      const fileResult = await this.processFile(pdfFile, onPageComplete);

      if (onFileComplete) {
        onFileComplete(fileResult);
      }

      return fileResult;
    });

    // Wait for all files to complete
    await Promise.all(processingPromises);

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
