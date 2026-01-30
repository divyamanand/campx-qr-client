import { useCallback } from "react";
import { LogWriter } from "../LogWriter";

interface FormattedSummary {
  fileName: string;
  totalCodesCount: number;
  qrCodesCount: number;
  barcodesCount: number;
  codesOnEveryPage: number[];
  hasErrors: boolean;
}

interface SummarizerResult {
  summary: FormattedSummary[];
  verification: {
    filesToRetry: Record<string, number[]>;
    bestCounts: Record<string, Record<string, number>>;
  };
}

interface UseSummarizerReturn {
  summarizeLogs: () => Promise<SummarizerResult>;
  formatLogSummary: (fileName: string, fileLog: any) => FormattedSummary;
  exportSummary: (summary: FormattedSummary[]) => Promise<FormattedSummary[]>;
}

/**
 * useSummarizer - Custom hook for summarizing processing logs
 *
 * Single Responsibility: Handle log summarization and formatting
 * Separates summarization logic from processing logic (SRP)
 *
 * @param {FileSystemDirectoryHandle} logsDirectory - Directory handle from LogWriter.selectLogsDirectory()
 * @returns {UseSummarizerReturn} Object containing:
 *   - summarizeLogs: Function to read and format logs
 *   - formatLogSummary: Function to format individual log entries
 */
export const useSummarizer = (logsDirectory: FileSystemDirectoryHandle | null): UseSummarizerReturn => {
  /**
   * Format a single log entry into summary format
   * Aggregates page-level data into file-level summary
   * @param {string} fileName - Name of the file
   * @param {Object} fileLog - Log data for the file (page-level results)
   * @returns {FormattedSummary} Formatted summary object
   */
  const formatLogSummary = useCallback((fileName: string, fileLog: any): FormattedSummary => {
    let totalCodesCount = 0;
    let qrCodesCount = 0;
    let barcodesCount = 0;
    const codesOnEveryPage = [];
    let hasErrors = false;

    // Aggregate data from all pages
    Object.entries(fileLog).forEach(([pageNumber, pageData]) => {
      if (pageData.codes && Array.isArray(pageData.codes)) {
        const pageCodes = pageData.codes.length;
        codesOnEveryPage.push(pageCodes);
        totalCodesCount += pageCodes;

        // Count specific code types
        pageData.codes.forEach((codeObj) => {
          // QRCode is identified by the QRCode property
          if (codeObj.QRCode) {
            qrCodesCount++;
          }
          // Code128 is identified by the Code128 property (barcode)
          if (codeObj.Code128) {
            barcodesCount++;
          }
        });
      }

      if (!pageData.success || (pageData.errors && pageData.errors.length > 0)) {
        hasErrors = true;
      }
    });

    return {
      fileName,
      totalCodesCount,
      qrCodesCount,
      barcodesCount,
      codesOnEveryPage,
      hasErrors,
    };
  }, []);

  /**
   * Read and summarize logs from LogWriter
   * Also verifies logs and identifies pages that need retry
   * @returns {Promise<SummarizerResult>} Object containing:
   *   - summary: Array of formatted log summaries
   *   - verification: { filesToRetry, bestCounts }
   * @throws {Error} If logsDirectory is not set
   */
  const summarizeLogs = useCallback(async (): Promise<SummarizerResult> => {
    try {
      if (!logsDirectory) {
        throw new Error("Logs directory not selected. Please select a logs directory first.");
      }

      // Read logs from the selected directory using correct LogWriter method
      const logsData = await LogWriter.readLogsFile(logsDirectory);

      if (!logsData || Object.keys(logsData).length === 0) {
        console.warn("No logs found");
        return { summary: [], verification: { filesToRetry: {}, bestCounts: {} } };
      }

      // Transform the logs into summary format
      const summary = Object.entries(logsData).map(([fileName, fileLog]) => {
        return formatLogSummary(fileName, fileLog);
      });

      // Verify logs and get pages that need retry
      const verification = await LogWriter.verifyAndGetRetryPages(logsDirectory);

      // Display the summary in table format
      console.table(summary);

      // Log retry information if any pages need retry
      if (Object.keys(verification.filesToRetry).length > 0) {
        console.warn("Files with pages requiring retry:", verification.filesToRetry);
      }

      return { summary, verification };
    } catch (error) {
      console.error("Error summarizing logs:", error);
      throw error;
    }
  }, [logsDirectory, formatLogSummary]);

  /**
   * Export summary to a file or display
   * @param {FormattedSummary[]} summary - Summary data to export
   * @returns {Promise<FormattedSummary[]>}
   */
  const exportSummary = useCallback(async (summary: FormattedSummary[]): Promise<FormattedSummary[]> => {
    try {
      if (!summary || summary.length === 0) {
        console.warn("No summary data to export");
        return [];
      }

      // Could be extended to export to CSV, JSON, etc.
      // For now, just logging
      console.log("Summary ready for export:", summary);
      return summary;
    } catch (error) {
      console.error("Error exporting summary:", error);
      throw error;
    }
  }, []);

  return {
    summarizeLogs,
    formatLogSummary,
    exportSummary,
  };
};