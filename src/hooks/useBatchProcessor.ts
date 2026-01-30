import { useState } from "react";
import { createPDFManager } from "../PDFManager";
import { LogWriter } from "../LogWriter";

interface FileResult {
  fileName: string;
  success: boolean;
  totalPages: number;
  results: Record<string, unknown>;
  error: string | null;
}

interface BatchProgress {
  [fileName: string]: {
    status: "processing" | "completed" | "failed" | "queued";
    result: FileResult | null;
  };
}

interface FilePageProgress {
  [fileName: string]: {
    currentPage: number;
    totalPages: number;
  };
}

interface SummaryStats {
  totalPages: number;
  successCount: number;
  failedCount: number;
}

interface UseBatchProcessorReturn {
  processing: boolean;
  results: FileResult[];
  currentBatch: File[];
  batchProgress: BatchProgress;
  filePageProgress: FilePageProgress;
  currentFileIndex: number;
  totalFiles: number;
  processBatch: (selectedFiles: File[], onStart?: () => void, onComplete?: () => void) => Promise<void>;
  getSummary: () => SummaryStats;
  reset: () => void;
}

/**
 * useBatchProcessor - Custom hook for batch PDF processing
 *
 * Single Responsibility: Manage batch processing state and logic
 * Only handles file processing - timer and logs directory managed separately (SRP)
 *
 * @param {number} batchSize - Number of files to process in parallel
 * @param {FileSystemDirectoryHandle} logsDirectory - Directory handle for storing logs
 * @returns {UseBatchProcessorReturn} Batch processing state and methods
 */
export const useBatchProcessor = (
  batchSize: number = 5,
  logsDirectory: FileSystemDirectoryHandle | null = null
): UseBatchProcessorReturn => {
  // File processing state
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [currentBatch, setCurrentBatch] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({});
  const [filePageProgress, setFilePageProgress] = useState<FilePageProgress>({});

  // Counter state
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);

  /**
   * Process a single file with provided PDFManager instance
   */
  const processFileWithManager = async (file: File, pdfManager: ReturnType<typeof createPDFManager>): Promise<FileResult> => {
    try {
      // Mark file as processing
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: "processing", result: null },
      }));

      // Initialize page progress tracking
      setFilePageProgress((prev) => ({
        ...prev,
        [file.name]: { currentPage: 0, totalPages: 0 },
      }));

      // Pass callback to track page completion
      const fileResult = await pdfManager.processFile(file, (pageInfo) => {
        // Update page progress in real-time
        setFilePageProgress((prev) => ({
          ...prev,
          [file.name]: {
            currentPage: pageInfo.pageNumber,
            totalPages: pageInfo.totalPages,
          },
        }));
      });

      const result = {
        fileName: file.name,
        success: fileResult.success,
        totalPages: fileResult.totalPages,
        results: fileResult.results,
        error: fileResult.error || null,
      };

      // Mark file as complete
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: {
          status: fileResult.success ? "completed" : "failed",
          result,
        },
      }));

      // Append result to logs
      if (logsDirectory) {
        await LogWriter.appendFileResults(logsDirectory, file.name, result);
      }

      return result;
    } catch (error) {
      const result: FileResult = {
        fileName: file.name,
        success: false,
        totalPages: 0,
        results: {},
        error: error instanceof Error ? error.message : String(error),
      };

      // Mark file as failed
      setBatchProgress((prev) => ({
        ...prev,
        [file.name]: { status: "failed", result },
      }));

      // Append failed result to logs
      if (logsDirectory) {
        await LogWriter.appendFileResults(logsDirectory, file.name, result);
      }

      return result;
    }
  };

  /**
   * Process selected files in batches
   * @param {File[]} selectedFiles - Array of files to process
   * @param {Function} onStart - Callback when processing starts
   * @param {Function} onComplete - Callback when processing completes
   */
  const processBatch = async (
    selectedFiles: File[],
    onStart?: () => void,
    onComplete?: () => void
  ): Promise<void> => {
    if (selectedFiles.length === 0) {
      alert("No files selected");
      return;
    }

    // Check if logs directory is provided
    if (!logsDirectory) {
      alert("Logs directory is required for batch processing.");
      return;
    }

    setFiles(selectedFiles);
    setTotalFiles(selectedFiles.length);
    setProcessing(true);
    setResults([]);
    setCurrentFileIndex(0);
    setBatchProgress({});
    setFilePageProgress({});

    // Notify that processing has started
    if (onStart) onStart();

    const processedResults = [];

    try {
      // Process files in batches
      for (let i = 0; i < selectedFiles.length; i += batchSize) {
        const batch = selectedFiles.slice(i, i + batchSize);

        // Set current batch for display
        setCurrentBatch(batch);
        setBatchProgress({});
        setFilePageProgress({});

        // Create ONE instance of PDFManager for this batch
        const pdfManager = createPDFManager();

        // Process batch in parallel with the same PDFManager instance
        const batchPromises = batch.map((file) =>
          processFileWithManager(file, pdfManager)
        );
        const batchResults = await Promise.all(batchPromises);

        processedResults.push(...batchResults);
        setCurrentFileIndex(Math.min(i + batchSize, selectedFiles.length));
        setResults([...processedResults]);
      }
    } catch (error) {
      console.error("Batch processing error:", error);
      alert("Error during batch processing: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setProcessing(false);
      setCurrentBatch([]);
      setBatchProgress({});
      setFilePageProgress({});
      
      // Notify that processing has completed
      if (onComplete) onComplete();
    }
  };

  /**
   * Calculate summary statistics
   */
  const getSummary = (): SummaryStats => {
    let totalPages = 0;
    let successCount = 0;
    let failedCount = 0;

    results.forEach((result) => {
      totalPages += result.totalPages || 0;
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    });

    return { totalPages, successCount, failedCount };
  };

  /**
   * Reset all state
   */
  const reset = (): void => {
    setFiles([]);
    setProcessing(false);
    setResults([]);
    setCurrentBatch([]);
    setBatchProgress({});
    setFilePageProgress({});
    setCurrentFileIndex(0);
    setTotalFiles(0);
  };

  return {
    // State
    processing,
    results,
    currentBatch,
    batchProgress,
    filePageProgress,
    currentFileIndex,
    totalFiles,

    // Methods
    processBatch,
    getSummary,
    reset,
  };
};