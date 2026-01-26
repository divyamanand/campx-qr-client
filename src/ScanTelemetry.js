/**
 * ScanTelemetry - Comprehensive logging and performance tracking for barcode scanning
 *
 * Tracks:
 * - Detection performance (positions found, confidence)
 * - ROI extraction metrics
 * - Decode attempts and success rates
 * - Performance timings
 * - Retry patterns
 * - Memory usage
 */
export class ScanTelemetry {
  constructor() {
    this.events = [];
    this.startTime = Date.now();
    this.pageMetrics = {};
    this.sessionMetrics = {
      totalPages: 0,
      totalAttempts: 0,
      totalCodesCound: 0,
      totalTime: 0,
    };
  }

  /**
   * Log a telemetry event
   */
  event(type, message, data = {}) {
    const event = {
      id: `${type}-${Date.now()}-${Math.random()}`,
      type,
      message,
      timestamp: Date.now(),
      elapsed: Date.now() - this.startTime,
      data,
    };

    this.events.push(event);
    console.log(`[${type}] ${message}`, data);

    return event.id;
  }

  /**
   * Start page metrics collection
   */
  startPage(pageNumber) {
    if (!this.pageMetrics[pageNumber]) {
      this.pageMetrics[pageNumber] = {
        pageNumber,
        startTime: Date.now(),
        phases: {},
        attempts: [],
        result: null,
      };
    }

    return this.pageMetrics[pageNumber];
  }

  /**
   * Record phase timing
   */
  recordPhase(pageNumber, phaseName, duration) {
    const page = this.pageMetrics[pageNumber];
    if (page) {
      page.phases[phaseName] = {
        name: phaseName,
        duration,
        startTime: Date.now() - duration,
      };
    }
  }

  /**
   * Record an attempt
   */
  recordAttempt(pageNumber, attempt) {
    const page = this.pageMetrics[pageNumber];
    if (page) {
      page.attempts.push({
        ...attempt,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Record page result
   */
  recordPageResult(pageNumber, result) {
    const page = this.pageMetrics[pageNumber];
    if (page) {
      page.result = result;
      page.endTime = Date.now();
      page.duration = page.endTime - page.startTime;

      // Update session metrics
      this.sessionMetrics.totalPages++;
      this.sessionMetrics.totalAttempts += result.totalAttempts || 0;
      this.sessionMetrics.totalCodesCound += result.codes?.length || 0;
    }
  }

  /**
   * Get detection metrics
   */
  getDetectionMetrics(pageNumber) {
    const page = this.pageMetrics[pageNumber];
    if (!page || !page.result) return null;

    return {
      detectionPhaseTime: page.phases.detection?.duration || 0,
      codesDetected: page.result.codes?.length || 0,
      formats: page.result.foundFormats || [],
      confidence: this.calculateConfidence(page.result),
    };
  }

  /**
   * Get ROI metrics
   */
  getROIMetrics(pageNumber) {
    const page = this.pageMetrics[pageNumber];
    if (!page || !page.phases.roi) return null;

    const roiAttempts = page.attempts.filter((a) => a.roiLabel);
    return {
      roiCount: new Set(roiAttempts.map((a) => a.roiLabel)).size,
      decodePhaseTime: page.phases.roi?.duration || 0,
      successfulROIs: roiAttempts.filter((a) => a.success).length,
      rotationAttempts: roiAttempts.filter((a) => a.rotated).length,
    };
  }

  /**
   * Get retry metrics
   */
  getRetryMetrics(pageNumber) {
    const page = this.pageMetrics[pageNumber];
    if (!page) return null;

    const scalesUsed = new Set(page.attempts.map((a) => a.scale));
    const successfulAttempts = page.attempts.filter((a) => a.success);

    return {
      totalAttempts: page.attempts.length,
      successfulAttempts: successfulAttempts.length,
      scalesUsed: Array.from(scalesUsed).sort((a, b) => a - b),
      scaleCount: scalesUsed.size,
      firstSuccessAttempt: successfulAttempts.length > 0 ? page.attempts.indexOf(successfulAttempts[0]) + 1 : -1,
      averageAttemptsPerScale: page.attempts.length / (scalesUsed.size || 1),
    };
  }

  /**
   * Get performance metrics for a page
   */
  getPagePerformance(pageNumber) {
    const page = this.pageMetrics[pageNumber];
    if (!page) return null;

    return {
      pageNumber,
      totalTime: page.duration,
      detectionTime: page.phases.detection?.duration || 0,
      decodeTime: page.phases.roi?.duration || 0,
      fallbackTime: page.phases.fallback?.duration || 0,
      codesFound: page.result?.codes?.length || 0,
      success: page.result?.success || false,
      isComplete: page.result?.isComplete || false,
    };
  }

  /**
   * Get session summary
   */
  getSessionSummary() {
    const pageNumbers = Object.keys(this.pageMetrics).map(Number);
    const pages = pageNumbers.map((p) => this.pageMetrics[p]);

    const totalDuration = pages.reduce((sum, p) => sum + (p.duration || 0), 0);
    const successfulPages = pages.filter((p) => p.result?.success).length;
    const completePages = pages.filter((p) => p.result?.isComplete).length;

    return {
      totalPages: this.sessionMetrics.totalPages,
      successfulPages,
      completePages,
      partialPages: successfulPages - completePages,
      failedPages: this.sessionMetrics.totalPages - successfulPages,
      totalTime: totalDuration,
      averageTimePerPage: totalDuration / (this.sessionMetrics.totalPages || 1),
      totalAttempts: this.sessionMetrics.totalAttempts,
      totalCodes: this.sessionMetrics.totalCodesCound,
      averageCodesPerPage: this.sessionMetrics.totalCodesCound / (this.sessionMetrics.totalPages || 1),
      averageAttemptsPerPage: this.sessionMetrics.totalAttempts / (this.sessionMetrics.totalPages || 1),
    };
  }

  /**
   * Get all events for debugging
   */
  getAllEvents() {
    return this.events;
  }

  /**
   * Get events filtered by type
   */
  getEventsByType(type) {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Export telemetry as JSON for analysis
   */
  export() {
    return {
      session: this.getSessionSummary(),
      pages: Object.fromEntries(
        Object.entries(this.pageMetrics).map(([num, page]) => [
          num,
          {
            performance: this.getPagePerformance(parseInt(num)),
            detection: this.getDetectionMetrics(parseInt(num)),
            roi: this.getROIMetrics(parseInt(num)),
            retry: this.getRetryMetrics(parseInt(num)),
            events: this.events.filter((e) => e.data.pageNumber === parseInt(num)),
          },
        ])
      ),
    };
  }

  /**
   * Calculate confidence score (0-100)
   */
  calculateConfidence(result) {
    if (!result.success) return 0;
    if (result.isComplete) return 100;
    if (result.missingFormats.length === 0) return 90;
    return Math.max(0, 50 - result.missingFormats.length * 20);
  }

  /**
   * Reset telemetry
   */
  reset() {
    this.events = [];
    this.startTime = Date.now();
    this.pageMetrics = {};
    this.sessionMetrics = {
      totalPages: 0,
      totalAttempts: 0,
      totalCodesCound: 0,
      totalTime: 0,
    };
  }
}

/**
 * Global telemetry instance
 */
export const telemetry = new ScanTelemetry();
