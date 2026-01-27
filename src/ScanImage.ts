import cv from "@techstark/opencv-js";
import jsQR from "jsqr";

/**
 * QR Code detection result
 */
export interface QRCode {
  data: string;
  format: "QRCode";
  position: null;
}

/**
 * Scan result from QR code detection
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
 * ScanImage - Responsible for scanning images for QR codes
 *
 * Uses:
 * - OpenCV.js for image preprocessing (scaling, grayscale conversion)
 * - jsQR for QR code detection
 *
 * Single responsibility: Take a canvas element and optional scale factor,
 * then process it and detect QR codes.
 */
export class ScanImage {
  private options: ScanImageOptions;
  private initialized: boolean;
  private interpolation: number | null = null;

  constructor(options: ScanImageOptions = {}) {
    this.options = options;
    this.initialized = false;
  }

  /**
   * Initialize OpenCV (if needed)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    // Lazy load interpolation value once OpenCV is ready
    if (this.interpolation === null) {
      this.interpolation = this.options.interpolation ?? cv.INTER_LINEAR;
    }
    this.initialized = true;
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
   * Scan a canvas for QR codes using OpenCV preprocessing + jsQR detection
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

      // Convert to grayscale for better QR detection
      const grayMat = new cv.Mat();
      cv.cvtColor(processedMat, grayMat, cv.COLOR_RGBA2GRAY);

      // Extract image data from grayscale Mat
      const imageData = new ImageData(
        new Uint8ClampedArray(grayMat.data8U),
        grayMat.cols,
        grayMat.rows
      );

      // Use jsQR for QR code detection
      const qrResult = jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
        { inversionAttempts: "dontInvert" }
      );

      // Clean up OpenCV resources
      processedMat.delete();
      grayMat.delete();

      if (!qrResult) {
        return {
          success: false,
          codes: [],
          error: "NO_QR_CODE_FOUND",
        };
      }

      // Return detected QR code
      const codes: QRCode[] = [
        {
          data: qrResult.data,
          format: "QRCode",
          position: null, // jsQR provides location but we don't need it for now
        },
      ];

      return {
        success: true,
        codes,
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
}

// Default singleton instance for convenience
export const defaultScanner = new ScanImage();
