/**
 * ElectronFileLogger - Stores logs as CSV files on disk
 * Uses Electron's ipcRenderer to communicate with main process
 * No logs stored in memory - writes directly to disk
 */
export class ElectronFileLogger {
  constructor(logsDir, fileName) {
    this.logsDir = logsDir;
    this.fileName = fileName || `batch-${Date.now()}.csv`;
    this.filePath = `${logsDir}/${this.fileName}`;
    this.initialized = false;
  }

  /**
   * Initialize logger and write CSV header
   */
  async initialize() {
    try {
      if (!window.electronAPI?.fs) {
        throw new Error("Electron File System API not available");
      }

      // Create logs directory if it doesn't exist
      await window.electronAPI.fs.ensureDir(this.logsDir);

      // Write CSV header
      const header =
        "Timestamp,Type,Message,FileName,PageNumber,Scale,Rotated,AttemptCount\n";
      await window.electronAPI.fs.writeFile(this.filePath, header);

      this.initialized = true;
      console.log(`ElectronFileLogger initialized: ${this.filePath}`);
    } catch (err) {
      console.error("Failed to initialize ElectronFileLogger:", err);
      throw err;
    }
  }

  /**
   * Log an entry directly to CSV file
   */
  async log(logEntry) {
    if (!this.initialized) {
      console.warn("ElectronFileLogger not initialized");
      return;
    }

    const {
      type = "info",
      message,
      fileName = "",
      pageNumber = "",
      scale = "",
      rotated = false,
      attemptCount = "",
      timestamp = Date.now(),
    } = logEntry;

    // Escape CSV values
    const escapeCsv = (val) => {
      if (val === "" || val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const time = new Date(timestamp).toISOString();
    const csvLine = `${time},${escapeCsv(type)},${escapeCsv(message)},${escapeCsv(fileName)},${escapeCsv(pageNumber)},${escapeCsv(scale)},${rotated},${escapeCsv(attemptCount)}\n`;

    try {
      // Append to file
      await window.electronAPI.fs.appendFile(this.filePath, csvLine);
    } catch (err) {
      console.error("Failed to write log:", err);
    }
  }

  /**
   * Log batch completion
   */
  async logBatchComplete(batchNumber, filesProcessed, completedDir) {
    if (!this.initialized) return;

    await this.log({
      type: "batch-complete",
      message: `Batch ${batchNumber} Complete | Files: ${filesProcessed} | Location: ${completedDir}`,
    });
  }

  /**
   * Get the log file path
   */
  getLogFilePath() {
    return this.filePath;
  }

  /**
   * Close logger (for compatibility)
   */
  async close() {
    console.log("ElectronFileLogger closed. Logs saved to:", this.filePath);
    return { filePath: this.filePath, initialized: this.initialized };
  }
}

export function createElectronFileLogger(logsDir, fileName) {
  return new ElectronFileLogger(logsDir, fileName);
}
