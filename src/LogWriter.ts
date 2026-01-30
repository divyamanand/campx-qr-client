interface LogEntry {
  success: boolean;
  errors: string[];
  codes: Record<string, string>[];
}

interface TransformedLogs {
  [pageNumber: string]: LogEntry;
}

interface AllLogs {
  [fileName: string]: TransformedLogs;
}

interface VerificationResult {
  filesToRetry: Record<string, number[]>;
  bestCounts: Record<string, Record<string, number>>;
}

/**
 * LogWriter - Handles reading and writing logs to logs.json using File System Access API
 *
 * This class provides static methods for managing application logs in a persistent
 * logs.json file. It transforms processing results from PDFManager into a standardized
 * log format and handles file system operations.
 */
class LogWriter {
  /**
   * Opens a directory picker dialog allowing the user to select the logs directory
   *
   * @async
   * @returns {Promise<FileSystemDirectoryHandle>} Handle to the selected directory
   * @throws {Error} If user cancels the picker or browser doesn't support File System Access API
   *
   * @example
   * const dirHandle = await LogWriter.selectLogsDirectory();
   */
  static async selectLogsDirectory(): Promise<FileSystemDirectoryHandle> {
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'desktop'
      });
      return dirHandle;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Directory picker was cancelled by user');
      }
      throw new Error(`Failed to select logs directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Reads the logs.json file from the specified directory
   *
   * @async
   * @param {FileSystemDirectoryHandle} dirHandle - Handle to the directory containing logs.json
   * @returns {Promise<AllLogs>} Parsed logs object, or empty object {} if file doesn't exist
   * @throws {Error} If file read fails or JSON parsing fails
   *
   * @example
   * const logs = await LogWriter.readLogsFile(dirHandle);
   */
  static async readLogsFile(dirHandle: FileSystemDirectoryHandle): Promise<AllLogs> {
    try {
      const fileHandle = await dirHandle.getFileHandle('logs.json', { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();

      if (!text.trim()) {
        return {};
      }

      return JSON.parse(text);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        return {};
      }
      throw new Error(`Failed to read logs.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Writes the logs object to logs.json in the specified directory
   *
   * @async
   * @param {FileSystemDirectoryHandle} dirHandle - Handle to the directory for logs.json
   * @param {AllLogs} logs - Logs object to write to file
   * @returns {Promise<void>}
   * @throws {Error} If file write fails
   *
   * @example
   * await LogWriter.writeLogsFile(dirHandle, logs);
   */
  static async writeLogsFile(dirHandle: FileSystemDirectoryHandle, logs: AllLogs): Promise<void> {
    try {
      const fileHandle = await dirHandle.getFileHandle('logs.json', { create: true });
      const writable = await fileHandle.createWritable();

      const jsonString = JSON.stringify(logs, null, 2);
      await writable.write(jsonString);
      await writable.close();
    } catch (error) {
      throw new Error(`Failed to write logs.json: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Transforms a PDFManager.processFile() result into the standardized log format
   *
   * The input format contains page-level results with processing metadata.
   * The output format contains only the log-relevant data (success status, errors, codes).
   *
   * @param {Object} fileResult - Result object from PDFManager.processFile()
   * @returns {TransformedLogs} Transformed log object with format:
   *   {
   *     "pageNumber": {
   *       success: boolean,
   *       errors: string[],
   *       codes: Array<{[format]: string}>
   *     }
   *   }
   *
   * @example
   * const logData = LogWriter.transformResults(fileResult);
   * // Returns: { "1": { success: true, errors: [], codes: [{QRCode: "ABC123"}] }, ... }
   */
  static transformResults(fileResult: any): TransformedLogs {
    const transformedLogs: TransformedLogs = {};

    if (!fileResult || !fileResult.results) {
      return transformedLogs;
    }

    Object.entries(fileResult.results).forEach(([pageNumber, pageResult]: [string, any]) => {
      const logEntry: LogEntry = {
        success: pageResult.success || false,
        errors: [],
        codes: []
      };

      if (pageResult.result) {
        // Handle success case
        if (pageResult.result.success && pageResult.result.codes) {
          logEntry.codes = pageResult.result.codes.map((code: any) => ({
            [code.format]: code.data
          }));
        }

        // Handle error case
        if (pageResult.result.error) {
          logEntry.errors.push(pageResult.result.error);
        }
      }

      transformedLogs[pageNumber] = logEntry;
    });

    return transformedLogs;
  }

  /**
   * Main method that orchestrates reading, transforming, appending, and writing logs
   *
   * This is the primary entry point for logging file processing results.
   * It handles the complete workflow: read existing logs, transform new results,
   * append to existing file logs, and write back to disk.
   *
   * @async
   * @param {FileSystemDirectoryHandle} dirHandle - Handle to the directory containing logs.json
   * @param {string} fileName - Name of the processed file (used as log key)
   * @param {Object} fileResult - Result object from PDFManager.processFile()
   * @returns {Promise<AllLogs>} The updated complete logs object
   * @throws {Error} If any step of the process fails
   *
   * @example
   * const dirHandle = await LogWriter.selectLogsDirectory();
   * const updatedLogs = await LogWriter.appendFileResults(
   *   dirHandle,
   *   'document.pdf',
   *   pdfProcessingResult
   * );
   */
  static async appendFileResults(dirHandle: FileSystemDirectoryHandle, fileName: string, fileResult: any): Promise<AllLogs> {
    try {
      // Step 1: Read existing logs
      const logs = await LogWriter.readLogsFile(dirHandle);

      // Step 2: Transform the new results
      const transformedResults = LogWriter.transformResults(fileResult);

      // Step 3: Append/update the file entry in logs
      logs[fileName] = transformedResults;

      // Step 4: Write updated logs back to file
      await LogWriter.writeLogsFile(dirHandle, logs);

      return logs;
    } catch (error) {
      throw new Error(`Failed to append file results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verification function to identify pages that need to be retried
   *
   * This function analyzes all processed files to find the maximum (best) count
   * of codes per page number across all files. Then identifies files where the
   * count is less than the best count, indicating potential processing failures.
   *
   * @async
   * @param {FileSystemDirectoryHandle} dirHandle - Handle to the directory containing logs.json
   * @returns {Promise<VerificationResult>} Object with structure:
   *   {
   *     filesToRetry: { fileName: [pageNumbers] },
   *     bestCounts: { pageNumber: { QRCode: count, Code128: count } }
   *   }
   * @throws {Error} If reading logs fails
   *
   * @example
   * const verification = await LogWriter.verifyAndGetRetryPages(dirHandle);
   * // Returns: {
   * //   filesToRetry: { 'doc1.pdf': [1, 3], 'doc2.pdf': [2] },
   * //   bestCounts: { '1': { QRCode: 2, Code128: 1 }, ... }
   * // }
   */
  static async verifyAndGetRetryPages(dirHandle: FileSystemDirectoryHandle): Promise<VerificationResult> {
    try {
      // Step 1: Read logs
      const logs = await LogWriter.readLogsFile(dirHandle);

      if (!logs || Object.keys(logs).length === 0) {
        return { filesToRetry: {}, bestCounts: {} };
      }

      // Step 2: Create bestCount dictionary to track maximum codes per page
      const bestCounts: Record<string, Record<string, number>> = {};

      // First pass: Find the maximum count for each page number
      Object.entries(logs).forEach(([fileName, fileLog]: [string, any]) => {
        Object.entries(fileLog).forEach(([pageNumber, pageData]: [string, any]) => {
          // Initialize page in bestCounts if not exists
          if (!bestCounts[pageNumber]) {
            bestCounts[pageNumber] = { QRCode: 0, Code128: 0 };
          }

          // Count codes by type for this page
          let qrCount = 0;
          let code128Count = 0;

          if (pageData.codes && Array.isArray(pageData.codes)) {
            pageData.codes.forEach((codeObj: any) => {
              if (codeObj.QRCode) qrCount++;
              if (codeObj.Code128) code128Count++;
            });
          }

          // Update best counts (maximum found so far)
          bestCounts[pageNumber].QRCode = Math.max(
            bestCounts[pageNumber].QRCode,
            qrCount
          );
          bestCounts[pageNumber].Code128 = Math.max(
            bestCounts[pageNumber].Code128,
            code128Count
          );
        });
      });

      // Step 3: Second pass - identify pages that need retry
      const filesToRetry: Record<string, number[]> = {};

      Object.entries(logs).forEach(([fileName, fileLog]: [string, any]) => {
        Object.entries(fileLog).forEach(([pageNumber, pageData]: [string, any]) => {
          // Count codes by type for this page
          let qrCount = 0;
          let code128Count = 0;

          if (pageData.codes && Array.isArray(pageData.codes)) {
            pageData.codes.forEach((codeObj: any) => {
              if (codeObj.QRCode) qrCount++;
              if (codeObj.Code128) code128Count++;
            });
          }

          // Check if counts mismatch the best counts
          const needsRetry =
            qrCount < bestCounts[pageNumber].QRCode ||
            code128Count < bestCounts[pageNumber].Code128;

          if (needsRetry) {
            if (!filesToRetry[fileName]) {
              filesToRetry[fileName] = [];
            }
            filesToRetry[fileName].push(parseInt(pageNumber));
          }
        });
      });

      // Sort page numbers for each file
      Object.keys(filesToRetry).forEach((fileName) => {
        filesToRetry[fileName].sort((a, b) => a - b);
      });

      return {
        filesToRetry,
        bestCounts,
      };
    } catch (error) {
      throw new Error(`Failed to verify and get retry pages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export { LogWriter };