import { useState, useMemo, useCallback } from "react";
import "./App.css";
import { PDFManager } from "./PDFManager";
import { Logger, createLogEntry } from "./Logger";

function App() {
  const [filesQueue, setFilesQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);

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

    for (const currentItem of currentQueue) {
      if (currentItem.status !== "pending") continue;

      updateItemStatus(currentItem.id, "processing");

      try {
        // Create a new PDFManager for each file with config
        const manager = new PDFManager({
          initialScale: 3,
          maxScale: 9,
          minScale: 1,
          enableRotation: true,
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

        updateItemStatus(currentItem.id, "completed", {
          results: fileResults,
          progress: { current: fileResults.length, total: fileResults.length },
        });
      } catch (err) {
        console.error(err);
        addLog({ type: "error", message: err.message, fileName: currentItem.name });
        updateItemStatus(currentItem.id, "error", { error: err.message });
      }
    }

    setIsProcessing(false);
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Batch QR Scanner</h1>
        <p>Upload PDFs to detect barcodes & QRs</p>
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
  const { name, status, results, progress, error } = data;

  const stats = useMemo(() => {
    if (!results || results.length === 0) return { pages: 0, codes: 0 };

    const totalCodes = results.reduce((acc, pageResult) => {
      const pageSum = pageResult.qrs.reduce((sum, qr) => sum + (qr.ct || 0), 0);
      return acc + pageSum;
    }, 0);

    return {
      pages: results.length,
      codes: totalCodes,
    };
  }, [results]);

  const isProcessing = status === "processing";
  const isComplete = status === "completed";
  const hasData = isComplete && stats.codes > 0;

  const toggleExpand = () => {
    if (hasData) setExpanded(!expanded);
  };

  return (
    <div
      className={`card ${status} ${expanded ? "expanded" : ""}`}
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

export default App;
