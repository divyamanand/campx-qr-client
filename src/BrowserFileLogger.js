/**
 * BrowserFileLogger - Browser-compatible version of FileLogger
 * Stores logs in localStorage and IndexedDB for persistence
 */
export class BrowserFileLogger {
  constructor(sessionId = null) {
    this.sessionId = sessionId || Date.now().toString();
    this.logs = [];
    this.storageKey = `batch-logs-${this.sessionId}`;
    this.initialized = false;
    this.maxLogsInMemory = 1000;
  }

  /**
   * Initialize the logger
   */
  async initialize() {
    try {
      // Load existing logs if any
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.logs = JSON.parse(stored);
      }

      // Write session header
      this.logs.unshift({
        timestamp: Date.now(),
        type: "info",
        message: "Session Started",
        sessionId: this.sessionId,
      });

      this.saveToStorage();
      this.initialized = true;
      console.log(`BrowserFileLogger initialized: ${this.sessionId}`);
    } catch (err) {
      console.error("Failed to initialize BrowserFileLogger:", err);
      throw err;
    }
  }

  /**
   * Log an entry
   */
  log(logEntry) {
    if (!this.initialized) {
      console.warn("BrowserFileLogger not initialized");
      return;
    }

    const {
      type = "info",
      message,
      fileName = null,
      pageNumber = null,
      scale = null,
      rotated = false,
      attemptCount = null,
      timestamp = Date.now(),
    } = logEntry;

    const entry = {
      timestamp,
      type,
      message,
      fileName,
      pageNumber,
      scale,
      rotated,
      attemptCount,
    };

    this.logs.push(entry);

    // Keep memory bounded
    if (this.logs.length > this.maxLogsInMemory) {
      this.logs = this.logs.slice(-this.maxLogsInMemory);
    }

    this.saveToStorage();
  }

  /**
   * Log batch completion
   */
  logBatchComplete(batchNumber, filesProcessed, filesMovedTo) {
    if (!this.initialized) return;

    this.log({
      type: "info",
      message: `Batch ${batchNumber} Complete | Processed: ${filesProcessed} | Moved to: ${filesMovedTo}`,
    });
  }

  /**
   * Save logs to localStorage
   */
  saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
    } catch (err) {
      console.error("Failed to save logs to storage:", err);
    }
  }

  /**
   * Get all logs
   */
  getLogs() {
    return [...this.logs];
  }

  /**
   * Export logs as text
   */
  exportAsText() {
    const lines = this.logs.map((log) => {
      const time = new Date(log.timestamp).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const fileInfo = log.fileName ? ` [${log.fileName}${log.pageNumber ? `:${log.pageNumber}` : ""}]` : "";
      const extraInfo = [];

      if (log.scale) extraInfo.push(`@${log.scale}x`);
      if (log.rotated) extraInfo.push("Rotated");
      if (log.attemptCount) extraInfo.push(`Attempt ${log.attemptCount}`);

      const extraStr = extraInfo.length > 0 ? ` (${extraInfo.join(", ")})` : "";
      return `${time} [${log.type.toUpperCase()}]${fileInfo} ${log.message}${extraStr}`;
    });

    return lines.join("\n");
  }

  /**
   * Export logs as JSON
   */
  exportAsJSON() {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Download logs as file
   */
  downloadAsFile(format = "txt") {
    const content = format === "json" ? this.exportAsJSON() : this.exportAsText();
    const blob = new Blob([content], {
      type: format === "json" ? "application/json" : "text/plain",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batch-logs-${this.sessionId}.${format === "json" ? "json" : "txt"}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Clear logs
   */
  clear() {
    this.logs = [];
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Close the logger
   */
  async close() {
    const logData = this.exportAsText();

    // Add session end marker
    this.log({
      type: "info",
      message: "Session Ended",
    });

    this.saveToStorage();
    console.log("BrowserFileLogger closed. Session ID:", this.sessionId);

    return {
      sessionId: this.sessionId,
      logsCount: this.logs.length,
      logText: logData,
    };
  }

  /**
   * Get session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Get logs count
   */
  getLogsCount() {
    return this.logs.length;
  }
}

/**
 * Factory function
 */
export function createBrowserFileLogger(sessionId = null) {
  return new BrowserFileLogger(sessionId);
}
