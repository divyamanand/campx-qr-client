/**
 * ResultAggregator - Aggregates scan results across multiple attempts
 *
 * Responsibilities:
 * - Collect results from multiple decode attempts
 * - Deduplicate codes
 * - Track best results
 * - Determine if page processing should stop
 * - Format final result
 */
export class ResultAggregator {
  constructor(pageNumber, requiredFormats = []) {
    this.pageNumber = pageNumber;
    this.requiredFormats = requiredFormats || [];
    this.codes = []; // Deduplicated codes
    this.rawAttempts = []; // All decode attempts
    this.bestAttempt = null;
    this.isComplete = false;
  }

  /**
   * Add codes from a decode attempt
   *
   * @param {Array} codes - Array of { data, format, position }
   * @param {Object} metadata - { scale, rotated, roiLabel }
   */
  addCodes(codes, metadata) {
    if (!codes || codes.length === 0) {
      return;
    }

    // Record attempt
    this.rawAttempts.push({
      codes,
      ...metadata,
      timestamp: Date.now(),
    });

    // Deduplicate and add codes
    codes.forEach((code) => {
      const isDuplicate = this.codes.some(
        (existing) =>
          existing.data === code.data && existing.format === code.format
      );

      if (!isDuplicate) {
        this.codes.push(code);
      }
    });

    // Track best attempt (most codes)
    if (!this.bestAttempt || codes.length > this.bestAttempt.codes.length) {
      this.bestAttempt = {
        codes: [...codes],
        ...metadata,
      };
    }

    // Check if all required formats found
    this.updateCompletionStatus();
  }

  /**
   * Update completion status based on found codes
   * Page is complete when all required formats are found
   */
  updateCompletionStatus() {
    if (this.requiredFormats.length === 0) {
      // No requirements = any success is complete
      this.isComplete = this.codes.length > 0;
      return;
    }

    // Check if all required formats are present
    const foundFormats = new Set(this.codes.map((c) => c.format));
    const allFound = this.requiredFormats.every((fmt) => foundFormats.has(fmt));

    this.isComplete = allFound && this.codes.length >= this.requiredFormats.length;
  }

  /**
   * Check if we should stop scanning this page
   * Stops when all required codes found or no hope of finding them
   *
   * @param {RetryController} retryController - Retry state
   * @returns {boolean} - true if should stop scanning
   */
  shouldStopScanning(retryController) {
    // If all required formats found, stop
    if (this.isComplete) {
      return true;
    }

    // If no more retries possible and we have some codes, stop
    if (
      retryController &&
      !retryController.shouldContinueRetry(this.requiredFormats)
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get all found codes (deduplicated)
   *
   * @returns {Array}
   */
  getCodes() {
    return this.codes;
  }

  /**
   * Get codes by format
   *
   * @param {string} format - Format to filter by
   * @returns {Array}
   */
  getCodesByFormat(format) {
    return this.codes.filter((c) => c.format === format);
  }

  /**
   * Check if specific format was found
   *
   * @param {string} format
   * @returns {boolean}
   */
  hasFormat(format) {
    return this.codes.some((c) => c.format === format);
  }

  /**
   * Get final result object
   *
   * @returns {Object} - Formatted result
   */
  getResult() {
    return {
      pageNumber: this.pageNumber,
      success: this.codes.length > 0,
      codes: this.codes,
      foundFormats: Array.from(new Set(this.codes.map((c) => c.format))),
      isComplete: this.isComplete,
      totalAttempts: this.rawAttempts.length,
      totalDecodedCodes: this.codes.length,
      requiredFormats: this.requiredFormats,
      missingFormats: this.requiredFormats.filter(
        (fmt) => !this.hasFormat(fmt)
      ),
    };
  }

  /**
   * Get summary of decoding process
   *
   * @returns {Object}
   */
  getSummary() {
    const result = this.getResult();
    return {
      ...result,
      scalesUsed: Array.from(
        new Set(this.rawAttempts.map((a) => a.scale))
      ).sort((a, b) => a - b),
      roiAttempts: this.rawAttempts.filter((a) => a.roiLabel),
      fullPageAttempts: this.rawAttempts.filter((a) => !a.roiLabel),
    };
  }
}
