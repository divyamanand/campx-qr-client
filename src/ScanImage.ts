import cv from "@techstark/opencv-js";

/**
 * Detected code result (QR or Barcode)
 */
export interface QRCode {
  data: string;
  format: "QRCode" | "Barcode" | "Code128" | "Unknown";
  position: null;
}

/**
 * Scan result from code detection
 */
export interface ScanResult {
  success: boolean;
  codes: QRCode[];
  error: string | null;
}

/**
 * ScanImage configuration options
 */
export interface ScanImageOptions {
  interpolation?: number;
}

/**
 * ScanImage - Responsible for scanning images for QR codes and barcodes
 *
 * Features:
 * - OpenCV.js for image preprocessing (scaling, grayscale conversion)
 * - QRCodeDetector for QR code detection
 * - barcode_BarcodeDetector for barcode detection (Code128, EAN, etc.)
 *
 * Single responsibility: Take a canvas element and optional scale factor,
 * then process it and detect QR codes and barcodes.
 */
export class ScanImage {
  private options: ScanImageOptions;
  private initialized: boolean;
  private interpolation: number | null = null;
  private qrDetector: any;
  private barcodeDetector: any;

  constructor(options: ScanImageOptions = {}) {
    this.options = options;
    this.initialized = false;
    this.qrDetector = null;
    this.barcodeDetector = null;
  }

  /**
   * Initialize OpenCV detectors
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Lazy load interpolation value once OpenCV is ready
      if (this.interpolation === null) {
        this.interpolation = this.options.interpolation ?? cv.INTER_LINEAR;
      }

      // Initialize detectors
      this.qrDetector = new cv.QRCodeDetector();
      this.barcodeDetector = new cv.barcode_BarcodeDetector();

      this.initialized = true;
    } catch (err) {
      console.error("Failed to initialize detectors:", err);
      throw err;
    }
  }

  /**
   * Get interpolation constant, initializing if needed
   */
  private getInterpolation(): number {
    if (this.interpolation === null) {
      this.interpolation = this.options.interpolation ?? cv.INTER_LINEAR;
    }
    return this.interpolation;
  }

  /**
   * Detect QR codes in a grayscale Mat
   */
  private detectQRCodes(grayMat: cv.Mat): QRCode[] {
    const codes: QRCode[] = [];

    try {
      const points = new cv.Mat();
      const decodedText = new cv.Mat();

      // Detect QR codes
      const detected = this.qrDetector.detect(grayMat, points);

      if (detected) {
        // Decode each detected QR code
        const decodedData = this.qrDetector.decode(grayMat, points, decodedText);

        if (decodedData) {
          codes.push({
            data: decodedData,
            format: "QRCode",
            position: null,
          });
        }
      }

      points.delete();
      decodedText.delete();
    } catch (err) {
      console.error("QR code detection error:", err);
    }

    return codes;
  }

  /**
   * Detect barcodes in a grayscale Mat
   */
  private detectBarcodes(grayMat: cv.Mat): QRCode[] {
    const codes: QRCode[] = [];

    try {
      // Detect barcodes
      const result = this.barcodeDetector.detect(grayMat);

      if (result && result.barcodes && result.barcodes.length > 0) {
        result.barcodes.forEach((barcodeData: string) => {
          codes.push({
            data: barcodeData,
            format: "Code128", // Default to Code128, can be enhanced to detect format
            position: null,
          });
        });
      }

      if (result && result.points) {
        result.points.delete();
      }
    } catch (err) {
      console.error("Barcode detection error:", err);
    }

    return codes;
  }

  /**
   * Scan a canvas for QR codes and barcodes using OpenCV
   * @param canvas - The canvas element containing the image
   * @param scale - The scale factor (1 = original size)
   * @returns Scan result with codes or error
   */
  async scan(canvas: HTMLCanvasElement, scale: number = 1): Promise<ScanResult> {
    try {
      await this.initialize();

      if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Invalid canvas element provided");
      }

      // Create OpenCV Mat from canvas
      let srcMat = cv.imread(canvas);

      // Apply scaling if needed (using cv.resize for better quality)
      let processedMat: cv.Mat;
      if (scale !== 1) {
        const newWidth = Math.round(srcMat.cols * scale);
        const newHeight = Math.round(srcMat.rows * scale);
        const newSize = new cv.Size(newWidth, newHeight);

        processedMat = new cv.Mat();
        cv.resize(srcMat, processedMat, newSize, 0, 0, this.getInterpolation());
        srcMat.delete();
      } else {
        processedMat = srcMat;
      }

      // Convert to grayscale for better detection
      const grayMat = new cv.Mat();
      cv.cvtColor(processedMat, grayMat, cv.COLOR_RGBA2GRAY);

      // Detect both QR codes and barcodes
      const qrCodes = this.detectQRCodes(grayMat);
      const barcodeCodes = this.detectBarcodes(grayMat);

      // Combine results
      const allCodes = [...qrCodes, ...barcodeCodes];

      // Clean up OpenCV resources
      processedMat.delete();
      grayMat.delete();

      if (allCodes.length === 0) {
        return {
          success: false,
          codes: [],
          error: "NO_CODES_FOUND",
        };
      }

      return {
        success: true,
        codes: allCodes,
        error: null,
      };
    } catch (err) {
      console.error("ScanImage error:", err);
      return {
        success: false,
        codes: [],
        error: err instanceof Error ? err.message : "SCAN_ERROR",
      };
    }
  }

  /**
   * Cleanup detector resources
   */
  destroy(): void {
    if (this.qrDetector) {
      this.qrDetector.delete();
      this.qrDetector = null;
    }
    if (this.barcodeDetector) {
      this.barcodeDetector.delete();
      this.barcodeDetector = null;
    }
    this.initialized = false;
  }
}

// Default singleton instance for convenience
export const defaultScanner = new ScanImage();
