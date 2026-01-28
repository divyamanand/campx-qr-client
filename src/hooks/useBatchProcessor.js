import { useState, useRef, useEffect } from "react";
import { createPDFManager } from "../PDFManager";
import { LogWriter } from "../LogWriter";

/**
 * useBatchProcessor - Custom hook for batch PDF processing
 * 
 * Single Responsibility: Manage batch processing state and logic
 * Separates processing logic from UI components (SRP)
 * Last updated: Force cache refresh
 */
export const useBatchProcessor = (batchSize = 5) => {
  // File processing state
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [currentBatch, setCurrentBatch] = useState([]);
  const [batchProgress, setBatchProgress] = useState({});
  const [filePageProgress, setFilePageProgress] = useState({});

  // Counter and timer state
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState(null);

  // Logs directory state
  const [logsDirectory, setLogsDirectory] = useState(null);

  // Refs for tracking
  const timerInterval = useRef(null);

  // Timer effect
  useEffect(() => {
    if (processing && startTime) {
      timerInterval.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 100);
    }
    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [processing, startTime]);

  /**
   * Select logs directory for storing results
   */
  const selectLogsDirectory = async () => {
    try {
      const dirHandle = await LogWriter.selectLogsDirectory();
      setLogsDirectory(dirHandle);
    } catch (error) {
      console.error("Error selecting logs directory:", error);
      alert("Error selecting logs directory: " + error.message);
    }
  };

  /**
   * Process a single file with provided PDFManager instance
   */
  const processFileWithManager = async (file, pdfManager) => {
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
      const result = {
        fileName: file.name,
        success: false,
        totalPages: 0,
        results: {},
        error: error.message,
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
   */
  const processBatch = async (selectedFiles) => {
    if (selectedFiles.length === 0) {
      alert("No files selected");
      return;
    }

    // Check if logs directory is selected
    if (!logsDirectory) {
      const userWantsToSelect = window.confirm(
        "Logs directory not selected. Select one now?"
      );
      if (userWantsToSelect) {
        await selectLogsDirectory();
        if (!logsDirectory) {
          alert("Logs directory selection cancelled. Batch processing aborted.");
          return;
        }
      } else {
        alert("Logs directory is required for batch processing.");
        return;
      }
    }

    setFiles(selectedFiles);
    setTotalFiles(selectedFiles.length);
    setProcessing(true);
    setResults([]);
    setCurrentFileIndex(0);
    setElapsedTime(0);
    setStartTime(Date.now());
    setBatchProgress({});
    setFilePageProgress({});

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
      alert("Error during batch processing: " + error.message);
    } finally {
      setProcessing(false);
      setCurrentBatch([]);
      setBatchProgress({});
      setFilePageProgress({});
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    }
  };

  /**
   * Calculate summary statistics
   */
  const getSummary = () => {
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
  const reset = () => {
    setFiles([]);
    setProcessing(false);
    setResults([]);
    setCurrentBatch([]);
    setBatchProgress({});
    setFilePageProgress({});
    setCurrentFileIndex(0);
    setTotalFiles(0);
    setElapsedTime(0);
    setStartTime(null);
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
    elapsedTime,
    logsDirectory,

    // Methods
    selectLogsDirectory,
    processBatch,
    getSummary,
    reset,
  };
};
