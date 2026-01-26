import { useState, useMemo, useCallback, useEffect } from "react";
import "./App.css";
import { PDFManager } from "./PDFManager";
import { Logger, createLogEntry } from "./Logger";
import { structures } from "./structures";
import { ErrorHandler } from "./ErrorHandler";
import { ErrorDisplay } from "./ErrorDisplay";

function App() {
  const [filesQueue, setFilesQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [processingStartTime, setProcessingStartTime] = useState(null);
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [fileErrors, setFileErrors] = useState({}); // Track errors by file ID

  // Live timer during processing
  useEffect(() => {
    if (!processingStartTime) {
      setLiveElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setLiveElapsed(Date.now() - processingStartTime);
    }, 100);
    return () => clearInterval(interval);
  }, [processingStartTime]);

  const handleFiles = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    const newQueueItems = selectedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      status: "pending",
      results: [],
      progress: { current: 0, total: 0 },
      error: null,
    }));

    setFilesQueue((prev) => [...prev, ...newQueueItems]);

    if (!isProcessing) {
      setTimeout(() => processQueue([...filesQueue, ...newQueueItems]), 0);
    }
  };

  const updateItemStatus = useCallback((id, status, extraData = {}) => {
    setFilesQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status, ...extraData } : item
      )
    );
  }, []);

  const addLog = useCallback((logData) => {
    setLogs((prev) => [...prev, createLogEntry(logData)]);
  }, []);

  const processQueue = async (currentQueue) => {
    setIsProcessing(true);
    const startTime = Date.now();
    setProcessingStartTime(startTime);

    // Collect all pending items
    const pendingItems = currentQueue.filter((item) => item.status === "pending");

    // Mark all as processing
    pendingItems.forEach((item) => {
      updateItemStatus(item.id, "processing");
    });

    // Create processing promises for all files in parallel
    const processingPromises = pendingItems.map(async (currentItem) => {
      try {
        // Create a new PDFManager for each file with config and structure
        // TODO: Allow user to select structure or auto-detect
        const manager = new PDFManager({
          initialScale: 3,
          maxScale: 9,
          minScale: 1,
          enableRotation: true,
          structure: structures[0], // Use first structure for now
        });

        // Process with progress and log callbacks
        await manager.processFile(
          currentItem.file,
          (progressData) => {
            updateItemStatus(currentItem.id, "processing", {
              progress: {
                current: progressData.pageNumber,
                total: progressData.totalPages,
              },
            });
          },
          addLog
        );

        // Get results formatted for UI
        const uiResults = manager.getResultsForUI();
        const fileResults = uiResults[0]?.results || [];

        // Validate results using ErrorHandler
        const errorHandler = new ErrorHandler(structures[0]);
        const scanResults = manager.getTheScanResults();
        const validationErrors = errorHandler.validate(scanResults, currentItem.name);

        // Store errors for this file
        setFileErrors((prev) => ({
          ...prev,
          [currentItem.id]: {
            errors: validationErrors,
            summary: errorHandler.getSummary(),
          },
        }));

        updateItemStatus(currentItem.id, "completed", {
          results: fileResults,
          progress: { current: fileResults.length, total: fileResults.length },
          validationErrors,
        });
      } catch (err) {
        console.error(err);
        addLog({ type: "error", message: err.message, fileName: currentItem.name });
        updateItemStatus(currentItem.id, "error", { error: err.message });
      }
    });

    // Wait for all files to complete processing
    await Promise.all(processingPromises);

    const endTime = Date.now();
    setTotalElapsedTime((prev) => prev + (endTime - startTime));
    setProcessingStartTime(null);
    setIsProcessing(false);
  };

  // Calculate stats for display
  const completedCount = filesQueue.filter((f) => f.status === "completed").length;
  const totalCount = filesQueue.length;
  const errorCount = filesQueue.filter((f) => f.status === "error").length;

  const formatTime = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-main">
          <h1>Batch QR Scanner</h1>
          <p>Upload PDFs to detect barcodes & QRs</p>
        </div>
        {totalCount > 0 && (
          <div className="header-stats">
            <div className="stat-box">
              <span className="stat-value">{completedCount}/{totalCount}</span>
              <span className="stat-label">Files</span>
            </div>
            {errorCount > 0 && (
              <div className="stat-box error">
                <span className="stat-value">{errorCount}</span>
                <span className="stat-label">Errors</span>
              </div>
            )}
            {(totalElapsedTime > 0 || liveElapsed > 0) && (
              <div className="stat-box">
                <span className="stat-value">
                  {formatTime(isProcessing ? totalElapsedTime + liveElapsed : totalElapsedTime)}
                </span>
                <span className="stat-label">Time</span>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="upload-zone">
        <label className="upload-btn">
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFiles}
          />
          <span>+ Upload PDFs</span>
        </label>
      </div>

      <Logger logs={logs} maxHeight={250} />

      <div className="cards-container">
        {filesQueue.map((item) => (
          <FileCard key={item.id} data={item} />
        ))}
      </div>
    </div>
  );
}

function FileCard({ data }) {
  const [expanded, setExpanded] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const { name, status, results, progress, error, validationErrors } = data;

  const stats = useMemo(() => {
    if (!results || results.length === 0) return { pages: 0, codes: 0, hasPartial: false };

    const totalCodes = results.reduce((acc, pageResult) => {
      const pageSum = pageResult.qrs.reduce((sum, qr) => sum + (qr.ct || 0), 0);
      return acc + pageSum;
    }, 0);

    // Check if any page has partial results (expected codes not found)
    const hasPartial = results.some((pageResult) => pageResult.partial === true);

    return {
      pages: results.length,
      codes: totalCodes,
      hasPartial,
    };
  }, [results]);

  const isProcessing = status === "processing";
  const isComplete = status === "completed";
  const hasData = isComplete && stats.codes > 0;
  const hasPartialResults = isComplete && stats.hasPartial;

  const toggleExpand = () => {
    if (hasData) setExpanded(!expanded);
  };

  return (
    <div
      className={`card ${status} ${expanded ? "expanded" : ""} ${hasPartialResults ? "partial" : ""}`}
      onClick={toggleExpand}
    >
      <div className="card-header">
        <div className="header-top">
          <div className="filename" title={name}>
            {name}
          </div>
          <div className="status-indicator">
            {isProcessing && <div className="spinner"></div>}
            {isComplete && !error && <span className="icon-success">✓</span>}
            {status === "error" && <span className="icon-error">!</span>}
            {status === "pending" && <span className="icon-wait">•••</span>}
          </div>
        </div>

        <div className="meta-info">
          <div className="stats-block">
            {isProcessing && (
              <span>
                Scanning page {progress.current}/{progress.total || "?"}...
              </span>
            )}
            {status === "pending" && <span>Queued</span>}
            {status === "error" && <span>Failed</span>}

            {isComplete && (
              <>
                <span className="stat-item">
                  <b>{stats.pages}</b> pgs
                </span>
                <span className="divider">•</span>
                <span
                  className={`stat-item ${stats.codes > 0 ? "highlight" : ""}`}
                >
                  <b>{stats.codes}</b> codes
                </span>
              </>
            )}
          </div>

          {hasData && (
            <span className={`chevron ${expanded ? "rotate" : ""}`}>▼</span>
          )}

          {validationErrors && validationErrors.length > 0 && (
            <button
              className="error-toggle-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowErrors(!showErrors);
              }}
            >
              {validationErrors.length} Issue{validationErrors.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {validationErrors && validationErrors.length > 0 && showErrors && (
        <div className="card-errors">
          <ErrorDisplay errors={validationErrors} fileName={name} structure={structures[0]} />
        </div>
      )}

      {expanded && hasData && (
        <div className="card-body">
          {results.map((pageRes) => (
            <div key={pageRes.page} className="page-row">
              <div className="page-label">
                Page {pageRes.page}
                {pageRes.scale && (
                  <span className="scale-badge">@{pageRes.scale}x</span>
                )}
                {pageRes.rotated && <span className="rotated-badge">↻</span>}
              </div>

              {!pageRes.qrs.some((q) => q.ct > 0) && (
                <span className="no-code-msg">No codes on this page</span>
              )}

              {pageRes.qrs.map(
                (qr, idx) =>
                  qr.ct > 0 && (
                    <div key={idx} className="qr-pill">
                      <span className="qr-fmt">{qr.format}</span>
                      <span className="qr-txt">{qr.data}</span>
                    </div>
                  )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
