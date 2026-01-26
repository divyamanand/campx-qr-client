/**
 * RetryController - Manages scale and rotation retry sequences
 *
 * Responsibilities:
 * - Generate intelligent scale sequences
 * - Manage rotation attempts
 * - Track retry state and prevent duplicates
 * - Early exit when conditions are met
 */
export class RetryController {
  /**
   * Configuration for retry behavior
   */
  static CONFIG = {
    ROI_SCALE_SEQUENCE: [2.5, 3.5, 4.5], // ROI decode scales
    FULLPAGE_SCALE_SEQUENCE: [3, 4], // Fallback full-page scales
    ROTATION_ENABLED: true,
    ROTATION_DEGREES: 180,
    MAX_RETRIES_PER_SCALE: 2, // 1 original + 1 rotated
  };

  constructor() {
    this.attempts = [];
    this.attemptedScales = new Set();
    this.foundFormats = new Set();
  }

  /**
   * Record a decode attempt
   *
   * @param {Object} attempt - { scale, rotated, roi, format, success }
   */
  recordAttempt(attempt) {
    this.attempts.push({
      timestamp: Date.now(),
      ...attempt,
    });

    this.attemptedScales.add(attempt.scale);

    if (attempt.success) {
      this.foundFormats.add(attempt.format);
    }
  }

  /**
   * Check if we should continue retrying
   * Returns false when all required formats found
   *
   * @param {Array} requiredFormats - ['QRCode', 'Code128']
   * @returns {boolean} - true if should continue
   */
  shouldContinueRetry(requiredFormats) {
    if (!requiredFormats || requiredFormats.length === 0) {
      return false;
    }

    for (const format of requiredFormats) {
      if (!this.foundFormats.has(format)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get next scale to try for ROI decoding
   *
   * @param {Array} requiredFormats - Formats still needed
   * @returns {number|null} - Next scale or null if all done
   */
  getNextROIScale(requiredFormats) {
    if (!this.shouldContinueRetry(requiredFormats)) {
      return null;
    }

    for (const scale of RetryController.CONFIG.ROI_SCALE_SEQUENCE) {
      if (!this.attemptedScales.has(scale)) {
        return scale;
      }
    }

    return null;
  }

  /**
   * Get next scale to try for full-page fallback
   *
   * @returns {number|null}
   */
  getNextFullPageScale() {
    for (const scale of RetryController.CONFIG.FULLPAGE_SCALE_SEQUENCE) {
      if (!this.attemptedScales.has(scale)) {
        return scale;
      }
    }

    return null;
  }

  /**
   * Check if rotation should be attempted
   *
   * @returns {boolean}
   */
  shouldRotate() {
    return RetryController.CONFIG.ROTATION_ENABLED;
  }

  /**
   * Get rotation angle in degrees
   *
   * @returns {number}
   */
  getRotationDegrees() {
    return RetryController.CONFIG.ROTATION_DEGREES;
  }

  /**
   * Get summary of all attempts
   *
   * @returns {Object}
   */
  getSummary() {
    return {
      totalAttempts: this.attempts.length,
      scalesUsed: Array.from(this.attemptedScales).sort((a, b) => a - b),
      formatsFound: Array.from(this.foundFormats),
      rotatedAttempts: this.attempts.filter((a) => a.rotated).length,
      successfulAttempts: this.attempts.filter((a) => a.success).length,
    };
  }

  /**
   * Reset controller state
   */
  reset() {
    this.attempts = [];
    this.attemptedScales.clear();
    this.foundFormats.clear();
  }
}
