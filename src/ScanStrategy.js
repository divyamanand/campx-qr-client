import { ROIManager } from "./ROIManager";
import { RetryController } from "./RetryController";
import { ResultAggregator } from "./ResultAggregator";
import { rotateImage } from "./imageUtils";

/**
 * ScanStrategy - Orchestrates the complete barcode detection and decode pipeline
 *
 * Flow:
 * 1. Low-scale detection pass (find positions)
 * 2. Build ROIs with intelligent padding
 * 3. ROI-first decode with retries
 * 4. Fallback to full-page if no detection
 *
 * Early exits when all required codes found
 */
export class ScanStrategy {
  constructor(scanImage, options = {}) {
    this.scanImage = scanImage;
    this.onLog = options.onLog || null;
    this.DETECTION_SCALE = options.detectionScale || 1.5;
  }

  /**
   * Log helper
   */
  log(type, message, extra = {}) {
    if (this.onLog) {
      this.onLog({
        type,
        message,
        timestamp: Date.now(),
        ...extra,
      });
    }
  }

  /**
   * Main entry point: Process a single page
   *
   * @param {Blob} imageBlob - Page image blob
   * @param {number} pageNumber - Page number
   * @param {Array} requiredFormats - ['QRCode', 'Code128']
   * @param {Object} imageMetadata - { width, height, scale }
   * @returns {Promise<Object>} - Final result
   */
  async processPage(imageBlob, pageNumber, requiredFormats, imageMetadata) {
    this.log(
      "start",
      `Processing page ${pageNumber} (expecting ${requiredFormats.length} format(s))`
    );

    const aggregator = new ResultAggregator(pageNumber, requiredFormats);
    const retryController = new RetryController();

    try {
      // Step 1: Detection pass (low scale, find positions)
      this.log("phase", "Starting detection pass", { scale: this.DETECTION_SCALE });
      const detectionResult = await this.scanImage.scan(imageBlob);

      if (detectionResult.success && detectionResult.codes.length > 0) {
        this.log("success", `Detected ${detectionResult.codes.length} code(s) at detection scale`, {
          formats: detectionResult.codes.map((c) => c.format).join(","),
        });

        // Step 2: Build ROIs
        const roiData = ROIManager.buildROIs(
          detectionResult.codes,
          imageMetadata.width,
          imageMetadata.height
        );

        this.log("info", `Built ${roiData.rois.length} ROI(s)`, {
          hasUnion: !!roiData.unionROI,
        });

        // Step 3: ROI decode phase
        await this.roiDecodePhase(
          imageBlob,
          roiData,
          aggregator,
          retryController,
          requiredFormats,
          imageMetadata
        );
      } else {
        this.log("warning", "No codes detected in detection pass, falling back to full-page");
      }

      // Step 4: Fallback full-page if needed
      if (!aggregator.isComplete) {
        await this.fullPageFallbackPhase(
          imageBlob,
          aggregator,
          retryController,
          imageMetadata
        );
      }

      const result = aggregator.getResult();
      const summary = retryController.getSummary();

      this.log("complete", `Page ${pageNumber} processing complete`, {
        success: result.success,
        codesFound: result.codes.length,
        ...summary,
      });

      return result;
    } catch (err) {
      this.log("error", `Failed to process page ${pageNumber}: ${err.message}`);
      return {
        pageNumber,
        success: false,
        codes: [],
        error: err.message,
      };
    }
  }

