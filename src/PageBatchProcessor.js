/**
 * PageBatchProcessor - Processes PDF pages in parallel batches
 *
 * Capabilities:
 * - Process N pages concurrently (default: 5)
 * - Sequential batch execution (wait for batch to complete before next)
 * - Progress tracking
 * - Error isolation (one page failure doesn't block others)
 * - Memory-aware processing
 */
export class PageBatchProcessor {
  /**
   * @param {number} batchSize - Pages per batch (default: 5)
   * @param {Object} options - Additional options
   */
  constructor(batchSize = 5, options = {}) {
    this.batchSize = batchSize;
    this.onBatchStart = options.onBatchStart || null;
    this.onBatchComplete = options.onBatchComplete || null;
    this.onPageComplete = options.onPageComplete || null;
    this.onError = options.onError || null;

    this.stats = {
      totalPages: 0,
      completedPages: 0,
      failedPages: 0,
      totalBatches: 0,
      completedBatches: 0,
      startTime: null,
      endTime: null,
    };
  }

  /**
   * Create batches from page numbers
   */
  createBatches(pageNumbers) {
    const batches = [];
    for (let i = 0; i < pageNumbers.length; i += this.batchSize) {
      batches.push(pageNumbers.slice(i, i + this.batchSize));
    }
    return batches;
  }

  /**
   * Process pages in parallel batches
   *
   * @param {Array} pageNumbers - Array of page numbers [1, 2, 3, ...]
   * @param {Function} processFn - Function to process a page: (pageNum) => Promise<result>
   * @param {number} totalPages - Total pages (for progress reporting)
   * @returns {Promise<Array>} - Results array
   */
  async processInBatches(pageNumbers, processFn, totalPages) {
    this.stats.totalPages = pageNumbers.length;
    this.stats.startTime = Date.now();
    this.stats.completedPages = 0;
    this.stats.failedPages = 0;

    const batches = this.createBatches(pageNumbers);
    this.stats.totalBatches = batches.length;
    this.stats.completedBatches = 0;

    const results = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      // Notify batch start
      if (this.onBatchStart) {
        this.onBatchStart({
          batchIndex: batchIdx + 1,
          totalBatches: batches.length,
          pageNumbers: batch,
          batchSize: batch.length,
        });
      }

      // Process all pages in batch in parallel
      const batchPromises = batch.map((pageNum) =>
        this.processPageWithErrorHandling(pageNum, processFn, totalPages)
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Track stats
      this.stats.completedBatches++;
      const successCount = batchResults.filter((r) => r.success).length;
      const failureCount = batchResults.filter((r) => !r.success).length;

      this.stats.completedPages += successCount;
      this.stats.failedPages += failureCount;

      // Notify batch complete
      if (this.onBatchComplete) {
        this.onBatchComplete({
          batchIndex: batchIdx + 1,
          totalBatches: batches.length,
          batchResults,
          successCount,
          failureCount,
          completedPages: this.stats.completedPages,
          totalPages: this.stats.totalPages,
        });
      }
    }

    this.stats.endTime = Date.now();
    return results;
  }

  /**
   * Process single page with error handling
   */
  async processPageWithErrorHandling(pageNum, processFn, totalPages) {
    try {
      const result = await processFn(pageNum);

      // Notify page complete
      if (this.onPageComplete) {
        this.onPageComplete({
          pageNumber: pageNum,
          totalPages,
          success: true,
          result,
        });
      }

      return {
        pageNumber: pageNum,
        success: true,
        result,
      };
    } catch (err) {
      // Notify error
      if (this.onError) {
        this.onError({
          pageNumber: pageNum,
          error: err.message,
        });
      }

      // Notify page complete (failed)
      if (this.onPageComplete) {
        this.onPageComplete({
          pageNumber: pageNum,
          success: false,
          error: err.message,
        });
      }

      return {
        pageNumber: pageNum,
        success: false,
        error: err.message,
      };
    }
  }

  /**
   * Get processing statistics
   */
  getStats() {
    const elapsed = this.stats.endTime
      ? this.stats.endTime - this.stats.startTime
      : Date.now() - (this.stats.startTime || Date.now());

    return {
      ...this.stats,
      elapsedTime: elapsed,
      averageTimePerPage: this.stats.completedPages > 0 ? elapsed / this.stats.completedPages : 0,
      successRate:
        this.stats.totalPages > 0
          ? ((this.stats.completedPages / this.stats.totalPages) * 100).toFixed(1)
          : 0,
      pagesPerSecond:
        elapsed > 0 ? ((this.stats.completedPages / elapsed) * 1000).toFixed(2) : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalPages: 0,
      completedPages: 0,
      failedPages: 0,
      totalBatches: 0,
      completedBatches: 0,
      startTime: null,
      endTime: null,
    };
  }
}

/**
 * Specialized batch processor for PDF pages with progress tracking
 */
export class PDFPageBatchProcessor extends PageBatchProcessor {
  constructor(batchSize = 5) {
    super(batchSize, {
      onBatchStart: (data) => this.logBatchStart(data),
      onBatchComplete: (data) => this.logBatchComplete(data),
      onPageComplete: (data) => this.logPageComplete(data),
      onError: (data) => this.logError(data),
    });

    this.logs = [];
  }

  logBatchStart(data) {
    const log = `[BATCH ${data.batchIndex}/${data.totalBatches}] Starting pages ${data.pageNumbers[0]}-${data.pageNumbers[data.pageNumbers.length - 1]}`;
    this.logs.push({
      type: "batch_start",
      message: log,
      data,
    });
    console.log(log);
  }

  logBatchComplete(data) {
    const log = `[BATCH ${data.batchIndex}/${data.totalBatches}] Complete: ${data.successCount}/${data.batchResults.length} succeeded`;
    this.logs.push({
      type: "batch_complete",
      message: log,
      data,
    });
    console.log(log);
  }

  logPageComplete(data) {
    const status = data.success ? "✓" : "✗";
    const log = `[PAGE ${data.pageNumber}/${data.totalPages}] ${status}`;
    this.logs.push({
      type: "page_complete",
      message: log,
      data,
    });
  }

  logError(data) {
    const log = `[PAGE ${data.pageNumber}] ERROR: ${data.error}`;
    this.logs.push({
      type: "error",
      message: log,
      data,
    });
    console.error(log);
  }

  /**
   * Get all logs
   */
  getLogs() {
    return this.logs;
  }

  /**
   * Export logs for debugging
   */
  exportLogs() {
    return {
      logs: this.logs,
      stats: this.getStats(),
    };
  }
}
