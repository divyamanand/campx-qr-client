import cv from "@techstark/opencv-js";

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
 * ScanImage - Responsible for scanning images for QR codes using OpenCV.js
 *
 * Single responsibility: Take a canvas element and optional scale factor,
 * then use OpenCV's QRCodeDetector to find and decode QR codes.
 */
export class ScanImage {
  private options: {
    interpolation: number;
  };
  private initialized: boolean;

  constructor(options: ScanImageOptions = {}) {
    this.options = {
      // Interpolation method for scaling: cv.INTER_LINEAR (default), cv.INTER_AREA, cv.INTER_CUBIC
      interpolation: options.interpolation ?? cv.INTER_LINEAR,
    };
    this.initialized = false;
  }

  /**
   * Initialize OpenCV (if needed)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    // OpenCV.js is already loaded via import
    this.initialized = true;
  }

  /**
   * Scan a canvas for QR codes using OpenCV QRCodeDetector
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
        cv.resize(srcMat, processedMat, newSize, 0, 0, this.options.interpolation);
        srcMat.delete();
      } else {
        processedMat = srcMat;
      }

      // Convert to grayscale for better QR detection
      const grayMat = new cv.Mat();
      cv.cvtColor(processedMat, grayMat, cv.COLOR_RGBA2GRAY);

      // Create QRCodeDetector and detect + decode
      const qrDetector = new cv.QRCodeDetector();
      const decodedText = new cv.Mat();
      const points = new cv.Mat();

      // detectAndDecode returns true if QR code detected and decoded successfully
      const detected = qrDetector.detectAndDecode(grayMat, points, decodedText);

      // Clean up
      processedMat.delete();
      grayMat.delete();
      points.delete();

      if (!detected) {
        qrDetector.delete();
        decodedText.delete();
        return {
          success: false,
          codes: [],
          error: "NO_QR_CODE_FOUND",
        };
      }

      // Extract decoded text from Mat
      let decodedString = "";
      if (decodedText.rows > 0) {
        const dataPtr = cv.matFromArray(
          decodedText.rows,
          decodedText.cols,
          decodedText.type(),
          decodedText.data32F
        );
        const text = cv.matToString(dataPtr);
        decodedString = text || "";
        dataPtr.delete();
      }

      qrDetector.delete();
      decodedText.delete();

      // Return as array with single QR code result
      const codes: QRCode[] =
        decodedString && decodedString.length > 0
          ? [
              {
                data: decodedString,
                format: "QRCode",
                position: null, // OpenCV doesn't easily provide corner points
              },
            ]
          : [];

      return {
        success: codes.length > 0,
        codes,
        error: codes.length > 0 ? null : "DECODE_FAILED",
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
