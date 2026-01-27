import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min?url";
import { ScanImage, QRCode, ScanResult } from "./ScanImage";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * PDFManager configuration options
 */
export interface PDFManagerConfig {
  initialScale?: number;
  maxScale?: number;
  minScale?: number;
}

/**
 * Page processing result
 */
export interface PageResult {
  success: boolean;
  codes: QRCode[];
  scale: number;
  attempts: number;
  error?: string;
}

/**
 * File processing result
 */
export interface FileResult {
  fileName: string;
  totalPages: number;
  successCount: number;
  failureCount: number;
  pages: Record<number, PageResult>;
  success: boolean;
  error?: string;
}

/**
 * Processing summary statistics
 */
export interface ProcessingSummary {
  totalFiles: number;
  totalPages: number;
  successfulPages: number;
  failedPages: number;
  totalCodes: number;
  successRate: string | number;
}

/**
 * Page completion callback
 */
export type OnPageComplete = (progress: {
  fileName: string;
  pageNumber: number;
  totalPages: number;
  result: PageResult | { success: false; error: string };
}) => void;

/**
 * Log callback
 */
export type OnLog = (logEntry: {
  type: string;
  message: string;
  fileName?: string;
  pageNumber?: number;
  attempt?: number;
  [key: string]: unknown;
}) => void;

/**
 * Default configuration for PDFManager
 */
const DEFAULT_CONFIG: Required<PDFManagerConfig> = {
  initialScale: 1, // Base scale for rendering (1.0 = 100%)
  maxScale: 3, // Maximum scale multiplier to try (e.g., 1 * 3 = 3.0x)
  minScale: 0.5, // Minimum scale multiplier to try
};

/**
 * PDFManager - Orchestrates PDF scanning with OpenCV
 *
 * Responsibilities:
 * - Load PDF documents
 * - Render PDF pages to canvas
 * - Use OpenCV for image scaling and QR code detection
 * - Track results per file/page
 */
export class PDFManager {
  private config: Required<PDFManagerConfig>;
  private scanner: ScanImage;
  private allPdfFiles: Record<
    string,
    {
      pages: Record<number, PageResult>;
    }
  >;

  constructor(config: PDFManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.scanner = new ScanImage();

    // Results storage: { fileName: { pages: { pageNumber: { codes, scale, attempts } } } }
    this.allPdfFiles = {};
  }

  /**
   * Load a PDF document from a File
   */
  async loadDocument(
    pdfFile: File
  ): Promise<pdfjsLib.PDFDocumentProxy> {
    const arrayBuffer = await pdfFile.arrayBuffer();
    return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  }

  /**
   * Generate scale sequence for retry attempts
   * Uses geometric progression: initialScale * 1, * 1.5, * 2, * 2.5, * 3
   */
  generateScaleSequence(): number[] {
    const scales: number[] = [this.config.initialScale];
    const { maxScale, initialScale } = this.config;

    // Add increasing scales up to maxScale
    for (let multiplier = 1.5; multiplier <= maxScale; multiplier += 0.5) {
      const scale = initialScale * multiplier;
      if (scale <= maxScale) {
        scales.push(parseFloat(scale.toFixed(2)));
      }
    }

    return scales;
  }

