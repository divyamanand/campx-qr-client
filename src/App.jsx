import { useState, useMemo, useCallback, useEffect } from "react";
import "./App.css";
import { PDFManager } from "./PDFManager";
import { Logger, createLogEntry } from "./Logger";
import { structures } from "./structures";
import { createElectronFileLogger } from "./ElectronFileLogger";
import { createElectronBatchProcessor } from "./ElectronBatchProcessor";

function App() {
  const [mode, setMode] = useState("upload"); // "upload" or "batch"
  const [primaryDir, setPrimaryDir] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStartTime, setProcessingStartTime] = useState(null);
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState(0);

  // Batch mode counters and tracking (no in-memory logs!)
  const [batchStats, setBatchStats] = useState({
    totalFiles: 0,
    processedFiles: 0,
    completedFiles: 0,
    errorFiles: 0,
    currentBatch: 0,
    currentFileInBatch: 0,
    currentFileName: "",
  });

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

  // Handle batch mode directory selection
  const handleSelectDirectory = async () => {
    try {
      const dirPath = await window.electronAPI?.dialog?.selectDirectory?.();
      if (dirPath) {
        setPrimaryDir(dirPath);
      }
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  };

  // Start batch processing
  const startBatchProcessing = async () => {
    if (!primaryDir) return;

    setIsProcessing(true);
    const startTime = Date.now();
    setProcessingStartTime(startTime);

    try {
      // Initialize file logger (CSV on disk)
      const logger = createElectronFileLogger(
        `${primaryDir}/logs`,
        `batch-${Date.now()}.csv`
      );
      await logger.initialize();

      // Create batch processor
      const processor = createElectronBatchProcessor(primaryDir, {
        initialScale: 3,
        maxScale: 9,
        minScale: 1,
        enableRotation: true,
        structure: structures[0],
      });

      processor.setFileLogger(logger);

      // Process all batches - only update counters, NO logs in memory
      await processor.processBatches((progress) => {
        setBatchStats((prev) => ({
          ...prev,
          currentBatch: progress.batchNumber,
          currentFileInBatch: progress.currentFile,
          currentFileName: progress.fileName,
          processedFiles: prev.processedFiles + 1,
          completedFiles: progress.success
            ? prev.completedFiles + 1
            : prev.completedFiles,
          errorFiles: !progress.success ? prev.errorFiles + 1 : prev.errorFiles,
        }));
      }, { PDFManager, structures });

      await logger.close();
    } catch (err) {
      console.error("Batch processing failed:", err);
    } finally {
      const endTime = Date.now();
      setTotalElapsedTime((prev) => prev + (endTime - startTime));
      setProcessingStartTime(null);
      setIsProcessing(false);
    }
  };

  // Upload mode is now deprecated - not used
  // All operations go through batch mode with disk-based logging

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

      <div className="control-panel">
        <div className="mode-selector">
          <button
            className={`mode-btn ${!batchMode ? "active" : ""}`}
            onClick={() => setBatchMode(false)}
          >
            Upload Mode
          </button>
          <button
            className={`mode-btn ${batchMode ? "active" : ""}`}
            onClick={() => setBatchMode(true)}
          >
            Batch Mode
          </button>
        </div>
      </div>

      <div className="upload-zone">
        {!batchMode ? (
          <label className="upload-btn">
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFiles}
              disabled={isProcessing}
            />
            <span>+ Upload PDFs</span>
          </label>
        ) : (
          <BatchModeControls
            isProcessing={isProcessing}
            onStart={processBatch}
          />
        )}
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
  const { name, status, results, progress, error } = data;

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
        </div>
      </div>

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

function BatchModeControls({ isProcessing, onStart }) {
  const handleBatchFilesSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
      onStart(selectedFiles);
    }
  };

  return (
    <div className="batch-mode-controls">
      <label className="batch-upload-label">
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleBatchFilesSelect}
          disabled={isProcessing}
        />
        <span>
          {isProcessing ? "Processing..." : "+ Select PDFs for Batch Processing"}
        </span>
      </label>
      <p className="batch-help-text">
        Select multiple PDF files to process them in batches of 5. Files will be processed sequentially with logs stored in your browser.
      </p>
    </div>
  );
}

export default App;
