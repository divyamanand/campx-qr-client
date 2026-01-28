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
  static async selectLogsDirectory() {
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'desktop'
      });
      return dirHandle;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Directory picker was cancelled by user');
      }
      throw new Error(`Failed to select logs directory: ${error.message}`);
    }
  }

  /**
   * Reads the logs.json file from the specified directory
   * 
   * @async
   * @param {FileSystemDirectoryHandle} dirHandle - Handle to the directory containing logs.json
   * @returns {Promise<Object>} Parsed logs object, or empty object {} if file doesn't exist
   * @throws {Error} If file read fails or JSON parsing fails
   * 
   * @example
   * const logs = await LogWriter.readLogsFile(dirHandle);
   */
  static async readLogsFile(dirHandle) {
    try {
      const fileHandle = await dirHandle.getFileHandle('logs.json', { create: false });
      const file = await fileHandle.getFile();
      const text = await file.text();
      
      if (!text.trim()) {
        return {};
      }
      
      return JSON.parse(text);
    } catch (error) {
      if (error.name === 'NotFoundError') {
        return {};
      }
      throw new Error(`Failed to read logs.json: ${error.message}`);
    }
  }

  /**
   * Writes the logs object to logs.json in the specified directory
   * 
   * @async
   * @param {FileSystemDirectoryHandle} dirHandle - Handle to the directory for logs.json
   * @param {Object} logs - Logs object to write to file
   * @returns {Promise<void>}
   * @throws {Error} If file write fails
   * 
   * @example
   * await LogWriter.writeLogsFile(dirHandle, logs);
   */
  static async writeLogsFile(dirHandle, logs) {
    try {
      const fileHandle = await dirHandle.getFileHandle('logs.json', { create: true });
      const writable = await fileHandle.createWritable();
      
      const jsonString = JSON.stringify(logs, null, 2);
      await writable.write(jsonString);
      await writable.close();
    } catch (error) {
      throw new Error(`Failed to write logs.json: ${error.message}`);
    }
  }

  /**
   * Transforms a PDFManager.processFile() result into the standardized log format
   * 
   * The input format contains page-level results with processing metadata.
   * The output format contains only the log-relevant data (success status, errors, codes).
   * 
   * @param {Object} fileResult - Result object from PDFManager.processFile()
   * @returns {Object} Transformed log object with format:
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
  static transformResults(fileResult) {
    const transformedLogs = {};

    if (!fileResult || !fileResult.results) {
      return transformedLogs;
    }

    Object.entries(fileResult.results).forEach(([pageNumber, pageResult]) => {
      const logEntry = {
        success: pageResult.success || false,
        errors: [],
        codes: []
      };

      if (pageResult.result) {
        // Handle success case
        if (pageResult.result.success && pageResult.result.codes) {
          logEntry.codes = pageResult.result.codes.map(code => ({
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
   * @returns {Promise<Object>} The updated complete logs object
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
  static async appendFileResults(dirHandle, fileName, fileResult) {
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
      throw new Error(`Failed to append file results: ${error.message}`);
    }
  }
}

export { LogWriter };
