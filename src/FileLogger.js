import { app } from "electron";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";

/**
 * FileLogger - Writes logs to a file instead of memory
 * Handles log rotation and file management
 */
export class FileLogger {
  constructor(logsDir = null) {
    // Default to app's user data directory
    this.logsDir = logsDir || path.join(app.getPath("userData"), "logs");
    this.currentLogFile = null;
    this.writeStream = null;
    this.sessionId = Date.now();
    this.initialized = false;
  }

  /**
   * Initialize the logger and create log file
   */
  async initialize() {
    try {
      // Ensure logs directory exists
      await fs.mkdir(this.logsDir, { recursive: true });

      // Create log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      this.currentLogFile = path.join(this.logsDir, `batch-process-${timestamp}.log`);

      // Create write stream
      this.writeStream = createWriteStream(this.currentLogFile, { flags: "a" });

      // Write session header
      this.writeLogDirect(`\n${"=".repeat(80)}\n`);
      this.writeLogDirect(`Session Started: ${new Date().toISOString()}\n`);
      this.writeLogDirect(`${"=".repeat(80)}\n`);

      this.initialized = true;
      console.log(`FileLogger initialized: ${this.currentLogFile}`);
    } catch (err) {
      console.error("Failed to initialize FileLogger:", err);
      throw err;
    }
  }

  /**
   * Write directly to stream (internal use)
   */
  writeLogDirect(text) {
    if (this.writeStream) {
      this.writeStream.write(text);
    }
  }

  /**
   * Log an entry
   */
  log(logEntry) {
    if (!this.initialized) {
      console.warn("FileLogger not initialized");
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

    const time = new Date(timestamp).toISOString();
    const fileInfo = fileName ? ` [${fileName}${pageNumber ? `:${pageNumber}` : ""}]` : "";
    const extraInfo = [];

    if (scale) extraInfo.push(`@${scale}x`);
    if (rotated) extraInfo.push("Rotated");
    if (attemptCount) extraInfo.push(`Attempt ${attemptCount}`);

    const extraStr = extraInfo.length > 0 ? ` (${extraInfo.join(", ")})` : "";
    const logLine = `${time} [${type.toUpperCase()}]${fileInfo} ${message}${extraStr}\n`;

    this.writeLogDirect(logLine);
  }

  /**
   * Log a batch completion
   */
  logBatchComplete(batchNumber, filesProcessed, filesMovedTo) {
    if (!this.initialized) return;

    const separator = "-".repeat(80);
    const logText = `${separator}\nBatch ${batchNumber} Complete\nFiles Processed: ${filesProcessed}\nMoved To: ${filesMovedTo}\n${separator}\n\n`;
    this.writeLogDirect(logText);
  }

  /**
   * Close the logger and finalize log file
   */
  async close() {
    return new Promise((resolve, reject) => {
      if (this.writeStream) {
        this.writeLogDirect(`\nSession Ended: ${new Date().toISOString()}\n`);
        this.writeLogDirect(`${"=".repeat(80)}\n\n`);

        this.writeStream.end((err) => {
          if (err) {
            console.error("Error closing log stream:", err);
            reject(err);
          } else {
            console.log("Log file closed:", this.currentLogFile);
            resolve(this.currentLogFile);
          }
        });
      } else {
        resolve(null);
      }
    });
  }

  /**
   * Get the current log file path
   */
  getLogFilePath() {
    return this.currentLogFile;
  }
}

/**
 * Factory function
 */
export function createFileLogger(logsDir = null) {
  return new FileLogger(logsDir);
}
