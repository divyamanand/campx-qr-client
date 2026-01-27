import { useState, useEffect } from "react";
import "./App.css";
import { PDFManager } from "./PDFManager";
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
          <p>Disk-based batch processing with zero in-memory logs</p>
        </div>
        {isProcessing && (
          <div className="header-stats">
            <div className="stat-box">
              <span className="stat-value">{batchStats.processedFiles}</span>
              <span className="stat-label">Processed</span>
            </div>
            <div className="stat-box">
              <span className="stat-value">{batchStats.completedFiles}</span>
              <span className="stat-label">Completed</span>
            </div>
            {batchStats.errorFiles > 0 && (
              <div className="stat-box error">
                <span className="stat-value">{batchStats.errorFiles}</span>
                <span className="stat-label">Errors</span>
              </div>
            )}
            <div className="stat-box">
              <span className="stat-value">
                {formatTime(totalElapsedTime + liveElapsed)}
              </span>
              <span className="stat-label">Time</span>
            </div>
          </div>
        )}
      </header>

      <div className="batch-processing-panel">
        <h2>Batch Processing</h2>

        <div className="batch-input-group">
          <label>Primary Directory</label>
          <div className="batch-input-row">
            <input
              type="text"
              value={primaryDir}
              readOnly
              placeholder="No directory selected"
            />
            <button
              onClick={handleSelectDirectory}
              disabled={isProcessing}
              className="browse-btn"
            >
              Browse
            </button>
          </div>
          <p className="directory-help">
            Selected directory will be used as the primary folder. Logs will be stored in /logs and completed files moved to /completed.
          </p>
        </div>

        <button
          className="batch-start-btn"
          onClick={startBatchProcessing}
          disabled={!primaryDir || isProcessing}
        >
          {isProcessing
            ? `Processing... Batch ${batchStats.currentBatch} | File ${batchStats.currentFileInBatch}`
            : "Start Batch Processing"}
        </button>

        {isProcessing && (
          <div className="processing-info">
            <div className="current-file">
              <span className="label">Current File:</span>
              <span className="value">{batchStats.currentFileName}</span>
            </div>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-card-header">Batch Statistics</div>
          <div className="stats-card-body">
            <div className="stat-row">
              <span className="label">Total Files:</span>
              <span className="value">{batchStats.totalFiles}</span>
            </div>
            <div className="stat-row">
              <span className="label">Processed:</span>
              <span className="value">{batchStats.processedFiles}</span>
            </div>
            <div className="stat-row">
              <span className="label">Completed:</span>
              <span className="value success">{batchStats.completedFiles}</span>
            </div>
            <div className="stat-row">
              <span className="label">Errors:</span>
              <span className={`value ${batchStats.errorFiles > 0 ? "error" : ""}`}>
                {batchStats.errorFiles}
              </span>
            </div>
            <div className="stat-row">
              <span className="label">Current Batch:</span>
              <span className="value">{batchStats.currentBatch}</span>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-header">Storage Locations</div>
          <div className="stats-card-body">
            <div className="stat-row">
              <span className="label">Primary:</span>
              <span className="value small">{primaryDir || "Not set"}</span>
            </div>
            <div className="stat-row">
              <span className="label">Logs:</span>
              <span className="value small">{primaryDir}/logs</span>
            </div>
            <div className="stat-row">
              <span className="label">Completed:</span>
              <span className="value small">{primaryDir}/completed</span>
            </div>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-card-header">Memory Usage</div>
          <div className="stats-card-body">
            <div className="stat-row">
              <span className="label">Pattern:</span>
              <span className="value">Constant (5 PDFs)</span>
            </div>
            <div className="stat-row">
              <span className="label">Logging:</span>
              <span className="value">CSV on Disk</span>
            </div>
            <div className="stat-row">
              <span className="label">Pages:</span>
              <span className="value">Parallel</span>
            </div>
            <div className="stat-row">
              <span className="label">Files:</span>
              <span className="value">Sequential</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
