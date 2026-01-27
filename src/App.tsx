import { useState, useCallback, useEffect, ReactNode, FC, FormEvent } from "react";
import "./App.css";
import { PDFManager, FileResult, OnPageComplete, OnLog } from "./PDFManager";
import { Logger, createLogEntry, LogEntry } from "./Logger";

/**
 * File queue item interface
 */
interface FileQueueItem {
  id: string;
  file: File;
  name: string;
  status: "pending" | "processing" | "completed" | "error";
  results: unknown[];
  progress: {
    current: number;
    total: number;
  };
  error: string | null;
}

/**
 * Main App component
 */
const App: FC = () => {
  const [filesQueue, setFilesQueue] = useState<FileQueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(
    null
  );
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState(0);

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

  const handleFiles = (e: FormEvent<HTMLInputElement>): void => {
    const input = e.currentTarget;
    const selectedFiles = Array.from(input.files || []);
    if (selectedFiles.length === 0) return;

    const newQueueItems: FileQueueItem[] = selectedFiles.map((file) => ({
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
      setTimeout(
        () => processQueue([...filesQueue, ...newQueueItems]),
        0
      );
    }
  };

  const updateItemStatus = useCallback(
    (id: string, status: FileQueueItem["status"], extraData: Partial<FileQueueItem> = {}): void => {
      setFilesQueue((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status, ...extraData } : item
        )
      );
    },
    []
  );

  const addLog = useCallback((logData: Record<string, unknown>): void => {
    setLogs((prev) => [...prev, createLogEntry(logData)]);
  }, []);

  const processQueue = async (currentQueue: FileQueueItem[]): Promise<void> => {
    setIsProcessing(true);
    const startTime = Date.now();
    setProcessingStartTime(startTime);

    // Collect all pending items
    const pendingItems = currentQueue.filter(
      (item) => item.status === "pending"
    );

    // Mark all as processing
    pendingItems.forEach((item) => {
      updateItemStatus(item.id, "processing");
    });

    // Create processing promises for all files in sequence
    for (const currentItem of pendingItems) {
      try {
        // Create a new PDFManager for each file
        const manager = new PDFManager({
          initialScale: 1,
          maxScale: 3,
        });

        // Process with progress and log callbacks
        const onPageComplete: OnPageComplete = (progressData) => {
          updateItemStatus(currentItem.id, "processing", {
            progress: {
              current: progressData.pageNumber,
              total: progressData.totalPages,
            },
          });
        };

        const onLog: OnLog = (logEntry) => {
          addLog(logEntry);
        };

        const fileResult: FileResult = await manager.processFile(
          currentItem.file,
          onPageComplete,
          onLog
        );

        // Format results for UI
        const fileResults = Object.entries(
          fileResult.pages || {}
        ).map(([pageNum, pageData]) => ({
          page: parseInt(pageNum),
          codes: pageData.codes || [],
          scale: pageData.scale,
          attempts: pageData.attempts,
          success: pageData.success,
          error: pageData.error,
        }));

        updateItemStatus(currentItem.id, "completed", {
          results: fileResults,
          progress: {
            current: fileResults.length,
            total: fileResults.length,
          },
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        addLog({
          type: "error",
          message: errorMsg,
          fileName: currentItem.name,
        });
        updateItemStatus(currentItem.id, "error", {
          error: errorMsg,
        });
      }
    }

    const endTime = Date.now();
    setTotalElapsedTime((prev) => prev + (endTime - startTime));
    setProcessingStartTime(null);
    setIsProcessing(false);
  };

  // Calculate stats for display
  const completedCount = filesQueue.filter(
    (f) => f.status === "completed"
  ).length;
  const totalCount = filesQueue.length;
  const errorCount = filesQueue.filter((f) => f.status === "error").length;

  const formatTime = (ms: number): string => {
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
          <h1>PDF QR Scanner</h1>
          <p>Upload PDFs to detect QR codes</p>
        </div>
        {totalCount > 0 && (
          <div className="header-stats">
            <div className="stat-box">
              <span className="stat-value">
                {completedCount}/{totalCount}
              </span>
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
                  {formatTime(
                    isProcessing
                      ? totalElapsedTime + liveElapsed
                      : totalElapsedTime
                  )}
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
};

/**
 * File card component for displaying individual file status
 */
interface FileCardProps {
  data: FileQueueItem;
}

const FileCard: FC<FileCardProps> = ({ data }) => {
  const [expanded, setExpanded] = useState(false);
  const { name, status, results, progress, error } = data;

  const isProcessing = status === "processing";
  const isComplete = status === "completed";
  const hasData = isComplete && Array.isArray(results) && results.length > 0;

  const toggleExpand = (): void => {
    if (hasData) setExpanded(!expanded);
  };

  const resultCount = Array.isArray(results) ? results.length : 0;

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
            {isComplete && !error && (
              <span className="icon-success">✓</span>
            )}
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
            {status === "error" && <span>Failed: {error}</span>}

            {isComplete && (
              <>
                <span className="stat-item">
                  <b>{resultCount}</b> pages
                </span>
              </>
            )}
          </div>

          {hasData && (
            <span className={`chevron ${expanded ? "rotate" : ""}`}>
              ▼
            </span>
          )}
        </div>
      </div>

      {expanded && hasData && (
        <div className="card-body">
          {results.map((result: unknown, idx: number) => {
            const pageResult = result as Record<string, unknown>;
            return (
              <div key={idx} className="page-row">
                <div className="page-label">
                  Page {pageResult.page}
                  {pageResult.scale && (
                    <span className="scale-badge">
                      @{pageResult.scale}x
                    </span>
                  )}
                </div>

                {Array.isArray(pageResult.codes) && pageResult.codes.length === 0 && (
                  <span className="no-code-msg">No QR codes</span>
                )}

                {Array.isArray(pageResult.codes) &&
                  pageResult.codes.map((code: unknown, codeIdx: number) => {
                    const qrCode = code as Record<string, unknown>;
                    return (
                      <div key={codeIdx} className="qr-pill">
                        <span className="qr-txt">{qrCode.data}</span>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default App;
