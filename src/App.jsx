import { useState, useMemo } from "react";
import "./App.css";
import { useImageScanner } from "./useImageScanner";
import { usePdfToImages } from "./usePDF";

function App() {
  const { convert } = usePdfToImages({ scale: 1 });
  const { scanImages } = useImageScanner();

  const [filesQueue, setFilesQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFiles = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;

    const newQueueItems = selectedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      status: "pending",
      results: [],
      error: null,
    }));

    setFilesQueue((prev) => [...prev, ...newQueueItems]);

    if (!isProcessing) {
      setTimeout(() => processQueue([...filesQueue, ...newQueueItems]), 0);
    }
  };

  const processQueue = async (currentQueue) => {
    setIsProcessing(true);
    let queueCopy = [...currentQueue];

    for (let i = 0; i < queueCopy.length; i++) {
      if (queueCopy[i].status !== "pending") continue;
      const currentItem = queueCopy[i];

      updateItemStatus(currentItem.id, "processing");

      try {
        const images = await convert(currentItem.file);
        const scanResults = await scanImages(images);
        updateItemStatus(currentItem.id, "completed", { results: scanResults });
      } catch (err) {
        console.error(err);
        updateItemStatus(currentItem.id, "error", { error: err.message });
      }
    }
    setIsProcessing(false);
  };

  const updateItemStatus = (id, status, extraData = {}) => {
    setFilesQueue((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status, ...extraData } : item
      )
    );
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
  const { name, status, results, error } = data;

  // --- FIXED STATS CALCULATION ---
  const stats = useMemo(() => {
    if (!results || results.length === 0) return { pages: 0, codes: 0 };

    // Sum the 'ct' property from every QR/Barcode found on every page
    const totalCodes = results.reduce((acc, pageResult) => {
      const pageSum = pageResult.qrs.reduce((sum, qr) => sum + (qr.ct || 0), 0);
      return acc + pageSum;
    }, 0);

    return {
      pages: results.length,
      codes: totalCodes
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
      className={`card ${status} ${expanded ? 'expanded' : ''}`}
      onClick={toggleExpand}
    >
      <div className="card-header">
        <div className="header-top">
          <div className="filename" title={name}>{name}</div>
          <div className="status-indicator">
            {isProcessing && <div className="spinner"></div>}
            {isComplete && !error && <span className="icon-success">✓</span>}
            {status === "error" && <span className="icon-error">!</span>}
            {status === "pending" && <span className="icon-wait">•••</span>}
          </div>
        </div>

        <div className="meta-info">
          <div className="stats-block">
            {isProcessing && <span>Scanning...</span>}
            {status === "pending" && <span>Queued</span>}
            {status === "error" && <span>Failed</span>}

            {isComplete && (
              <>
                <span className="stat-item"><b>{stats.pages}</b> pgs</span>
                <span className="divider">•</span>
                <span className={`stat-item ${stats.codes > 0 ? 'highlight' : ''}`}>
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
              <div className="page-label">Page {pageRes.page}</div>
              
              {/* Only show "No codes" if that specific page has 0 valid codes */}
              {(!pageRes.qrs.some(q => q.ct > 0)) && (
                <span className="no-code-msg">No codes on this page</span>
              )}

              {pageRes.qrs.map((qr, idx) => (
                /* Only render actual results, skip error/empty placeholders if you prefer, 
                   or render them differently. Here we render everything with data. */
                qr.ct > 0 && (
                  <div key={idx} className="qr-pill">
                    <span className="qr-fmt">{qr.format}</span>
                    <span className="qr-txt">{qr.data}</span>
                  </div>
                )
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;