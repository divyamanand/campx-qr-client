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
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scanner = new ScanImage();
    this.pdfToImage = new PDFToImage();

    // Results storage: { fileName: { pageNumber: { result, scale, rotated } } }
    this.allPdfFiles = {};
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
   * Process a single page with retry logic
   * @param {PDFPageProxy} page - PDF page to process
   * @param {number} pageNumber - Page number
   * @param {string} fileName - File name for tracking
   * @param {Function} onLog - Optional callback for logging events
   * @returns {Promise<PageResult>}
   */
  async processPage(page, pageNumber, fileName, onLog = null) {
    const scaleSequence = this.generateScaleSequence();
    const attemptedScales = new Set();

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

    log("info", "Starting page scan", { scale: this.config.initialScale });

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

        if (result.success) {
          log("success", `Found ${result.codes.length} code(s)`, { scale, rotated: false });
          return {
            success: true,
            result,
            scale,
            rotated: false,
            attempts: attemptedScales.size,
          };
        }

        // Second try: rotate and scan
        if (this.config.enableRotation) {
          log("retry", "Trying with rotated image", { scale, rotated: true });
          const rotatedBlob = await rotateImage(imageResult.blob, this.config.rotationDegrees);
          result = await this.scanner.scan(rotatedBlob);

          if (result.success) {
            log("success", `Found ${result.codes.length} code(s) after rotation`, { scale, rotated: true });
            return {
              success: true,
              result,
              scale,
              rotated: true,
              attempts: attemptedScales.size,
            };
          }
        }

        log("warning", "No codes found at this scale", { scale });
      } catch (err) {
        log("error", `Error: ${err.message}`, { scale });
        console.warn(`Error processing page ${pageNumber} at scale ${scale}:`, err);
        // Continue to next scale on error
      }
    }

    // All attempts failed
    log("error", "All retry attempts failed", { attemptCount: attemptedScales.size });
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
   * @returns {Promise<FileResult>}
   */
  async processFile(pdfFile, onPageComplete = null, onLog = null) {
    const fileName = pdfFile.name;
    this.allPdfFiles[fileName] = {};

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
      log("start", "Loading PDF document");
      const pdf = await this.pdfToImage.loadDocument(pdfFile);
      const totalPages = pdf.numPages;
      log("info", `PDF loaded with ${totalPages} page(s)`);

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const pageResult = await this.processPage(page, pageNum, fileName, onLog);

        // Store result
        this.allPdfFiles[fileName][pageNum] = {
          result: pageResult.result,
          scale: pageResult.scale,
          rotated: pageResult.rotated,
          success: pageResult.success,
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
      }

      log("complete", `Processing complete. ${totalPages} page(s) processed.`);
      return {
        fileName,
        totalPages,
        results: this.allPdfFiles[fileName],
        success: true,
      };
    } catch (err) {
      log("error", `Failed to process: ${err.message}`);
      return {
        fileName,
        totalPages: 0,
        results: this.allPdfFiles[fileName],
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
   * @returns {Promise<Object>} - All results
   */
  async processFiles(pdfFiles, onFileComplete = null, onPageComplete = null) {
    for (const pdfFile of pdfFiles) {
      const fileResult = await this.processFile(pdfFile, onPageComplete);

      if (onFileComplete) {
        onFileComplete(fileResult);
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

    for (const [fileName, pages] of Object.entries(this.allPdfFiles)) {
      const fileResult = {
        name: fileName,
        results: [],
      };

      for (const [pageNum, pageData] of Object.entries(pages)) {
        const qrs = pageData.result.success
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
                error: pageData.result.error,
              },
            ];

        fileResult.results.push({
          page: parseInt(pageNum),
          qrs,
          scale: pageData.scale,
          rotated: pageData.rotated,
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
    let totalCodes = 0;

    for (const pages of Object.values(this.allPdfFiles)) {
      totalFiles++;
      for (const pageData of Object.values(pages)) {
        totalPages++;
        if (pageData.success) {
          successfulPages++;
          totalCodes += pageData.result.codes.length;
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
      totalCodes,
      successRate: totalPages > 0 ? (successfulPages / totalPages) * 100 : 0,
    };
  }
}

// Export a factory function for convenience
export function createPDFManager(config = {}) {
  return new PDFManager(config);
}