  /**
   * Phase 2: Decode from ROIs with smart retry
   */
  async roiDecodePhase(
    fullPageBlob,
    roiData,
    aggregator,
    retryController,
    requiredFormats,
    imageMetadata
  ) {
    this.log("phase", "Starting ROI decode phase");

    const roisToDecode = ROIManager.getDecodePriority(roiData);

    // For each scale
    for (const scale of RetryController.CONFIG.ROI_SCALE_SEQUENCE) {
      if (aggregator.shouldStopScanning(retryController)) {
        this.log("info", "All required formats found, exiting ROI phase");
        break;
      }

      this.log("scale", `Trying ROI decode at scale ${scale}`);

      // For each ROI at this scale
      for (const roi of roisToDecode) {
        if (aggregator.shouldStopScanning(retryController)) {
          break;
        }

        // Decode original
        const decodeResult = await this.decodeROI(
          fullPageBlob,
          roi,
          scale,
          false,
          imageMetadata
        );

        if (decodeResult.success && decodeResult.codes.length > 0) {
          aggregator.addCodes(decodeResult.codes, {
            scale,
            rotated: false,
            roiLabel: roi.label,
          });

          retryController.recordAttempt({
            scale,
            rotated: false,
            roi: roi.label,
            format: roi.format || "mixed",
            success: true,
          });

          this.log("success", `Found ${decodeResult.codes.length} code(s) in ${roi.label}`, {
            scale,
            formats: decodeResult.codes.map((c) => c.format).join(","),
          });
        } else {
          // Try rotated
          this.log("retry", `Trying rotation for ${roi.label} at scale ${scale}`);

          const rotatedResult = await this.decodeROI(
            fullPageBlob,
            roi,
            scale,
            true,
            imageMetadata
          );

          if (rotatedResult.success && rotatedResult.codes.length > 0) {
            aggregator.addCodes(rotatedResult.codes, {
              scale,
              rotated: true,
              roiLabel: roi.label,
            });

            retryController.recordAttempt({
              scale,
              rotated: true,
              roi: roi.label,
              format: roi.format || "mixed",
              success: true,
            });

            this.log("success", `Found ${rotatedResult.codes.length} code(s) after rotation`, {
              scale,
              formats: rotatedResult.codes.map((c) => c.format).join(","),
            });
          } else {
            retryController.recordAttempt({
              scale,
              rotated: true,
              roi: roi.label,
              format: roi.format || "mixed",
              success: false,
            });
          }
        }
      }
    }
  }

  /**
   * Phase 4: Fallback to full-page decode if ROI didn't work
   */
  async fullPageFallbackPhase(imageBlob, aggregator, retryController, imageMetadata) {
    if (aggregator.isComplete) {
      return;
    }

    this.log("phase", "Starting full-page fallback (max 2 attempts)");

    let scale = retryController.getNextFullPageScale();
    while (scale) {
      const decodeResult = await this.decodeFullPage(
        imageBlob,
        scale,
        false,
        imageMetadata
      );

      if (decodeResult.success && decodeResult.codes.length > 0) {
        aggregator.addCodes(decodeResult.codes, {
          scale,
          rotated: false,
          roiLabel: "FULL_PAGE",
        });

        this.log("success", `Fallback: Found ${decodeResult.codes.length} code(s) at scale ${scale}`);
        break;
      }

      scale = retryController.getNextFullPageScale();
    }
  }

  /**
   * Decode a specific ROI
   */
  async decodeROI(fullPageBlob, roi, scale, rotated, imageMetadata) {
    try {
      // Create canvas from blob
      const canvas = await this.blobToCanvas(fullPageBlob);

      // Crop ROI
      const croppedBlob = await ROIManager.cropCanvasToBlob(canvas, roi);

      if (!croppedBlob) {
        return { success: false, codes: [] };
      }

      // Scale if needed
      const scaledBlob = await this.scaleBlob(croppedBlob, scale);

      // Rotate if needed
      let finalBlob = scaledBlob;
      if (rotated && RetryController.CONFIG.ROTATION_ENABLED) {
        finalBlob = await rotateImage(
          scaledBlob,
          RetryController.CONFIG.ROTATION_DEGREES
        );
      }

      // Decode
      const result = await this.scanImage.scan(finalBlob);

      // Cleanup
      canvas.width = canvas.height = 0;

      return result;
    } catch (err) {
      this.log("warning", `ROI decode failed: ${err.message}`);
      return { success: false, codes: [] };
    }
  }

  /**
   * Decode full page at scale
   */
  async decodeFullPage(imageBlob, scale, rotated, imageMetadata) {
    try {
      // Scale if needed
      const scaledBlob = await this.scaleBlob(imageBlob, scale);

      // Rotate if needed
      let finalBlob = scaledBlob;
      if (rotated && RetryController.CONFIG.ROTATION_ENABLED) {
        finalBlob = await rotateImage(
          scaledBlob,
          RetryController.CONFIG.ROTATION_DEGREES
        );
      }

      // Decode
      const result = await this.scanImage.scan(finalBlob);

      return result;
    } catch (err) {
      this.log("warning", `Full-page decode failed: ${err.message}`);
      return { success: false, codes: [] };
    }
  }

  /**
   * Convert blob to canvas
   */
  blobToCanvas(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image"));
      };

      img.src = url;
    });
  }

  /**
   * Scale a blob to new resolution
   */
  async scaleBlob(blob, scale) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (scaledBlob) => {
            canvas.width = canvas.height = 0;
            resolve(scaledBlob);
          },
          blob.type || "image/png",
          1
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to scale image"));
      };

      img.src = url;
    });
  }
}
