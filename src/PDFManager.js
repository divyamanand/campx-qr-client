import { ScanImage } from "./ScanImage";
import { PDFToImage } from "./PDFToImage";
import { rotateImage } from "./imageUtils";

/**
 * Default configuration for PDFManager
 */
const DEFAULT_CONFIG = {
  initialScale: 3,
  enableRotation: true,
  rotationDegrees: 180,
};

/**
 * PDFManager - Orchestrates PDF processing
 *
 * Single Responsibility: Coordinate PDF page processing workflow
 * - Delegates page-to-image conversion to PDFToImage
 * - Delegates scanning to ScanImage
 * - Focuses on orchestrating the processing pipeline
 * - Stateless: processes and returns, no internal storage
 */
export class PDFManager {
  /**
   * @param {Object} config - Configuration options
   * @param {number} config.initialScale - Starting scale for rendering (default: 3)
   * @param {boolean} config.enableRotation - Whether to try rotation on failure (default: true)
   * @param {number} config.rotationDegrees - Degrees to rotate on retry (default: 180)
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scanner = new ScanImage();
    this.pdfToImage = new PDFToImage();
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
   * Process a single page
   * @param {PDFPageProxy} page - PDF page to process
   * @param {number} pageNumber - Page number
   * @returns {Promise<{success: boolean, result: Object, scale: number, rotated: boolean}>}
   */
  async processPage(page, pageNumber) {
    try {
      // Convert page to image at initial scale
      const imageResult = await this.pdfToImage.convertPageToImage(page, this.config.initialScale);

      // Try scanning with rotation if needed
      const { result, rotated } = await this.tryScanWithRotation(imageResult.blob);

      return {
        success: result.success,
        result,
        scale: this.config.initialScale,
        rotated,
      };
    } catch (err) {
      console.warn(`Error processing page ${pageNumber}:`, err);
      return {
        success: false,
        result: {
          success: false,
          codes: [],
          error: "FAILED_TO_DETECT_ANY_CODE",
        },
        scale: this.config.initialScale,
        rotated: false,
      };
    }
  }

  /**
   * Process an entire PDF file
   * @param {File} pdfFile - The PDF file to process
   * @param {Function} onPageComplete - Optional callback for progress updates
   * @returns {Promise<{fileName: string, totalPages: number, results: Object, success: boolean}>}
   */
  async processFile(pdfFile, onPageComplete = null) {
    const fileName = pdfFile.name;
    const fileResults = {};

    try {
      const pdf = await this.pdfToImage.loadDocument(pdfFile);
      const totalPages = pdf.numPages;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const pageResult = await this.processPage(page, pageNum);

        // Store result in local object
        fileResults[pageNum] = {
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

      return {
        fileName,
        totalPages,
        results: fileResults,
        success: true,
      };
    } catch (err) {
      return {
        fileName,
        totalPages: 0,
        results: fileResults,
        success: false,
        error: err.message,
      };
    }
  }
}

// Export a factory function for convenience
export function createPDFManager(config = {}) {
  return new PDFManager(config);
}
