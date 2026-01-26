/**
 * OptimizationManager - Performance optimization for batch PDF processing
 *
 * Handles:
 * - Parallel processing with concurrency limits
 * - Memory management (garbage collection hints)
 * - Resource pooling
 * - Performance monitoring
 */
export class OptimizationManager {
  constructor(options = {}) {
    this.maxConcurrentFiles = options.maxConcurrentFiles || 3;
    this.maxConcurrentPages = options.maxConcurrentPages || 5;
    this.enableMemoryMonitoring = options.enableMemoryMonitoring ?? true;
    this.gcInterval = options.gcInterval || 10; // Run GC every N pages

    this.fileQueue = [];
    this.pageQueue = [];
    this.activeFiles = 0;
    this.activePages = 0;
    this.processedPages = 0;

    this.metrics = {
      startTime: Date.now(),
      totalFiles: 0,
      totalPages: 0,
      completedPages: 0,
      failedPages: 0,
    };
  }

  /**
   * Process files with concurrency limit
   */
  async processFilesSequentially(files, processorFn) {
    this.metrics.totalFiles = files.length;

    const results = [];
    const queue = [...files];

    while (queue.length > 0) {
      // Process up to maxConcurrentFiles in parallel
      const batch = queue.splice(0, this.maxConcurrentFiles);
      const promises = batch.map((file) => processorFn(file));

      try {
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      } catch (err) {
        console.error("Error processing file batch:", err);
        results.push(...batch.map((file) => ({ file, error: err.message })));
      }

      // Memory management
      if (this.enableMemoryMonitoring) {
        this.suggestGC();
      }
    }

    return results;
  }

  /**
   * Process pages with concurrency limit
   */
  async processPagesSequentially(pages, processorFn) {
    this.metrics.totalPages = pages.length;

    const results = [];
    const queue = [...pages];
    let batchIndex = 0;

    while (queue.length > 0) {
      // Process up to maxConcurrentPages in parallel
      const batch = queue.splice(0, this.maxConcurrentPages);
      const promises = batch.map((page, idx) => processorFn(page, batchIndex * this.maxConcurrentPages + idx));

      try {
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
        this.metrics.completedPages += batchResults.filter((r) => !r.error).length;
        this.metrics.failedPages += batchResults.filter((r) => r.error).length;
      } catch (err) {
        console.error("Error processing page batch:", err);
        this.metrics.failedPages += batch.length;
      }

      // Memory management
      this.processedPages += batch.length;
      if (this.processedPages % this.gcInterval === 0) {
        this.suggestGC();
      }

      batchIndex++;
    }

    return results;
  }

  /**
   * Suggest garbage collection
   */
  suggestGC() {
    if (global && typeof global.gc === "function") {
      global.gc();
    } else if (window && typeof window.gc === "function") {
      window.gc();
    }
    // Browser doesn't expose GC, but we can help by:
    // - Clearing caches
    // - Releasing references
    // - Triggering memory cleanup
  }

  /**
   * Get memory usage estimate (if available)
   */
  getMemoryUsage() {
    if (performance && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        usagePercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100,
      };
    }
    return null;
  }

  /**
   * Monitor memory pressure and adjust concurrency
   */
  adjustConcurrency() {
    const memory = this.getMemoryUsage();
    if (!memory) return;

    if (memory.usagePercent > 85) {
      this.maxConcurrentPages = Math.max(1, this.maxConcurrentPages - 1);
      console.warn(`High memory usage (${memory.usagePercent.toFixed(1)}%), reducing concurrency to ${this.maxConcurrentPages}`);
    } else if (memory.usagePercent < 60 && this.maxConcurrentPages < 5) {
      this.maxConcurrentPages = Math.min(5, this.maxConcurrentPages + 1);
      console.log(`Low memory usage, increasing concurrency to ${this.maxConcurrentPages}`);
    }
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    const elapsed = Date.now() - this.metrics.startTime;

    return {
      ...this.metrics,
      elapsedTime: elapsed,
      averageTimePerPage: this.metrics.completedPages > 0 ? elapsed / this.metrics.completedPages : 0,
      averageTimePerFile: this.metrics.totalFiles > 0 ? elapsed / this.metrics.totalFiles : 0,
      successRate: this.metrics.totalPages > 0 ? (this.metrics.completedPages / this.metrics.totalPages) * 100 : 0,
      memory: this.getMemoryUsage(),
    };
  }

  /**
   * Reset metrics
   */
  reset() {
    this.fileQueue = [];
    this.pageQueue = [];
    this.activeFiles = 0;
    this.activePages = 0;
    this.processedPages = 0;

    this.metrics = {
      startTime: Date.now(),
      totalFiles: 0,
      totalPages: 0,
      completedPages: 0,
      failedPages: 0,
    };
  }
}

/**
 * Batch processing utility for optimal throughput
 */
export class BatchProcessor {
  constructor(batchSize = 10) {
    this.batchSize = batchSize;
  }

  /**
   * Split items into batches
   */
  createBatches(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }

  /**
   * Process items with backpressure handling
   */
  async processBatches(items, processorFn) {
    const batches = this.createBatches(items);
    const results = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      try {
        const batchResults = await Promise.all(batch.map((item, idx) => processorFn(item, batchIdx * this.batchSize + idx)));

        results.push(...batchResults);

        // Check memory after each batch
        if (performance && performance.memory) {
          const usage = (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100;
          if (usage > 90) {
            console.warn(`High memory after batch ${batchIdx}, adding delay`);
            await this.delay(100);
          }
        }
      } catch (err) {
        console.error(`Error processing batch ${batchIdx}:`, err);
        results.push(...batch.map(() => ({ error: err.message })));
      }
    }

    return results;
  }

  /**
   * Delay utility for throttling
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Cache for deduplication and reuse
 */
export class ScanCache {
  constructor(maxSize = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Generate cache key for image
   */
  generateKey(blob, scale, rotated) {
    return `${blob.size}-${scale}-${rotated}`;
  }

  /**
   * Get from cache
   */
  get(blob, scale, rotated) {
    const key = this.generateKey(blob, scale, rotated);
    if (this.cache.has(key)) {
      this.hits++;
      return this.cache.get(key);
    }
    this.misses++;
    return null;
  }

  /**
   * Set in cache
   */
  set(blob, scale, rotated, result) {
    const key = this.generateKey(blob, scale, rotated);

    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, result);
  }

  /**
   * Get cache stats
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      total,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
