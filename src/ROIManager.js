/**
 * ROIManager - Manages Region of Interest extraction and padding
 *
 * Responsibilities:
 * - Extract ROI from detected barcode positions
 * - Apply intelligent padding based on barcode type
 * - Merge overlapping ROIs
 * - Handle edge cases (small barcodes, near edges)
 */
export class ROIManager {
  /**
   * Padding percentages by barcode format
   */
  static PADDING_CONFIG = {
    QRCode: 0.25, // 25% padding
    Code128: 0.15, // 15% padding
    union: 0.20, // 20% padding for merged ROI
  };

  /**
   * Build ROIs from detected code positions
   *
   * @param {Array} detectedCodes - Array of { format, position }
   * @param {number} imageWidth - Image width
   * @param {number} imageHeight - Image height
   * @returns {Object} - { rois: [], unionROI }
   */
  static buildROIs(detectedCodes, imageWidth, imageHeight) {
    if (!detectedCodes || detectedCodes.length === 0) {
      return { rois: [], unionROI: null };
    }

    // Build individual ROIs with padding
    const rois = detectedCodes.map((code) => {
      const roi = this.extractROI(code.position, code.format, imageWidth, imageHeight);
      return {
        ...roi,
        format: code.format,
        originalPosition: code.position,
      };
    });

    // Build union ROI
    const unionROI = this.mergeROIs(rois, imageWidth, imageHeight);

    return { rois, unionROI };
  }

  /**
   * Extract and pad a single ROI
   *
   * @param {Object} position - Barcode position { x, y, width, height }
   * @param {string} format - Barcode format (QRCode, Code128)
   * @param {number} imageWidth
   * @param {number} imageHeight
   * @returns {Object} - Padded ROI { x, y, width, height }
   */
  static extractROI(position, format, imageWidth, imageHeight) {
    if (!position || !position.width || !position.height) {
      return null;
    }

    const padding = this.PADDING_CONFIG[format] || 0.2;

    // Calculate padding in pixels
    const padX = position.width * padding;
    const padY = position.height * padding;

    // Apply padding
    let x = Math.max(0, position.x - padX);
    let y = Math.max(0, position.y - padY);
    let width = Math.min(position.width + padX * 2, imageWidth - x);
    let height = Math.min(position.height + padY * 2, imageHeight - y);

    // Ensure minimum size
    const MIN_ROI_SIZE = 20;
    if (width < MIN_ROI_SIZE || height < MIN_ROI_SIZE) {
      // Expand around original position
      width = Math.min(Math.max(width, MIN_ROI_SIZE), imageWidth);
      height = Math.min(Math.max(height, MIN_ROI_SIZE), imageHeight);
      x = Math.max(0, position.x - width / 2);
      y = Math.max(0, position.y - height / 2);
    }

    return { x, y, width, height };
  }

  /**
   * Merge multiple ROIs into union ROI
   *
   * @param {Array} rois - Array of ROI objects
   * @param {number} imageWidth
   * @param {number} imageHeight
   * @returns {Object} - Merged ROI
   */
  static mergeROIs(rois, imageWidth, imageHeight) {
    if (!rois || rois.length === 0) {
      return null;
    }

    // Find bounding box of all ROIs
    let minX = rois[0].x;
    let minY = rois[0].y;
    let maxX = rois[0].x + rois[0].width;
    let maxY = rois[0].y + rois[0].height;

    for (let i = 1; i < rois.length; i++) {
      const roi = rois[i];
      minX = Math.min(minX, roi.x);
      minY = Math.min(minY, roi.y);
      maxX = Math.max(maxX, roi.x + roi.width);
      maxY = Math.max(maxY, roi.y + roi.height);
    }

    // Apply union padding
    const padding = this.PADDING_CONFIG.union;
    const padX = (maxX - minX) * padding;
    const padY = (maxY - minY) * padding;

    // Expand with padding
    let unionX = Math.max(0, minX - padX);
    let unionY = Math.max(0, minY - padY);
    let unionWidth = Math.min(maxX + padX - unionX, imageWidth - unionX);
    let unionHeight = Math.min(maxY + padY - unionY, imageHeight - unionY);

    return {
      x: unionX,
      y: unionY,
      width: unionWidth,
      height: unionHeight,
      containedROIs: rois.length,
    };
  }

  /**
   * Extract image crop from canvas for a given ROI
   *
   * @param {HTMLCanvasElement} canvas - Source canvas
   * @param {Object} roi - ROI { x, y, width, height }
   * @returns {Promise<Blob>} - Cropped image blob
   */
  static async cropCanvasToBlob(canvas, roi) {
    if (!roi || roi.width <= 0 || roi.height <= 0) {
      return null;
    }

    const ctx = canvas.getContext("2d");
    const cropCanvas = document.createElement("canvas");
    const cropCtx = cropCanvas.getContext("2d");

    cropCanvas.width = roi.width;
    cropCanvas.height = roi.height;

    // Extract and draw cropped region
    const imageData = ctx.getImageData(roi.x, roi.y, roi.width, roi.height);
    cropCtx.putImageData(imageData, 0, 0);

    return new Promise((resolve) => {
      cropCanvas.toBlob((blob) => {
        cropCanvas.width = cropCanvas.height = 0; // Cleanup
        resolve(blob);
      }, "image/png", 1);
    });
  }

  /**
   * Get ROI priority order for decoding
   *
   * @param {Object} roiData - { rois, unionROI }
   * @returns {Array} - ROIs in priority order
   */
  static getDecodePriority(roiData) {
    const priority = [];

    // Priority 1: Union ROI (contains all symbols)
    if (roiData.unionROI) {
      priority.push({
        ...roiData.unionROI,
        label: "UNION",
        type: "union",
      });
    }

    // Priority 2: Individual ROIs (largest first)
    if (roiData.rois) {
      const sorted = [...roiData.rois].sort((a, b) => {
        const areaA = a.width * a.height;
        const areaB = b.width * b.height;
        return areaB - areaA;
      });

      sorted.forEach((roi, idx) => {
        priority.push({
          ...roi,
          label: `${roi.format}_${idx + 1}`,
          type: "individual",
          format: roi.format,
        });
      });
    }

    return priority;
  }

  /**
   * Check if ROI is valid for decoding
   *
   * @param {Object} roi - ROI to validate
   * @returns {boolean}
   */
  static isValidROI(roi) {
    return (
      roi &&
      roi.width > 0 &&
      roi.height > 0 &&
      roi.width < 100000 &&
      roi.height < 100000
    );
  }
}