  /**
   * Render a PDF page to canvas at a given scale
   */
  async renderPageToCanvas(
    page: pdfjsLib.PDFPageProxy,
    renderScale: number
  ): Promise<HTMLCanvasElement> {
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Failed to get canvas context");
    }

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    return canvas;
  }

  /**
   * Process a single PDF page, trying multiple scales with OpenCV
   */
  async processPage(
    page: pdfjsLib.PDFPageProxy,
    pageNumber: number,
    fileName: string,
    onLog: OnLog | null = null
  ): Promise<PageResult> {
    const scaleSequence = this.generateScaleSequence();
    let attemptCount = 0;

    const log = (type: string, message: string, extra: Record<string, unknown> = {}): void => {
      if (onLog) {
        onLog({
          type,
          message,
          fileName,
          pageNumber,
          attempt: attemptCount,
          ...extra,
        });
      }
    };

    log("info", `Starting page scan - will try ${scaleSequence.length} scale(s)`);

    // Try each scale
    for (const scale of scaleSequence) {
      attemptCount++;

      if (attemptCount > 1) {
        log("info", `Retry attempt ${attemptCount} with scale ${scale}`);
      } else {
        log("info", `First attempt with scale ${scale}`);
      }

      try {
        // Render page to canvas
        const canvas = await this.renderPageToCanvas(page, scale);
        log("info", `Rendered page to canvas: ${canvas.width}x${canvas.height}px`);

        // Scan canvas with OpenCV
        const result = await this.scanner.scan(canvas, 1.0);

        // Clean up canvas
        canvas.width = 0;
        canvas.height = 0;

        if (result.success && result.codes.length > 0) {
          log("success", `Found ${result.codes.length} QR code(s)`, {
            scale,
            codes: result.codes.map((c) => c.data),
          });

          return {
            success: true,
            codes: result.codes,
            scale,
            attempts: attemptCount,
          };
        } else {
          log("info", `No QR codes found at scale ${scale}`);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        log("error", `Error at scale ${scale}: ${errorMessage}`);
        console.error(
          `Error processing page ${pageNumber} at scale ${scale}:`,
          err
        );
      }
    }

    // All scales exhausted without finding codes
    log(
      "error",
      `All ${attemptCount} attempts failed - no QR codes found`
    );
    return {
      success: false,
      codes: [],
      scale: this.config.initialScale,
      attempts: attemptCount,
      error: "NO_QR_CODES_FOUND",
    };
  }

  /**
   * Process an entire PDF file (sequential page-by-page processing)
   */
  async processFile(
    pdfFile: File,
    onPageComplete: OnPageComplete | null = null,
    onLog: OnLog | null = null
  ): Promise<FileResult> {
    const fileName = pdfFile.name;

    // Initialize file entry
    this.allPdfFiles[fileName] = {
      pages: {},
    };

    const log = (
      type: string,
      message: string,
      extra: Record<string, unknown> = {}
    ): void => {
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
      log("start", `Loading PDF: ${fileName}`);
      const pdf = await this.loadDocument(pdfFile);
      const totalPages = pdf.numPages;
      log("info", `PDF loaded with ${totalPages} page(s)`);

      let successCount = 0;
      let failureCount = 0;

      // Process each page sequentially (one file / one page at a time)
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        try {
          const page = await pdf.getPage(pageNum);
          const pageResult = await this.processPage(
            page,
            pageNum,
            fileName,
            onLog
          );

          // Store result
          this.allPdfFiles[fileName].pages[pageNum] = {
            codes: pageResult.codes || [],
            scale: pageResult.scale,
            attempts: pageResult.attempts,
            success: pageResult.success,
            error: pageResult.error || undefined,
          };

          if (pageResult.success) {
            successCount++;
          } else {
            failureCount++;
          }

          // Progress callback
          if (onPageComplete) {
            onPageComplete({
              fileName,
              pageNumber: pageNum,
              totalPages,
              result: pageResult,
            });
          }
        } catch (pageErr) {
          failureCount++;
          const errorMessage =
            pageErr instanceof Error
              ? pageErr.message
              : String(pageErr);
          log("error", `Page ${pageNum} failed: ${errorMessage}`);

          this.allPdfFiles[fileName].pages[pageNum] = {
            codes: [],
            scale: 0,
            attempts: 0,
            success: false,
            error: errorMessage,
          };

          if (onPageComplete) {
            onPageComplete({
              fileName,
              pageNumber: pageNum,
              totalPages,
              result: { success: false, error: errorMessage },
            });
          }
        }
      }

      log(
        "complete",
        `Processing complete: ${successCount}/${totalPages} successful`
      );
      return {
        fileName,
        totalPages,
        successCount,
        failureCount,
        pages: this.allPdfFiles[fileName].pages,
        success: failureCount === 0,
      };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      log("error", `Failed to load PDF: ${errorMessage}`);
      return {
        fileName,
        totalPages: 0,
        successCount: 0,
        failureCount: 0,
        pages: {},
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Process multiple PDF files sequentially
   */
  async processFiles(
    pdfFiles: File[],
    onFileComplete: ((result: FileResult) => void) | null = null,
    onPageComplete: OnPageComplete | null = null
  ): Promise<Record<string, { pages: Record<number, PageResult> }>> {
    for (const pdfFile of pdfFiles) {
      const fileResult = await this.processFile(
        pdfFile,
        onPageComplete
      );

      if (onFileComplete) {
        onFileComplete(fileResult);
      }
    }

    return this.getAllResults();
  }

  /**
   * Get all scan results
   */
  getAllResults(): Record<
    string,
    {
      pages: Record<number, PageResult>;
    }
  > {
    return this.allPdfFiles;
  }

  /**
   * Clear all stored results
   */
  clearResults(): void {
    this.allPdfFiles = {};
  }

  /**
   * Get summary statistics across all files
   */
  getSummary(): ProcessingSummary {
    let totalFiles = 0;
    let totalPages = 0;
    let successfulPages = 0;
    let failedPages = 0;
    let totalCodes = 0;

    for (const fileData of Object.values(this.allPdfFiles)) {
      totalFiles++;
      const pages = fileData.pages || {};

      for (const [key, pageData] of Object.entries(pages)) {
        if (key === "pages") continue;
        totalPages++;

        if (pageData.success) {
          successfulPages++;
          totalCodes += pageData.codes?.length || 0;
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
      successRate:
        totalPages > 0
          ? ((successfulPages / totalPages) * 100).toFixed(1)
          : 0,
    };
  }
}

/**
 * Export a factory function for convenience
 */
export function createPDFManager(
  config: PDFManagerConfig = {}
): PDFManager {
  return new PDFManager(config);
}
